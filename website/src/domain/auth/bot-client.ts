import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { loadConfig } from "~/lib/config";
import { sql } from "~/lib/db";
import { logger } from "~/lib/logger";
import { BotMessageRepository } from "~/domain/bot/bot_message_repository";
import {
  BOT_MESSAGE_RATE_LIMIT_MAX,
  BOT_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
} from "~/domain/bot/bot_send_limit";

export type SendOtpError =
  | { readonly kind: "rate_limited" }
  | { readonly kind: "send_failed"; readonly message: string; readonly cause?: unknown };

const botMessageRepository = new BotMessageRepository(sql);

/**
 * Asks the bot to relay a one-time login code to a user over Signal. The bot
 * binds this endpoint to localhost only; the shared secret is the other half
 * of that trust boundary (see docs/threat-model.md).
 *
 * Wrapped in a general, message-type-agnostic per-recipient send cap (see
 * domain/bot/bot_send_limit.ts) - checked before the actual HTTP call to the
 * bot, and recorded only after the bot confirms it accepted the message, so
 * a failed send never counts against it. This sits underneath (not instead
 * of) otp.ts's own per-account/per-IP OTP send limit, which is the
 * normal-path UX gate; this is a much looser backstop.
 */
export function sendOtpViaBot(aci: string, code: string): ResultAsync<void, SendOtpError> {
  const windowStart = new Date(Date.now() - BOT_MESSAGE_RATE_LIMIT_WINDOW_SECONDS * 1000);

  return botMessageRepository
    .countMessagesSentToSince(aci, windowStart)
    .mapErr((dbError): SendOtpError => {
      logger.error({ err: dbError }, "failed to count bot messages sent");
      return {
        kind: "send_failed",
        message: "Failed to check bot send rate limit",
        cause: dbError,
      };
    })
    .andThen((count): ResultAsync<void, SendOtpError> => {
      if (count >= BOT_MESSAGE_RATE_LIMIT_MAX) {
        logger.warn({ aci, count }, "bot send rejected: general per-recipient rate limit hit");
        return errAsync({ kind: "rate_limited" });
      }
      return sendOtpViaBotUnthrottled(aci, code).andThen(() =>
        botMessageRepository
          .recordMessageSent(aci, "otp")
          .mapErr((dbError) => {
            // The message was already sent successfully - a failure to log
            // it must not be reported as a send failure to the caller.
            logger.error({ err: dbError }, "failed to record bot message sent");
          })
          .orElse(() => okAsync(undefined)),
      );
    });
}

function sendOtpViaBotUnthrottled(aci: string, code: string): ResultAsync<void, SendOtpError> {
  const config = loadConfig();
  const secret = process.env.VANL_BOT_API_SHARED_SECRET;
  if (!secret) {
    return errAsync({
      kind: "send_failed",
      message: "Missing required environment variable: VANL_BOT_API_SHARED_SECRET",
    });
  }

  return ResultAsync.fromPromise(
    fetch(`${config.auth.bot_api_base_url}/messages/otp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ aci, code }),
    }),
    (cause): SendOtpError => ({ kind: "send_failed", message: "Failed to reach bot API", cause }),
  ).andThen((response): ResultAsync<void, SendOtpError> => {
    if (!response.ok) {
      return errAsync({
        kind: "send_failed",
        message: `Bot API returned ${response.status} while sending an OTP message`,
      });
    }
    return okAsync(undefined);
  });
}
