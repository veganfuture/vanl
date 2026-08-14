import { timingSafeEqual } from "node:crypto";
import { loadConfig, type AppConfig } from "~/lib/config";
import { sql } from "~/lib/db";
import { logger } from "~/lib/logger";
import { AccountName } from "./account_name";
import { AuthRepository } from "./auth_repository";
import { sendOtpViaBot } from "./bot-client";
import {
  buildDeleteCookie,
  buildSetCookie,
  parseCookies,
  REMEMBERED_ACCOUNT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "./cookies";
import { generateOtpCode, hashOtpCode, OTP_CHALLENGE_TTL_SECONDS } from "./otp";
import { generateSessionToken, hashSessionToken, SESSION_TTL_SECONDS } from "./session";
import { SignalAci } from "./signal_aci";
import { verifySignupToken } from "./signup-token";
import type { User } from "./user";
import type { UserId } from "./user_id";

export type AuthConfig = AppConfig["auth"];

export type CompleteSignupInput = {
  token: string;
  accountName: string;
  email: string;
  displayName: string;
  affiliationsNote: string | null;
};

export type CompleteSignupResult =
  | { user: User; setCookieHeaders: string[] }
  | { error: "invalid_token" | "already_used" | "account_name_taken" | "validation" };

export type StartLoginResult = { ok: true } | { error: "account_not_found" };

export type VerifyLoginResult =
  | { user: User; setCookieHeaders: string[] }
  | { error: "account_not_found" | "no_active_challenge" | "wrong_code" | "attempts_exhausted" };

// Browsers (Chrome since 2023) cap Set-Cookie Max-Age at 400 days regardless
// of what's requested — this is as close to "remembered indefinitely" as a
// cookie can actually get.
const REMEMBERED_ACCOUNT_TTL_SECONDS = 400 * 24 * 60 * 60;

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly config: AuthConfig,
  ) {}

  /** GET-time check before showing the signup form — does not consume the nonce. */
  async inspectSignupToken(
    token: string,
  ): Promise<{ aci: SignalAci } | { error: "invalid" | "already_used" }> {
    let payload;
    try {
      payload = await verifySignupToken(this.config.signup_public_key, token);
    } catch (cause) {
      logger.warn({ err: cause }, "rejected signup token at inspect time");
      return { error: "invalid" };
    }

    const aci = SignalAci.from_string(payload.aci);
    if (!(aci instanceof SignalAci)) {
      // A validly-signed token should always carry a real UUID — the bot only
      // ever signs envelope.source_uuid. Reaching here means bot and website
      // have drifted out of agreement on the payload format, not user error.
      logger.error({ err: aci.message }, "well-signed signup token had a non-UUID aci");
      return { error: "invalid" };
    }

    if (await this.repository.isSignupNonceUsed(payload.nonce)) {
      return { error: "already_used" };
    }

    return { aci };
  }

  async completeSignup(input: CompleteSignupInput): Promise<CompleteSignupResult> {
    let payload;
    try {
      payload = await verifySignupToken(this.config.signup_public_key, input.token);
    } catch (cause) {
      logger.warn({ err: cause }, "rejected signup token at completion time");
      return { error: "invalid_token" };
    }

    const aci = SignalAci.from_string(payload.aci);
    if (!(aci instanceof SignalAci)) {
      // Same reasoning as inspectSignupToken: a well-signed token with a
      // non-UUID aci means bot/website have drifted, not a user mistake.
      logger.error({ err: aci.message }, "well-signed signup token had a non-UUID aci");
      return { error: "invalid_token" };
    }

    const accountName = AccountName.from_string(input.accountName);
    if (!(accountName instanceof AccountName)) {
      logger.warn({ err: accountName.message }, "signup rejected: invalid account name");
      return { error: "validation" };
    }

    if (!input.email.trim() || !input.displayName.trim()) {
      return { error: "validation" };
    }

    let result;
    try {
      result = await this.repository.createUserFromSignup(
        {
          signalAci: aci,
          accountName,
          email: input.email.trim(),
          displayName: input.displayName.trim(),
          affiliationsNote: input.affiliationsNote?.trim() || null,
        },
        payload.nonce,
      );
    } catch (cause) {
      if (isUniqueViolation(cause)) {
        logger.warn(
          { accountName: accountName.value, err: cause },
          "signup rejected: account name already taken",
        );
        return { error: "account_name_taken" };
      }
      throw cause;
    }

    if (result === "nonce_already_used") {
      return { error: "already_used" };
    }

    await this.ensureBootstrapAdminRole(result);
    const setCookieHeaders = await this.startSession(result.id, result.accountName);
    return { user: result, setCookieHeaders };
  }

  async startLogin(accountNameRaw: string): Promise<StartLoginResult> {
    const user = await this.repository.findUserByAccountName(accountNameRaw.trim());
    if (!user) {
      return { error: "account_not_found" };
    }

    const code = generateOtpCode();
    await this.repository.insertLoginChallenge({
      userId: user.id,
      codeHash: hashOtpCode(code),
      expiresAt: new Date(Date.now() + OTP_CHALLENGE_TTL_SECONDS * 1000),
    });
    await sendOtpViaBot(user.signalAci.value, code);
    return { ok: true };
  }

  async verifyLogin(accountNameRaw: string, code: string): Promise<VerifyLoginResult> {
    const user = await this.repository.findUserByAccountName(accountNameRaw.trim());
    if (!user) {
      return { error: "account_not_found" };
    }

    const challenge = await this.repository.findLatestActiveLoginChallenge(user.id);
    if (!challenge) {
      return { error: "no_active_challenge" };
    }

    if (!hashesEqual(hashOtpCode(code), challenge.codeHash)) {
      const remaining = await this.repository.decrementLoginChallengeAttempts(challenge.id);
      return remaining <= 0 ? { error: "attempts_exhausted" } : { error: "wrong_code" };
    }

    await this.ensureBootstrapAdminRole(user);
    const setCookieHeaders = await this.startSession(user.id, user.accountName);
    return { user, setCookieHeaders };
  }

  async getSessionUser(cookieHeader: string | null): Promise<User | null> {
    const token = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
    if (!token) {
      return null;
    }
    const session = await this.repository.findActiveSessionByTokenHash(hashSessionToken(token));
    if (!session) {
      return null;
    }
    return this.repository.findUserById(session.userId);
  }

  async logout(cookieHeader: string | null): Promise<string[]> {
    const token = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
    if (token) {
      await this.repository.revokeSessionByTokenHash(hashSessionToken(token));
    }
    return [buildDeleteCookie(SESSION_COOKIE_NAME)];
  }

  private async startSession(userId: UserId, accountName: AccountName): Promise<string[]> {
    const token = generateSessionToken();
    await this.repository.insertSession({
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    });
    return [
      buildSetCookie(SESSION_COOKIE_NAME, token, { maxAgeSeconds: SESSION_TTL_SECONDS }),
      buildSetCookie(REMEMBERED_ACCOUNT_COOKIE_NAME, accountName.value, {
        maxAgeSeconds: REMEMBERED_ACCOUNT_TTL_SECONDS,
        httpOnly: false,
      }),
    ];
  }

  private async ensureBootstrapAdminRole(user: User): Promise<void> {
    if (this.config.site_admin_account_names.includes(user.accountName.value)) {
      await this.repository.ensureGlobalRole(user.id, "site_admin");
    }
  }
}

function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isUniqueViolation(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code: unknown }).code === "23505"
  );
}

export const authService = new AuthService(new AuthRepository(sql), loadConfig().auth);
