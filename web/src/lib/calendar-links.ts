import { formatInTimeZone } from "date-fns-tz";
import { EVENT_TZ } from "~/lib/event_date";

/**
 * Everything the "Add to calendar" button needs, already localized/joined
 * by the caller (see AddToCalendarButton.tsx) - kept provider-agnostic so
 * this file doesn't need to know about EventJson's raw field shape.
 */
export type CalendarEventInput = {
  title: string;
  description: string;
  location: string;
  startAt: string;
  startTimeKnown: boolean;
  endAt: string | null;
};

function utcStamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** Reads the calendar date in Amsterdam local time - see EVENT_TZ's comment: a date-only instant stores Amsterdam midnight as UTC, which falls on the *previous* UTC calendar day. */
function dateOnlyStamp(iso: string): string {
  return formatInTimeZone(new Date(iso), EVENT_TZ, "yyyyMMdd");
}

function addDays(dateOnly: string, days: number): string {
  const year = Number(dateOnly.slice(0, 4));
  const month = Number(dateOnly.slice(4, 6)) - 1;
  const day = Number(dateOnly.slice(6, 8));
  return new Date(Date.UTC(year, month, day + days)).toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Every provider template wants one start/end pair. All-day events use an
 * exclusive end (one day past the last calendar day covered) per the
 * convention every calendar UI shares for "dates="-style params; a missing
 * endAt defaults to a single day (all-day) or one hour (timed).
 */
function resolveRange(input: CalendarEventInput): { allDay: boolean; start: string; end: string } {
  if (!input.startTimeKnown) {
    const start = dateOnlyStamp(input.startAt);
    const endExclusive = input.endAt ? dateOnlyStamp(input.endAt) : addDays(start, 1);
    return { allDay: true, start, end: endExclusive === start ? addDays(start, 1) : endExclusive };
  }
  const start = utcStamp(input.startAt);
  const end = input.endAt
    ? utcStamp(input.endAt)
    : utcStamp(new Date(new Date(input.startAt).getTime() + 60 * 60 * 1000).toISOString());
  return { allDay: false, start, end };
}

export function googleCalendarUrl(input: CalendarEventInput): string {
  const { start, end } = resolveRange(input);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${start}/${end}`,
    details: input.description,
    location: input.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function toIsoDate(dateOnly: string): string {
  return `${dateOnly.slice(0, 4)}-${dateOnly.slice(4, 6)}-${dateOnly.slice(6, 8)}`;
}

function outlookDeeplinkUrl(base: string, input: CalendarEventInput): string {
  const { allDay, start, end } = resolveRange(input);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: input.title,
    body: input.description,
    location: input.location,
    allday: String(allDay),
    startdt: allDay ? toIsoDate(start) : new Date(input.startAt).toISOString(),
    enddt: allDay
      ? toIsoDate(end)
      : input.endAt
        ? new Date(input.endAt).toISOString()
        : new Date(new Date(input.startAt).getTime() + 60 * 60 * 1000).toISOString(),
  });
  return `${base}?${params.toString()}`;
}

export function outlookComUrl(input: CalendarEventInput): string {
  return outlookDeeplinkUrl("https://outlook.live.com/calendar/0/deeplink/compose", input);
}

export function office365Url(input: CalendarEventInput): string {
  return outlookDeeplinkUrl("https://outlook.office.com/calendar/0/deeplink/compose", input);
}

/** RFC 5545 §3.3.11 TEXT escaping - backslash first, so it doesn't double-escape the others. Mirrors server/routes/events.ics.get.ts's escaping (that one runs server-side over domain Event objects, this one over the client's already-localized EventJson - different input shape, same rules). */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** RFC 5545 §3.1 line folding - continuation lines start with a single space. */
function foldLine(line: string): string {
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

/** Single-VEVENT .ics file for the "Apple Calendar / other" download option - Google/Outlook only expose web templates, so this is the only path that works for desktop Apple Calendar, Outlook desktop, Thunderbird, etc. */
export function buildIcsFile(input: CalendarEventInput & { uid: string }): string {
  const { allDay, start, end } = resolveRange(input);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vegan Activists NL//add-to-calendar//NL",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}@veganactivists.nl`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`,
    allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`,
    input.title ? `SUMMARY:${escapeIcsText(input.title)}` : null,
    input.description ? `DESCRIPTION:${escapeIcsText(input.description)}` : null,
    input.location ? `LOCATION:${escapeIcsText(input.location)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => line !== null);
  return lines.map(foldLine).join("\r\n");
}

export function downloadIcsFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
