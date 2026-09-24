import { fromZonedTime } from "date-fns-tz";

/**
 * Every event date/time on this site is anchored to Dutch wall-clock time,
 * regardless of who's reading or writing it - see format-date.ts's display
 * side (EVENT_DISPLAY_TZ) and resolveDateOnlyInstant below for the write
 * side. One shared constant so the two can't drift apart.
 */
export const EVENT_TZ = "Europe/Amsterdam";

/**
 * The one place that decides what a date-only event's start/end actually
 * means as a stored instant: Amsterdam midnight of the given calendar day,
 * expressed as UTC - which falls on the *previous* UTC calendar day
 * (CET/CEST is always ahead of UTC; see format-date.ts's comment for the
 * display-side consequence of that).
 *
 * Every producer of a date-only start/end calls one of these two instead of
 * independently re-deriving the Europe/Amsterdam conversion itself:
 * EventForm.tsx (a real user picking a bare `<input type="date">` value,
 * naturally a "yyyy-MM-dd" string) uses resolveDateOnlyInstant directly;
 * import-arc-events.ts (ARC's bare `VALUE=DATE` VEVENTs, whose calendar day
 * comes back as separate y/m/d components - see its own comment on why)
 * uses resolveDateOnlyInstantFromParts, which resolveDateOnlyInstant itself
 * delegates to, so both paths resolve identically. Keeping this in one place
 * is what lets EventRepository.findEventByTitleAndStart's exact-instant
 * duplicate check work regardless of which of those two produced the event
 * being compared.
 */
export function resolveDateOnlyInstant(calendarDate: string): Date {
  const [year, month, day] = calendarDate.split("-").map(Number);
  return resolveDateOnlyInstantFromParts(year, month, day);
}

/** Same as resolveDateOnlyInstant, taking the calendar day as separate parts instead of a "yyyy-MM-dd" string. `month` is 1-indexed (January = 1), matching the calendar - not JS Date's 0-indexed getMonth(). */
export function resolveDateOnlyInstantFromParts(year: number, month: number, day: number): Date {
  return fromZonedTime(new Date(year, month - 1, day), EVENT_TZ);
}
