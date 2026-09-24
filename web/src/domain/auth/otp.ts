import { createHash, randomInt } from "node:crypto";

export const OTP_CHALLENGE_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 3;

/** Caps OTP sends per account and per IP (docs/threat-model.md: "rate-limited challenge creation per account and per IP"). */
export const OTP_SEND_RATE_LIMIT_MAX = 3;
export const OTP_SEND_RATE_LIMIT_WINDOW_SECONDS = 12 * 60 * 60;

/** A 6-digit login code. Zero-padded, so always 6 characters. */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** The fixed code issued instead when config.auth.dev_otp_bypass is on - see that field's comment in config.ts. */
export const DEV_OTP_BYPASS_CODE = "000000";

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
