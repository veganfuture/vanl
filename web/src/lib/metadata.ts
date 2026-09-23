export const BASE_URL = "https://veganactivists.nl";

export function withBaseUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

export const SITE_TITLE = "Vegan Activists NL";
export const SITE_DESCRIPTION = "The #1 vegan activists group in the Netherlands ✊";
export const OG_IMAGE = "/web-app-manifest-512x512.png";

/** Cuts well under Facebook's/Twitter's own preview-text limits so previews stay a clean, predictable length instead of trusting each platform's own truncation/ellipsis behavior. */
export function truncate(text: string, max = 200): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
