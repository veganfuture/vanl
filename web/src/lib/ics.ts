import { formatInTimeZone } from "date-fns-tz";
import { EVENT_TZ } from "~/lib/event_date";

/**
 * RFC 5545 primitives shared by every ICS/calendar-link producer in this
 * app: the full events.ics feed (server/routes/events.ics.get.ts) and the
 * per-event "Add to calendar" button (calendar-links.ts, client-side).
 * Kept dependency-free (date-fns-tz + EVENT_TZ are both already safe in the
 * client bundle - see format-date.ts) so either side can import it.
 */

/** RFC 5545 §3.3.11 TEXT escaping - backslash first, so it doesn't double-escape the others. */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** RFC 5545 §3.1 line folding - continuation lines start with a single space. */
export function foldLine(line: string): string {
  const CHUNK = 75;
  if (line.length <= CHUNK) {
    return line;
  }
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > CHUNK) {
    chunks.push(rest.slice(0, CHUNK));
    rest = rest.slice(CHUNK);
  }
  chunks.push(rest);
  return chunks.join("\r\n ");
}

export function formatIcsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/**
 * RFC 5545 §3.6.1 all-day form (DTSTART/DTEND;VALUE=DATE), for when only the
 * date is meaningful (see Event.startTimeKnown/endTimeKnown) - must read the
 * calendar date in Amsterdam local time, not UTC: a date-only start/end
 * stores Amsterdam midnight as a UTC instant, which in UTC falls on the
 * *previous* calendar day.
 */
export function formatIcsDateOnly(date: Date): string {
  return formatInTimeZone(date, EVENT_TZ, "yyyyMMdd");
}

/**
 * A DTSTART/DTEND property line, choosing the VALUE=DATE form or a full
 * timestamp per-field - shared so a mixed event (e.g. a known start time but
 * an unknown end time, both independently settable in EventForm.tsx) renders
 * identically wherever a VEVENT is built from it, rather than each producer
 * re-deriving the same VALUE=DATE-or-not choice on its own.
 */
export function formatIcsDateTimeProperty(
  name: "DTSTART" | "DTEND",
  date: Date,
  timeKnown: boolean,
): string {
  return timeKnown
    ? `${name}:${formatIcsDate(date)}`
    : `${name};VALUE=DATE:${formatIcsDateOnly(date)}`;
}
