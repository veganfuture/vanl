import type { Locale } from "~/lib/i18n";

/**
 * Was duplicated ad hoc across the events and organizations pages before
 * being pulled out here. timeZone is pinned to Europe/Amsterdam rather than
 * left ambient: a date-only event's startAt/endAt stores Amsterdam midnight
 * as a UTC instant, which in UTC falls on the *previous* calendar day (CET/
 * CEST is always ahead of UTC) - formatting via the runtime's ambient
 * timezone (likely UTC server-side) would show the wrong date for those.
 */
export function formatEventDate(iso: string, lang: Locale, timeKnown: boolean): string {
  return new Date(iso).toLocaleString(lang === "nl" ? "nl-NL" : "en-GB", {
    dateStyle: "medium",
    ...(timeKnown ? { timeStyle: "short" as const } : {}),
    timeZone: "Europe/Amsterdam",
  });
}
