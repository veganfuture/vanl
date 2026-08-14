import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { loadConfig } from "~/lib/config";

export type SendOtpError = { readonly message: string; readonly cause?: unknown };

/**
 * Asks the bot to relay a one-time login code to a user over Signal. The bot
 * binds this endpoint to localhost only; the shared secret is the other half
 * of that trust boundary (see docs/threat-model.md).
 */
export function sendOtpViaBot(aci: string, code: string): ResultAsync<void, SendOtpError> {
  const config = loadConfig();
  const secret = process.env.VANL_BOT_API_SHARED_SECRET;
  if (!secret) {
    return errAsync({
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
    (cause): SendOtpError => ({ message: "Failed to reach bot API", cause }),
  ).andThen((response): ResultAsync<void, SendOtpError> => {
    if (!response.ok) {
      return errAsync({
        message: `Bot API returned ${response.status} while sending an OTP message`,
      });
    }
    return okAsync(undefined);
  });
}
