import { createHash, randomBytes } from "node:crypto";

/** 24h, per the spec — a hard expiry, not a sliding window. */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

/** The opaque value that goes in the browser's cookie. Never stored raw. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
