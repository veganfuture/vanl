import { defineHandler, getQuery } from "h3";
import { formatInTimeZone } from "date-fns-tz";
import type { EventWithPublisherOrgName } from "~/domain/events/event_repository";
import { eventService } from "~/domain/events/event_service";
import { pickLocalized } from "~/lib/i18n";
import { BASE_URL } from "~/lib/metadata";

/**
 * Deliberately a nitro-native serverDir route (not a SolidStart
 * src/routes/**.ts one) - same reasoning as
 * src/server/routes/images/[sha256].get.ts, the only other non-JSON
 * response in this app: a raw text/calendar body needs to bypass
 * SolidStart's generic route handling entirely.
 */

/** RFC 5545 §3.3.11 TEXT escaping - backslash first, so it doesn't double-escape the others. */
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

function formatIcsDate(date: Date): string {
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
function formatIcsDateOnly(date: Date): string {
  return formatInTimeZone(date, "Europe/Amsterdam", "yyyyMMdd");
}

export function eventToVEvent(event: EventWithPublisherOrgName): string {
  const summary = pickLocalized(event.titleNl, event.titleEn, "nl");
  const description = pickLocalized(event.descriptionNl, event.descriptionEn, "nl");
  const locationParts = [
    event.locationStreet && event.locationHouseNumber
      ? `${event.locationStreet} ${event.locationHouseNumber}`
      : null,
    event.locationPostcode,
    event.locationDescription,
  ].filter((part): part is string => !!part);
  /**
   * Which real-world organization published the event: an imported event
   * carries organizerName directly (see Event.organizerName), otherwise
   * it's whichever org the event was published on behalf of, if any -
   * never set for an event published by an individual.
   */
  const organizationName = event.organizerName ?? event.publisherOrgName;

  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.id.value}@veganactivists.nl`,
    `DTSTAMP:${formatIcsDate(event.updatedAt)}`,
    event.startTimeKnown
      ? `DTSTART:${formatIcsDate(event.startAt)}`
      : `DTSTART;VALUE=DATE:${formatIcsDateOnly(event.startAt)}`,
    event.endAt
      ? event.endTimeKnown
        ? `DTEND:${formatIcsDate(event.endAt)}`
        : `DTEND;VALUE=DATE:${formatIcsDateOnly(event.endAt)}`
      : null,
    summary ? `SUMMARY:${escapeIcsText(summary)}` : null,
    description ? `DESCRIPTION:${escapeIcsText(description)}` : null,
    locationParts.length > 0 ? `LOCATION:${escapeIcsText(locationParts.join(", "))}` : null,
    /**
     * Always our own canonical event page, not externalEventUrl (an
     * organizer-supplied "more info" link, already shown on that same page) -
     * this is the identifying signal import-arc-events.ts's ownEventUrl check
     * relies on to recognize an event we published, once ARC republishes it
     * and we later re-import their feed. Never omit this: an event without it
     * would look, from that importer's perspective, exactly like one that
     * genuinely originated on ARC.
     */
    `URL:${escapeIcsText(`${BASE_URL}/nl/events/${event.slug}`)}`,
    organizationName ? `ORG:${escapeIcsText(organizationName)}` : null,
    "END:VEVENT",
  ].filter((line): line is string => line !== null);

  return lines.map(foldLine).join("\r\n");
}

export default defineHandler(async (h3Event) => {
  const query = getQuery(h3Event);
  const excludeExternalSourceRaw = query.exclude_external_source;
  const excludeExternalSource = Array.isArray(excludeExternalSourceRaw)
    ? (excludeExternalSourceRaw[0] ?? null)
    : (excludeExternalSourceRaw ?? null);

  const result = await eventService.listUpcomingVisibleEvents(
    typeof excludeExternalSource === "string" ? excludeExternalSource : null,
  );
  const events = result.match(
    (found) => found,
    () => [],
  );

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vegan Activists NL//events.ics//NL",
    "CALSCALE:GREGORIAN",
    ...events.map(eventToVEvent),
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="events.ics"',
      "cache-control": "public, max-age=300",
    },
  });
});
