import type { Locale } from "~/lib/i18n";

/** Was duplicated ad hoc across the events and organizations pages before being pulled out here. */
export function formatEventDate(iso: string, lang: Locale): string {
  return new Date(iso).toLocaleString(lang === "nl" ? "nl-NL" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
