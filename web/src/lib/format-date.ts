import { formatInTimeZone } from "date-fns-tz";
import type { Locale } from "~/lib/i18n";

/**
 * All event date/time display is resolved in Europe/Amsterdam, not the
 * runtime's ambient timezone: a date-only event's startAt/endAt stores
 * Amsterdam midnight as a UTC instant, which in UTC falls on the *previous*
 * calendar day (CET/CEST is always ahead of UTC) - and even for timed
 * events, this is a Dutch events site, so Amsterdam wall-clock time is the
 * correct thing to show regardless of the viewer's own timezone.
 */
const EVENT_DISPLAY_TZ = "Europe/Amsterdam";

function localeTag(lang: Locale): string {
  return lang === "nl" ? "nl-NL" : "en-GB";
}

/** Compares calendar dates in Amsterdam local time - see EVENT_DISPLAY_TZ's comment for why that matters here specifically. */
function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    formatInTimeZone(a, EVENT_DISPLAY_TZ, "yyyy-MM-dd") ===
    formatInTimeZone(b, EVENT_DISPLAY_TZ, "yyyy-MM-dd")
  );
}

/**
 * Was duplicated ad hoc across the events and organizations pages before
 * being pulled out here. Always leads with the short weekday; drops the
 * year when the event falls in the current year (the common case, so the
 * year would just be noise); and swaps the whole date part for "Today"/
 * "Tomorrow" when it applies, since that's more useful at a glance than
 * "Wed 24 Sep" on the day itself. Omits the time entirely when timeKnown is
 * false (e.g. an ARC-imported event with no specified time) rather than
 * showing a meaningless "00:00".
 */
export function formatEventDate(iso: string, lang: Locale, timeKnown: boolean): string {
  const date = new Date(iso);
  const tag = localeTag(lang);
  const timeSuffix = timeKnown
    ? ` ${date.toLocaleString(tag, { timeStyle: "short", timeZone: EVENT_DISPLAY_TZ })}`
    : "";

  const now = new Date();
  if (isSameCalendarDay(date, now)) {
    return `${lang === "nl" ? "Vandaag" : "Today"}${timeSuffix}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameCalendarDay(date, tomorrow)) {
    return `${lang === "nl" ? "Morgen" : "Tomorrow"}${timeSuffix}`;
  }

  const weekday = date.toLocaleString(tag, { weekday: "short", timeZone: EVENT_DISPLAY_TZ });
  const dayMonth = date.toLocaleString(tag, {
    day: "numeric",
    month: "short",
    timeZone: EVENT_DISPLAY_TZ,
  });
  const year = date.getFullYear() === now.getFullYear() ? "" : ` ${date.getFullYear()}`;
  return `${weekday} ${dayMonth}${year}${timeSuffix}`;
}
