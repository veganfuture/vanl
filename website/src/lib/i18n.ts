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
