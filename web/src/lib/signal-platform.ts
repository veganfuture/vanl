import { getRequestEvent, isServer } from "solid-js/web";

export type SignalPlatform = "android" | "ios" | "windows" | "mac" | "linux" | null;

function detectFromUserAgent(ua: string): SignalPlatform {
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/Linux/i.test(ua)) return "linux";
  return null;
}

/**
 * Detects the visitor's OS from the request's User-Agent header on the
 * server rather than a client-only navigator.userAgent effect - this page
 * is SSR'd, so a client-only check would render generic content first and
 * then flash to the platform-specific version once JS hydrates. Reading
 * the same header both server- and client-side (see apiUrl's isServer
 * pattern) keeps the SSR and hydrated output identical.
 */
export function detectSignalPlatform(): SignalPlatform {
  const ua = isServer
    ? (getRequestEvent()?.request.headers.get("user-agent") ?? "")
    : navigator.userAgent;
  return detectFromUserAgent(ua);
}
