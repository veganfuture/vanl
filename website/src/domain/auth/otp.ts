import { createHash, randomInt } from "node:crypto";

export const OTP_CHALLENGE_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 3;

/** A 6-digit login code. Zero-padded, so always 6 characters. */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
