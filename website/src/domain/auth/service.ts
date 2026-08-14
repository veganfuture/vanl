import { timingSafeEqual } from "node:crypto";
import { loadConfig } from "~/lib/config";
import { logger } from "~/lib/logger";
import { sendOtpViaBot } from "./bot-client";
import {
  buildDeleteCookie,
  buildSetCookie,
  parseCookies,
  REMEMBERED_ACCOUNT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "./cookies";
import {
  decrementLoginChallengeAttempts,
  ensureGlobalRole,
  findActiveSessionByTokenHash,
  findLatestActiveLoginChallenge,
  findUserByAccountName,
  findUserById,
  insertLoginChallenge,
  insertSession,
  isSignupNonceUsed,
  revokeSessionByTokenHash,
  createUserFromSignup,
} from "./repository";
import { generateOtpCode, hashOtpCode, OTP_CHALLENGE_TTL_SECONDS } from "./otp";
import { generateSessionToken, hashSessionToken, SESSION_TTL_SECONDS } from "./session";
import { verifySignupToken } from "./signup-token";
import { parseAccountName, parseSignalAci, type SignalAci, type User } from "./types";

/** GET-time check before showing the signup form — does not consume the nonce. */
export async function inspectSignupToken(
  token: string,
): Promise<{ aci: SignalAci } | { error: "invalid" | "already_used" }> {
  const config = loadConfig();
  let payload;
  try {
    payload = await verifySignupToken(config.auth.signup_public_key, token);
  } catch (cause) {
    logger.warn({ err: cause }, "rejected signup token at inspect time");
    return { error: "invalid" };
  }

  let aci: SignalAci;
  try {
    aci = parseSignalAci(payload.aci);
  } catch (cause) {
    // A validly-signed token should always carry a real UUID — the bot only
    // ever signs envelope.source_uuid. Reaching here means bot and website
    // have drifted out of agreement on the payload format, not user error.
    logger.error({ err: cause }, "well-signed signup token had a non-UUID aci");
    return { error: "invalid" };
  }

  if (await isSignupNonceUsed(payload.nonce)) {
    return { error: "already_used" };
  }

  return { aci };
}

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

export async function completeSignup(input: CompleteSignupInput): Promise<CompleteSignupResult> {
  const config = loadConfig();
  let payload;
  try {
    payload = await verifySignupToken(config.auth.signup_public_key, input.token);
  } catch (cause) {
    logger.warn({ err: cause }, "rejected signup token at completion time");
    return { error: "invalid_token" };
  }

  let aci: SignalAci;
  try {
    aci = parseSignalAci(payload.aci);
  } catch (cause) {
    // Same reasoning as inspectSignupToken: a well-signed token with a
    // non-UUID aci means bot/website have drifted, not a user mistake.
    logger.error({ err: cause }, "well-signed signup token had a non-UUID aci");
    return { error: "invalid_token" };
  }

  let accountName;
  try {
    accountName = parseAccountName(input.accountName);
  } catch (cause) {
    logger.warn({ err: cause }, "signup rejected: invalid account name");
    return { error: "validation" };
  }

  if (!input.email.trim() || !input.displayName.trim()) {
    return { error: "validation" };
  }

  let result;
  try {
    result = await createUserFromSignup(
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
      logger.warn({ accountName, err: cause }, "signup rejected: account name already taken");
      return { error: "account_name_taken" };
    }
    throw cause;
  }

  if (result === "nonce_already_used") {
    return { error: "already_used" };
  }

  await ensureBootstrapAdminRole(result);
  const setCookieHeaders = await startSession(result.id, result.accountName);
  return { user: result, setCookieHeaders };
}

export type StartLoginResult = { ok: true } | { error: "account_not_found" };

export async function startLogin(accountNameRaw: string): Promise<StartLoginResult> {
  const user = await findUserByAccountName(accountNameRaw.trim());
  if (!user) {
    return { error: "account_not_found" };
  }

  const code = generateOtpCode();
  await insertLoginChallenge({
    userId: user.id,
    codeHash: hashOtpCode(code),
    expiresAt: new Date(Date.now() + OTP_CHALLENGE_TTL_SECONDS * 1000),
  });
  await sendOtpViaBot(user.signalAci, code);
  return { ok: true };
}

export type VerifyLoginResult =
  | { user: User; setCookieHeaders: string[] }
  | { error: "account_not_found" | "no_active_challenge" | "wrong_code" | "attempts_exhausted" };

export async function verifyLogin(
  accountNameRaw: string,
  code: string,
): Promise<VerifyLoginResult> {
  const user = await findUserByAccountName(accountNameRaw.trim());
  if (!user) {
    return { error: "account_not_found" };
  }

  const challenge = await findLatestActiveLoginChallenge(user.id);
  if (!challenge) {
    return { error: "no_active_challenge" };
  }

  if (!hashesEqual(hashOtpCode(code), challenge.codeHash)) {
    const remaining = await decrementLoginChallengeAttempts(challenge.id);
    return remaining <= 0 ? { error: "attempts_exhausted" } : { error: "wrong_code" };
  }

  await ensureBootstrapAdminRole(user);
  const setCookieHeaders = await startSession(user.id, user.accountName);
  return { user, setCookieHeaders };
}

export async function getSessionUser(cookieHeader: string | null): Promise<User | null> {
  const token = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }
  const session = await findActiveSessionByTokenHash(hashSessionToken(token));
  if (!session) {
    return null;
  }
  return findUserById(session.userId);
}

export async function logout(cookieHeader: string | null): Promise<string[]> {
  const token = parseCookies(cookieHeader)[SESSION_COOKIE_NAME];
  if (token) {
    await revokeSessionByTokenHash(hashSessionToken(token));
  }
  return [buildDeleteCookie(SESSION_COOKIE_NAME)];
}

// Browsers (Chrome since 2023) cap Set-Cookie Max-Age at 400 days regardless
// of what's requested — this is as close to "remembered indefinitely" as a
// cookie can actually get.
const REMEMBERED_ACCOUNT_TTL_SECONDS = 400 * 24 * 60 * 60;

async function startSession(userId: User["id"], accountName: string): Promise<string[]> {
  const token = generateSessionToken();
  await insertSession({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
  });
  return [
    buildSetCookie(SESSION_COOKIE_NAME, token, { maxAgeSeconds: SESSION_TTL_SECONDS }),
    buildSetCookie(REMEMBERED_ACCOUNT_COOKIE_NAME, accountName, {
      maxAgeSeconds: REMEMBERED_ACCOUNT_TTL_SECONDS,
      httpOnly: false,
    }),
  ];
}

async function ensureBootstrapAdminRole(user: User): Promise<void> {
  const config = loadConfig();
  if (config.auth.site_admin_account_names.includes(user.accountName)) {
    await ensureGlobalRole(user.id, "site_admin");
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
