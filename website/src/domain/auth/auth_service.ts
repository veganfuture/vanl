import { timingSafeEqual } from "node:crypto";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { loadConfig, type AppConfig } from "~/lib/config";
import { isUniqueViolation, sql } from "~/lib/db";
import { logger } from "~/lib/logger";
import { AccountName, isReservedAccountName } from "./account_name";
import { AuthRepository, type ActiveLoginChallenge, type DbError } from "./auth_repository";
import { sendOtpViaBot } from "./bot-client";
import {
  buildDeleteCookie,
  buildSetCookie,
  parseCookies,
  REMEMBERED_ACCOUNT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "./cookies";
import {
  generateOtpCode,
  hashOtpCode,
  OTP_CHALLENGE_TTL_SECONDS,
  OTP_SEND_RATE_LIMIT_MAX,
  OTP_SEND_RATE_LIMIT_WINDOW_SECONDS,
} from "./otp";
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

export type StartLoginError = "account_not_found" | "rate_limited" | "internal_error";

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
        if (isReservedAccountName(accountNameResult.value)) {
          // Indistinguishable from "already taken" to the caller - a signup
          // has no legitimate reason to know reserved names exist at all.
          logger.warn(
            { accountName: accountNameResult.value.value },
            "signup rejected: reserved account name",
          );
          return errAsync<never, CompleteSignupError>("account_name_taken");
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
            this.startSession(user.id, user.accountName)
              .mapErr((dbError): CompleteSignupError => {
                logger.error({ err: dbError }, "failed to finish signup after creating user");
                return "internal_error";
              })
              .map((setCookieHeaders) => ({ user, setCookieHeaders })),
          );
      });
  }

  /**
   * `ip` gates the per-IP half of the OTP send rate limit (see otp.ts) -
   * checked before even looking up the account, so probing many different
   * account names from one IP can't be used to dodge it. `null` (no client
   * IP known, e.g. local dev with no Cloudflare in front) simply skips that
   * half, leaving the per-account limit as the only gate.
   */
  startLogin(accountNameRaw: string, ip: string | null): ResultAsync<void, StartLoginError> {
    const windowStart = new Date(Date.now() - OTP_SEND_RATE_LIMIT_WINDOW_SECONDS * 1000);

    const checkIpRateLimit: ResultAsync<void, StartLoginError> = ip
      ? this.repository
          .countLoginChallengesForIpSince(ip, windowStart)
          .mapErr((dbError): StartLoginError => {
            logger.error({ err: dbError }, "failed to count login challenges for IP");
            return "internal_error";
          })
          .andThen((count): ResultAsync<void, StartLoginError> =>
            count >= OTP_SEND_RATE_LIMIT_MAX ? errAsync("rate_limited") : okAsync(undefined),
          )
      : okAsync(undefined);

    return checkIpRateLimit
      .andThen(() =>
        this.repository
          .findUserByAccountName(accountNameRaw.trim())
          .mapErr((dbError): StartLoginError => {
            logger.error({ err: dbError }, "failed to look up user for login start");
            return "internal_error";
          }),
      )
      .andThen((user): ResultAsync<User, StartLoginError> =>
        user ? okAsync(user) : errAsync("account_not_found"),
      )
      .andThen((user) =>
        this.repository
          .countLoginChallengesForUserSince(user.id, windowStart)
          .mapErr((dbError): StartLoginError => {
            logger.error({ err: dbError }, "failed to count login challenges for user");
            return "internal_error";
          })
          .andThen((count): ResultAsync<User, StartLoginError> =>
            count >= OTP_SEND_RATE_LIMIT_MAX ? errAsync("rate_limited") : okAsync(user),
          ),
      )
      .andThen((user) => {
        const code = generateOtpCode();
        return this.repository
          .insertLoginChallenge({
            userId: user.id,
            codeHash: hashOtpCode(code),
            expiresAt: new Date(Date.now() + OTP_CHALLENGE_TTL_SECONDS * 1000),
            requestedIp: ip,
          })
          .mapErr((dbError): StartLoginError => {
            logger.error({ err: dbError }, "failed to insert login challenge");
            return "internal_error";
          })
          .andThen((challengeId) =>
            sendOtpViaBot(user.signalAci.value, code).orElse((sendError) => {
              logger.error({ err: sendError }, "failed to send OTP via bot");
              // The insert already happened, so without this the row would
              // sit there counting against the account/IP send-rate-limit
              // even though the user never actually received a code - undo
              // it rather than let a transient bot failure eat a retry slot.
              return this.repository
                .deleteLoginChallenge(challengeId)
                .orElse((dbError) => {
                  logger.error(
                    { err: dbError },
                    "failed to clean up login challenge after OTP send failure",
                  );
                  return okAsync(undefined);
                })
                .andThen(() =>
                  errAsync<void, StartLoginError>(
                    sendError.kind === "rate_limited" ? "rate_limited" : "internal_error",
                  ),
                );
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
          // Delete rather than just proceeding - a successful login must
          // both stop the code being replayable within its TTL and not
          // count against the account's future OTP send-rate-limit (see
          // deleteLoginChallenge's doc comment).
          return this.repository
            .deleteLoginChallenge(challenge.id)
            .mapErr((dbError): VerifyLoginError => {
              logger.error({ err: dbError }, "failed to delete used login challenge");
              return "internal_error";
            })
            .andThen(() =>
              this.startSession(user.id, user.accountName)
                .mapErr((dbError): VerifyLoginError => {
                  logger.error({ err: dbError }, "failed to finish login after verifying code");
                  return "internal_error";
                })
                .map((setCookieHeaders) => ({ user, setCookieHeaders })),
            );
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

  /** Fails closed: a DB error is treated as "not an admin", never as "is one". */
  isSiteAdmin(userId: UserId): ResultAsync<boolean, never> {
    return this.repository.isSiteAdmin(userId).orElse((dbError) => {
      logger.error({ err: dbError }, "failed to check site admin role");
      return okAsync(false);
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
}

function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const authService = new AuthService(new AuthRepository(sql), loadConfig().auth);
