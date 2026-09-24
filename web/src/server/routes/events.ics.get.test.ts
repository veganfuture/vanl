import { describe, expect, it } from "vitest";
import type { EventWithPublisherOrgName } from "~/domain/events/event_repository";
import { eventToVEvent } from "./events.ics.get";

function baseEvent(overrides: Partial<EventWithPublisherOrgName> = {}): EventWithPublisherOrgName {
  return {
    id: { value: "11111111-1111-1111-1111-111111111111" },
    slug: "test-evenement",
    updatedAt: new Date("2026-01-01T12:00:00.000Z"),
    startAt: new Date("2026-09-19T00:00:00.000Z"),
    startTimeKnown: true,
    endAt: null,
    endTimeKnown: true,
    titleNl: "Test evenement",
    titleEn: null,
    descriptionNl: "Een test evenement",
    descriptionEn: null,
    locationStreet: null,
    locationHouseNumber: null,
    locationPostcode: null,
    locationDescription: "Ergens",
    externalEventUrl: null,
    organizerName: null,
    publisherOrgName: null,
    ...overrides,
  } as unknown as EventWithPublisherOrgName;
}

describe("eventToVEvent", () => {
  it("emits a timed DTSTART/DTEND when the time is known", () => {
    const ics = eventToVEvent(
      baseEvent({
        startAt: new Date("2026-09-19T18:00:00.000Z"),
        startTimeKnown: true,
        endAt: new Date("2026-09-19T20:00:00.000Z"),
        endTimeKnown: true,
      }),
    );

    expect(ics).toContain("DTSTART:20260919T180000Z");
    expect(ics).toContain("DTEND:20260919T200000Z");
    expect(ics).not.toContain("VALUE=DATE");
  });

  it("emits an all-day DTSTART when startTimeKnown is false, with no time-of-day component", () => {
    const ics = eventToVEvent(
      baseEvent({
        // Amsterdam midnight (CEST, UTC+2) on 2026-09-19 stored as a UTC instant.
        startAt: new Date("2026-09-18T22:00:00.000Z"),
        startTimeKnown: false,
        endAt: null,
      }),
    );

    expect(ics).toContain("DTSTART;VALUE=DATE:20260919");
    expect(ics).not.toMatch(/DTSTART:\d{8}T/);
  });

  it("emits an all-day DTEND when endTimeKnown is false", () => {
    const ics = eventToVEvent(
      baseEvent({
        startAt: new Date("2026-09-18T22:00:00.000Z"),
        startTimeKnown: false,
        endAt: new Date("2026-09-19T22:00:00.000Z"),
        endTimeKnown: false,
      }),
    );

    expect(ics).toContain("DTSTART;VALUE=DATE:20260919");
    expect(ics).toContain("DTEND;VALUE=DATE:20260920");
  });

  it("omits DTEND entirely when endAt is null, regardless of endTimeKnown", () => {
    const ics = eventToVEvent(
      baseEvent({ endAt: null, endTimeKnown: false, startTimeKnown: true }),
    );

    expect(ics).not.toContain("DTEND");
  });

  it("always emits URL as the event's own canonical page, regardless of externalEventUrl", () => {
    const ics = eventToVEvent(
      baseEvent({ slug: "cube-of-truth-nijmegen", externalEventUrl: "https://facebook.com/events/123" }),
    );

    expect(ics).toContain("URL:https://veganactivists.nl/nl/events/cube-of-truth-nijmegen");
    expect(ics).not.toContain("facebook.com");
  });
});
