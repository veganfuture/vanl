import { resolveDateOnlyInstantFromParts, resolveDateOnlyParts } from "~/lib/event_date";
import {
  escapeIcsText,
  foldLine,
  formatIcsDate,
  formatIcsDateOnly,
  formatIcsDateTimeProperty,
} from "~/lib/ics";

/**
 * Everything the "Add to calendar" button needs, already localized/joined
 * by the caller (see AddToCalendarButton.tsx) - kept provider-agnostic so
 * this file doesn't need to know about EventJson's raw field shape. Dates
 * are real Date objects, not ISO strings, to match how the rest of the
 * domain models them (see Event.startAt/endAt) and to avoid re-parsing the
 * same instant repeatedly across the builders below.
 */
export type CalendarEventInput = {
  title: string;
  description: string;
  location: string;
  startAt: Date;
  startTimeKnown: boolean;
  endAt: Date | null;
  endTimeKnown: boolean;
};

/**
 * The exclusive end date/time for Google/Outlook/Office 365's web
 * templates - unlike buildIcsFile below (which can express DTSTART/DTEND's
 * time-known-ness independently, straight from RFC 5545), these templates
 * only take one flag for the whole event, so there's no way to carry a
 * mixed "start has a time, end doesn't" event through them; this always
 * follows startTimeKnown. Stays in Date-land throughout - only formatted to
 * a string by each call site below, in whatever format that provider wants.
 */
function resolveWebLinkEnd(input: CalendarEventInput): Date {
  if (input.startTimeKnown) {
    return input.endAt ?? new Date(input.startAt.getTime() + 60 * 60 * 1000);
  }
  const startParts = resolveDateOnlyParts(input.startAt);
  const nextDay = () =>
    resolveDateOnlyInstantFromParts(startParts.year, startParts.month, startParts.day + 1);
  if (!input.endAt) {
    return nextDay();
  }
  const endParts = resolveDateOnlyParts(input.endAt);
  const sameCalendarDay =
    endParts.year === startParts.year &&
    endParts.month === startParts.month &&
    endParts.day === startParts.day;
  return sameCalendarDay ? nextDay() : input.endAt;
}

export function googleCalendarUrl(input: CalendarEventInput): string {
  const allDay = !input.startTimeKnown;
  const end = resolveWebLinkEnd(input);
  const dates = allDay
    ? `${formatIcsDateOnly(input.startAt)}/${formatIcsDateOnly(end)}`
    : `${formatIcsDate(input.startAt)}/${formatIcsDate(end)}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates,
    details: input.description,
    location: input.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function outlookDateOnly(date: Date): string {
  const { year, month, day } = resolveDateOnlyParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

function outlookDeeplinkUrl(base: string, input: CalendarEventInput): string {
  const allDay = !input.startTimeKnown;
  const end = resolveWebLinkEnd(input);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: input.title,
    body: input.description,
    location: input.location,
    allday: String(allDay),
    startdt: allDay ? outlookDateOnly(input.startAt) : input.startAt.toISOString(),
    enddt: allDay ? outlookDateOnly(end) : end.toISOString(),
  });
  return `${base}?${params.toString()}`;
}

export function outlookComUrl(input: CalendarEventInput): string {
  return outlookDeeplinkUrl("https://outlook.live.com/calendar/0/deeplink/compose", input);
}

export function office365Url(input: CalendarEventInput): string {
  return outlookDeeplinkUrl("https://outlook.office.com/calendar/0/deeplink/compose", input);
}

/**
 * Single-VEVENT .ics file for the "Apple Calendar / other" download option -
 * Google/Outlook only expose web templates, so this is the only path that
 * works for desktop Apple Calendar, Outlook desktop, Thunderbird, etc.
 * Shares its RFC 5545 primitives with the full events.ics feed
 * (server/routes/events.ics.get.ts) via ~/lib/ics, including
 * formatIcsDateTimeProperty, so - unlike the web templates above - a mixed
 * event (known start time, unknown end time or vice versa) renders exactly
 * as it would in the full feed, and a missing endAt is simply omitted
 * (RFC 5545 §3.6.1 already defines the resulting default duration) rather
 * than guessing one.
 */
export function buildIcsFile(input: CalendarEventInput & { uid: string }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vegan Activists NL//add-to-calendar//NL",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}@veganactivists.nl`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    formatIcsDateTimeProperty("DTSTART", input.startAt, input.startTimeKnown),
    input.endAt ? formatIcsDateTimeProperty("DTEND", input.endAt, input.endTimeKnown) : null,
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
