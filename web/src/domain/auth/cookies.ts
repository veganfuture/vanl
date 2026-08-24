export const SESSION_COOKIE_NAME = "vanl_session";
export const REMEMBERED_ACCOUNT_COOKIE_NAME = "vanl_account_name";

export function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) {
    return cookies;
  }
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) {
      cookies[name] = decodeURIComponent(value);
    }
  }
  return cookies;
}

type CookieOptions = {
  maxAgeSeconds?: number;
  httpOnly?: boolean;
  path?: string;
};

/**
 * Builds a Set-Cookie header value. Always Secure + SameSite=Lax — the site
 * is HTTPS-only per the spec, and Lax is enough since we don't need the
 * session cookie sent on cross-site top-level navigations either.
 */
export function buildSetCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  }
  parts.push("Secure");
  parts.push("SameSite=Lax");
  if (options.httpOnly ?? true) {
    parts.push("HttpOnly");
  }
  return parts.join("; ");
}

export function buildDeleteCookie(name: string, path = "/"): string {
  return `${name}=; Path=${path}; Max-Age=0; Secure; SameSite=Lax; HttpOnly`;
}
