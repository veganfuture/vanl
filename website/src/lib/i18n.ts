import { useParams } from "@solidjs/router";

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
 * Reads the [lang] route param and returns both a reactive `lang()` accessor
 * and a `t()` translator built from it - nearly every page/component in this
 * app reached for `useParams` + `resolveLang` + a hand-rolled `t` together,
 * so this is that trio in one call. Components that also need other route
 * params (e.g. `slug`) still call `useParams<{ slug: string }>()`
 * separately for those - solid-router's `useParams` reads from context, so
 * calling it more than once in the same component is fine.
 */
export function useLang(): { lang: () => Locale; t: (nl: string, en: string) => string } {
  const params = useParams<{ lang?: string }>();
  const lang = () => resolveLang(params.lang);
  const t = (nl: string, en: string) => (lang() === "nl" ? nl : en);
  return { lang, t };
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
