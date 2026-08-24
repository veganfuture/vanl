import { logger } from "./logger";

/** Returns undefined on any parse failure rather than throwing — callers validate with zod anyway. */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (cause) {
    logger.warn({ err: cause }, "request body was not valid JSON");
    return undefined;
  }
}

/**
 * Best-effort client IP for per-IP rate limiting (see startLogin's OTP
 * send limit). `cf-connecting-ip` is trustworthy in production because the
 * origin only ever accepts traffic from Cloudflare (see
 * docs/architecture.md) - Cloudflare sets this header at its own edge, not
 * a client-suppliable one. Falls back to x-forwarded-for's first hop for
 * local/dev use where there's no Cloudflare in front; returns null (never
 * rate-limited by IP) if neither header is present.
 */
export function getClientIp(request: Request): string | null {
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim();
  }
  return null;
}
