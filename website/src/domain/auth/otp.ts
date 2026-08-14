import { createHash, randomInt } from "node:crypto";

export const OTP_CHALLENGE_TTL_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 3;

/** A 4-digit login code, per the spec. Zero-padded, so always 4 characters. */
export function generateOtpCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, "0");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
