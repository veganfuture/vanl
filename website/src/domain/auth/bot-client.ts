import { loadConfig } from "~/lib/config";

/**
 * Asks the bot to relay a one-time login code to a user over Signal. The bot
 * binds this endpoint to localhost only; the shared secret is the other half
 * of that trust boundary (see docs/threat-model.md).
 */
export async function sendOtpViaBot(aci: string, code: string): Promise<void> {
  const config = loadConfig();
  const secret = process.env.VANL_BOT_API_SHARED_SECRET;
  if (!secret) {
    throw new Error("Missing required environment variable: VANL_BOT_API_SHARED_SECRET");
  }

  const response = await fetch(`${config.auth.bot_api_base_url}/messages/otp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ aci, code }),
  });

  if (!response.ok) {
    throw new Error(`Bot API returned ${response.status} while sending an OTP message`);
  }
}
