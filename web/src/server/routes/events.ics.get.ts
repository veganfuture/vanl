import { defineHandler, getQuery } from "h3";
import type { EventWithPublisherOrgName } from "~/domain/events/event_repository";
import { eventService } from "~/domain/events/event_service";
import {
  escapeIcsText,
  foldLine,
  formatIcsDate,
  formatIcsDateTimeProperty,
  formatIcsUid,
} from "~/lib/ics";
import { pickLocalized } from "~/lib/i18n";

/**
 * Deliberately a nitro-native serverDir route (not a SolidStart
 * src/routes/**.ts one) - same reasoning as
 * src/server/routes/images/[sha256].get.ts, the only other non-JSON
 * response in this app: a raw text/calendar body needs to bypass
 * SolidStart's generic route handling entirely.
 */

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
    formatIcsUid(event.id.value),
    `DTSTAMP:${formatIcsDate(event.updatedAt)}`,
    formatIcsDateTimeProperty("DTSTART", event.startAt, event.startTimeKnown),
    event.endAt ? formatIcsDateTimeProperty("DTEND", event.endAt, event.endTimeKnown) : null,
    summary ? `SUMMARY:${escapeIcsText(summary)}` : null,
    description ? `DESCRIPTION:${escapeIcsText(description)}` : null,
    locationParts.length > 0 ? `LOCATION:${escapeIcsText(locationParts.join(", "))}` : null,
    event.externalEventUrl ? `URL:${escapeIcsText(event.externalEventUrl)}` : null,
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
