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
 * means as a stored instant: Amsterdam midnight of the given calendar day
 * ("yyyy-MM-dd"), expressed as UTC - which falls on the *previous* UTC
 * calendar day (CET/CEST is always ahead of UTC; see format-date.ts's
 * comment for the display-side consequence of that).
 *
 * Every producer of a date-only start/end calls this instead of
 * independently re-deriving the Europe/Amsterdam conversion itself:
 * EventForm.tsx (a real user picking a bare `<input type="date">` value) and
 * import-arc-events.ts (ARC's bare `VALUE=DATE` VEVENTs, reduced to a
 * calendar-day string first - see its own comment on why that reduction is
 * needed before it can call this). Keeping this in one place is what lets
 * EventRepository.findEventByTitleAndStart's exact-instant duplicate check
 * work regardless of which of those two produced the event being compared.
 */
export function resolveDateOnlyInstant(calendarDate: string): Date {
  return fromZonedTime(`${calendarDate}T00:00`, EVENT_TZ);
}
