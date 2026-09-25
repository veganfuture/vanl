import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { z } from "zod";
import { loadConfig } from "~/lib/config";

export type BotStatusError = { readonly message: string; readonly cause?: unknown };

export type BotStatus = { readonly signalConnected: boolean };

const BotStatusResponseSchema = z.object({
  status: z.literal("ok"),
  signalConnected: z.boolean(),
});

/**
 * Asks the bot's own /status endpoint (see bot/src/bot/api_server.py)
 * whether it's up and connected to the signal-cli daemon. Unauthenticated,
 * like the website's own /api/healthz - it's loopback-bound and reveals
 * nothing sensitive, unlike the message-sending endpoints in bot-client.ts.
 * A short timeout keeps a hung bot from stalling the website's own status
 * page.
 */
export function getBotStatus(): ResultAsync<BotStatus, BotStatusError> {
  const config = loadConfig();

  return ResultAsync.fromPromise(
    fetch(`${config.auth.bot_api_base_url}/status`, { signal: AbortSignal.timeout(3000) }),
    (cause): BotStatusError => ({ message: "Failed to reach bot API", cause }),
  )
    .andThen((response): ResultAsync<unknown, BotStatusError> => {
      if (!response.ok) {
        return errAsync({ message: `Bot API returned ${response.status}` });
      }
      return ResultAsync.fromPromise(response.json(), (cause): BotStatusError => ({
        message: "Bot API returned a non-JSON response",
        cause,
      }));
    })
    .andThen((rawJson): ResultAsync<BotStatus, BotStatusError> => {
      const parsed = BotStatusResponseSchema.safeParse(rawJson);
      if (!parsed.success) {
        return errAsync({
          message: "Bot API response failed validation",
          cause: parsed.error,
        });
      }
      return okAsync({ signalConnected: parsed.data.signalConnected });
    });
}
