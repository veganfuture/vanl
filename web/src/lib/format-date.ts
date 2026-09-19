import type { Locale } from "~/lib/i18n";

function localeTag(lang: Locale): string {
  return lang === "nl" ? "nl-NL" : "en-GB";
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Was duplicated ad hoc across the events and organizations pages before
 * being pulled out here. Always leads with the short weekday; drops the
 * year when the event falls in the current year (the common case, so the
 * year would just be noise); and swaps the whole date part for "Today"/
 * "Tomorrow" when it applies, since that's more useful at a glance than
 * "Wed 24 Sep" on the day itself.
 */
export function formatEventDate(iso: string, lang: Locale): string {
  const date = new Date(iso);
  const tag = localeTag(lang);
  const time = date.toLocaleString(tag, { timeStyle: "short" });

  const now = new Date();
  if (isSameCalendarDay(date, now)) {
    return `${lang === "nl" ? "Vandaag" : "Today"} ${time}`;
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameCalendarDay(date, tomorrow)) {
    return `${lang === "nl" ? "Morgen" : "Tomorrow"} ${time}`;
  }

  const weekday = date.toLocaleString(tag, { weekday: "short" });
  const dayMonth = date.toLocaleString(tag, { day: "numeric", month: "short" });
  const year = date.getFullYear() === now.getFullYear() ? "" : ` ${date.getFullYear()}`;
  return `${weekday} ${dayMonth}${year} ${time}`;
}
