import { timingSafeEqual } from "node:crypto";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { loadConfig, type AppConfig } from "~/lib/config";
import { sql } from "~/lib/db";
import { logger } from "~/lib/logger";
import { AccountName } from "./account_name";
import { AuthRepository, type ActiveLoginChallenge, type DbError } from "./auth_repository";
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

export type CompleteSignupSuccess = { user: User; setCookieHeaders: string[] };
export type CompleteSignupError =
  "invalid_token" | "already_used" | "account_name_taken" | "validation" | "internal_error";

export type StartLoginError = "account_not_found" | "internal_error";

export type VerifyLoginSuccess = { user: User; setCookieHeaders: string[] };
export type VerifyLoginError =
  | "account_not_found"
  | "no_active_challenge"
  | "wrong_code"
  | "attempts_exhausted"
  | "internal_error";

export type InspectSignupTokenError = "invalid" | "already_used" | "internal_error";

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
  inspectSignupToken(token: string): ResultAsync<SignalAci, InspectSignupTokenError> {
    return verifySignupToken(this.config.signup_public_key, token)
      .mapErr((cause): InspectSignupTokenError => {
        logger.warn({ err: cause }, "rejected signup token at inspect time");
        return "invalid";
      })
      .andThen((payload) => {
        const aciResult = SignalAci.from_string(payload.aci);
        if (aciResult.isErr()) {
          // A validly-signed token should always carry a real UUID — the bot
          // only ever signs envelope.source_uuid. Reaching here means bot and
          // website have drifted out of agreement on the payload format, not
          // user error.
          logger.error({ err: aciResult.error }, "well-signed signup token had a non-UUID aci");
          return errAsync<SignalAci, InspectSignupTokenError>("invalid");
        }

        return this.repository
          .isSignupNonceUsed(payload.nonce)
          .mapErr((dbError): InspectSignupTokenError => {
            logger.error({ err: dbError }, "failed to check signup nonce usage");
            return "internal_error";
          })
          .andThen((used): ResultAsync<SignalAci, InspectSignupTokenError> =>
            used ? errAsync("already_used") : okAsync(aciResult.value),
          );
      });
  }

  completeSignup(
    input: CompleteSignupInput,
  ): ResultAsync<CompleteSignupSuccess, CompleteSignupError> {
    return verifySignupToken(this.config.signup_public_key, input.token)
      .mapErr((cause): CompleteSignupError => {
        logger.warn({ err: cause }, "rejected signup token at completion time");
        return "invalid_token";
      })
      .andThen((payload) => {
        const aciResult = SignalAci.from_string(payload.aci);
        if (aciResult.isErr()) {
          // Same reasoning as inspectSignupToken: a well-signed token with a
          // non-UUID aci means bot/website have drifted, not a user mistake.
          logger.error({ err: aciResult.error }, "well-signed signup token had a non-UUID aci");
          return errAsync<never, CompleteSignupError>("invalid_token");
        }

        const accountNameResult = AccountName.from_string(input.accountName);
        if (accountNameResult.isErr()) {
          logger.warn({ err: accountNameResult.error }, "signup rejected: invalid account name");
          return errAsync<never, CompleteSignupError>("validation");
        }

        if (!input.email.trim() || !input.displayName.trim()) {
          return errAsync<never, CompleteSignupError>("validation");
        }

        const aci = aciResult.value;
        const accountName = accountNameResult.value;

        return this.repository
          .createUserFromSignup(
            {
              signalAci: aci,
              accountName,
              email: input.email.trim(),
              displayName: input.displayName.trim(),
              affiliationsNote: input.affiliationsNote?.trim() || null,
            },
            payload.nonce,
          )
          .mapErr((dbError): CompleteSignupError => {
            if (isUniqueViolation(dbError.cause)) {
              logger.warn(
                { accountName: accountName.value, err: dbError },
                "signup rejected: account name already taken",
              );
              return "account_name_taken";
            }
            logger.error({ err: dbError }, "failed to create user from signup");
            return "internal_error";
          })
          .andThen((created): ResultAsync<User, CompleteSignupError> =>
            created === "nonce_already_used" ? errAsync("already_used") : okAsync(created),
          )
          .andThen((user) =>
            this.ensureBootstrapAdminRole(user)
              .andThen(() => this.startSession(user.id, user.accountName))
              .mapErr((dbError): CompleteSignupError => {
                logger.error({ err: dbError }, "failed to finish signup after creating user");
                return "internal_error";
              })
              .map((setCookieHeaders) => ({ user, setCookieHeaders })),
          );
      });
  }

  startLogin(accountNameRaw: string): ResultAsync<void, StartLoginError> {
    return this.repository
      .findUserByAccountName(accountNameRaw.trim())
      .mapErr((dbError): StartLoginError => {
        logger.error({ err: dbError }, "failed to look up user for login start");
        return "internal_error";
      })
      .andThen((user): ResultAsync<User, StartLoginError> =>
        user ? okAsync(user) : errAsync("account_not_found"),
      )
      .andThen((user) => {
        const code = generateOtpCode();
        return this.repository
          .insertLoginChallenge({
            userId: user.id,
            codeHash: hashOtpCode(code),
            expiresAt: new Date(Date.now() + OTP_CHALLENGE_TTL_SECONDS * 1000),
          })
          .mapErr((dbError): StartLoginError => {
            logger.error({ err: dbError }, "failed to insert login challenge");
            return "internal_error";
          })
          .andThen(() =>
            sendOtpViaBot(user.signalAci.value, code).mapErr((sendError): StartLoginError => {
              logger.error({ err: sendError }, "failed to send OTP via bot");
              return "internal_error";
            }),
          );
      });
  }

  verifyLogin(
    accountNameRaw: string,
    code: string,
  ): ResultAsync<VerifyLoginSuccess, VerifyLoginError> {
    return this.repository
      .findUserByAccountName(accountNameRaw.trim())
      .mapErr((dbError): VerifyLoginError => {
        logger.error({ err: dbError }, "failed to look up user for login verify");
        return "internal_error";
      })
      .andThen((user): ResultAsync<User, VerifyLoginError> =>
        user ? okAsync(user) : errAsync("account_not_found"),
      )
      .andThen((user) =>
        this.repository
          .findLatestActiveLoginChallenge(user.id)
          .mapErr((dbError): VerifyLoginError => {
            logger.error({ err: dbError }, "failed to look up login challenge");
            return "internal_error";
          })
          .andThen(
            (
              challenge,
            ): ResultAsync<{ user: User; challenge: ActiveLoginChallenge }, VerifyLoginError> =>
              challenge ? okAsync({ user, challenge }) : errAsync("no_active_challenge"),
          ),
      )
      .andThen(({ user, challenge }) => {
        if (hashesEqual(hashOtpCode(code), challenge.codeHash)) {
          return this.ensureBootstrapAdminRole(user)
            .andThen(() => this.startSession(user.id, user.accountName))
            .mapErr((dbError): VerifyLoginError => {
              logger.error({ err: dbError }, "failed to finish login after verifying code");
              return "internal_error";
            })
            .map((setCookieHeaders) => ({ user, setCookieHeaders }));
        }
        return this.repository
          .decrementLoginChallengeAttempts(challenge.id)
          .mapErr((dbError): VerifyLoginError => {
            logger.error({ err: dbError }, "failed to decrement login challenge attempts");
            return "internal_error";
          })
          .andThen((remaining): ResultAsync<VerifyLoginSuccess, VerifyLoginError> =>
            errAsync(remaining <= 0 ? "attempts_exhausted" : "wrong_code"),
          );
      });
  }

  getSessionUser(cookieHeader: string | null): ResultAsync<User | null, never> {
    const token = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
    if (!token) {
      return okAsync(null);
    }
    return this.repository
      .findActiveSessionByTokenHash(hashSessionToken(token))
      .andThen((session): ResultAsync<User | null, DbError> =>
        session ? this.repository.findUserById(session.userId) : okAsync(null),
      )
      .orElse((dbError) => {
        logger.error({ err: dbError }, "failed to look up session user");
        return okAsync(null);
      });
  }

  logout(cookieHeader: string | null): ResultAsync<string[], never> {
    const token = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
    if (!token) {
      return okAsync([buildDeleteCookie(SESSION_COOKIE_NAME)]);
    }
    return this.repository
      .revokeSessionByTokenHash(hashSessionToken(token))
      .map(() => [buildDeleteCookie(SESSION_COOKIE_NAME)])
      .orElse((dbError) => {
        logger.error({ err: dbError }, "failed to revoke session during logout");
        return okAsync([buildDeleteCookie(SESSION_COOKIE_NAME)]);
      });
  }

  private startSession(userId: UserId, accountName: AccountName): ResultAsync<string[], DbError> {
    const token = generateSessionToken();
    return this.repository
      .insertSession({
        userId,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      })
      .map(() => [
        buildSetCookie(SESSION_COOKIE_NAME, token, { maxAgeSeconds: SESSION_TTL_SECONDS }),
        buildSetCookie(REMEMBERED_ACCOUNT_COOKIE_NAME, accountName.value, {
          maxAgeSeconds: REMEMBERED_ACCOUNT_TTL_SECONDS,
          httpOnly: false,
        }),
      ]);
  }

  private ensureBootstrapAdminRole(user: User): ResultAsync<void, DbError> {
    if (this.config.site_admin_account_names.includes(user.accountName.value)) {
      return this.repository.ensureGlobalRole(user.id, "site_admin");
    }
    return okAsync(undefined);
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
