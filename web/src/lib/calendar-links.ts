import { escapeIcsText, foldLine, formatIcsDate, formatIcsDateOnly } from "~/lib/ics";

/**
 * Everything the "Add to calendar" button needs, already localized/joined
 * by the caller (see AddToCalendarButton.tsx) - kept provider-agnostic so
 * this file doesn't need to know about EventJson's raw field shape. Dates
 * are real Date objects, not ISO strings, to match how the rest of the
 * domain models them (see Event.startAt/endAt) and to avoid re-parsing the
 * same instant repeatedly across the provider builders below.
 */
export type CalendarEventInput = {
  title: string;
  description: string;
  location: string;
  startAt: Date;
  startTimeKnown: boolean;
  endAt: Date | null;
};

function addDays(dateOnly: string, days: number): string {
  const year = Number(dateOnly.slice(0, 4));
  const month = Number(dateOnly.slice(4, 6)) - 1;
  const day = Number(dateOnly.slice(6, 8));
  return new Date(Date.UTC(year, month, day + days)).toISOString().slice(0, 10).replace(/-/g, "");
}

/** A missing endAt defaults to a single day (all-day) or one hour (timed). */
function resolveEndDate(input: CalendarEventInput): Date {
  return input.endAt ?? new Date(input.startAt.getTime() + 60 * 60 * 1000);
}

/**
 * Every provider template wants one start/end pair. All-day events use an
 * exclusive end (one day past the last calendar day covered) per the
 * convention every calendar UI shares for "dates="-style params.
 */
function resolveRange(input: CalendarEventInput): { allDay: boolean; start: string; end: string } {
  if (!input.startTimeKnown) {
    const start = formatIcsDateOnly(input.startAt);
    const endExclusive = input.endAt ? formatIcsDateOnly(input.endAt) : addDays(start, 1);
    return { allDay: true, start, end: endExclusive === start ? addDays(start, 1) : endExclusive };
  }
  return {
    allDay: false,
    start: formatIcsDate(input.startAt),
    end: formatIcsDate(resolveEndDate(input)),
  };
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
    startdt: allDay ? toIsoDate(start) : input.startAt.toISOString(),
    enddt: allDay ? toIsoDate(end) : resolveEndDate(input).toISOString(),
  });
  return `${base}?${params.toString()}`;
}

export function outlookComUrl(input: CalendarEventInput): string {
  return outlookDeeplinkUrl("https://outlook.live.com/calendar/0/deeplink/compose", input);
}

export function office365Url(input: CalendarEventInput): string {
  return outlookDeeplinkUrl("https://outlook.office.com/calendar/0/deeplink/compose", input);
}

/** Single-VEVENT .ics file for the "Apple Calendar / other" download option - Google/Outlook only expose web templates, so this is the only path that works for desktop Apple Calendar, Outlook desktop, Thunderbird, etc. Shares its RFC 5545 primitives with the full events.ics feed (server/routes/events.ics.get.ts) via ~/lib/ics. */
export function buildIcsFile(input: CalendarEventInput & { uid: string }): string {
  const { allDay, start, end } = resolveRange(input);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vegan Activists NL//add-to-calendar//NL",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}@veganactivists.nl`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
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
