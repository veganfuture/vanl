export type Locale = "nl" | "en";

export const LOCALE_COOKIE_NAME = "vanl_locale";

/** Any unrecognized/missing route param falls back to English. */
export function resolveLang(raw: string | undefined): Locale {
  return raw === "nl" ? "nl" : "en";
}

/** `t("Dutch text", "English text")` for the given locale - inline translations, no injected dict. */
export function makeT(lang: Locale): (nl: string, en: string) => string {
  return (nl, en) => (lang === "nl" ? nl : en);
}

/**
 * Picks bilingual content (event titles/descriptions) for display: prefers
 * the viewer's current locale, falling back to whichever language the
 * publisher actually filled in - an event is always shown, even if it only
 * has content in the language the viewer isn't currently using.
 */
export function pickLocalized(nl: string | null, en: string | null, lang: Locale): string {
  const preferred = lang === "nl" ? nl : en;
  const fallback = lang === "nl" ? en : nl;
  return preferred ?? fallback ?? "";
}
