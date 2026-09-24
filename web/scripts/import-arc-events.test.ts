import type { VEvent } from "node-ical";
import { describe, expect, it } from "vitest";
import {
  detectOrganizer,
  flyerUrlOf,
  isOwnEventUrl,
  reusedFlyerUrls,
  toRealEvent,
  type RealEvent,
} from "./import-arc-events";

function baseEvent(overrides: Partial<RealEvent> = {}): RealEvent {
  return {
    externalSourceId: "test-id",
    titleNl: null,
    titleEn: null,
    descriptionNl: null,
    descriptionEn: null,
    startAt: new Date(),
    startTimeKnown: true,
    endAt: null,
    endTimeKnown: true,
    location: "Somewhere",
    geo: { lat: 52, lon: 5 },
    flyerUrl: null,
    sourceUrl: null,
    ...overrides,
  };
}

describe("toRealEvent", () => {
  /**
   * Synthetic fixtures, not captured from a live pull - the ARC feed
   * currently has no VALUE=DATE (date-only) VEVENTs to sample from. Mirrors
   * node-ical's own documented shape instead: `DateWithTimeZone = Date &
   * {tz?: string; dateOnly?: true}` (node_modules/node-ical/node-ical.d.ts).
   */
  function dateOnly(iso: string): VEvent["start"] {
    const date = new Date(iso) as VEvent["start"];
    date.dateOnly = true;
    return date;
  }

  it("marks startTimeKnown/endTimeKnown false for a date-only VEVENT", () => {
    const event = {
      uid: "date-only-event",
      start: dateOnly("2026-09-19T00:00:00.000Z"),
      end: dateOnly("2026-09-20T00:00:00.000Z"),
      geo: { lat: 52, lon: 5 },
      location: { val: "Somewhere" },
      summary: { val: "All-day event" },
      description: { val: "A description" },
    } as unknown as VEvent;

    const result = toRealEvent([event]);

    expect(result.startTimeKnown).toBe(false);
    expect(result.endTimeKnown).toBe(false);
  });

  it("marks startTimeKnown/endTimeKnown true for a normal timed VEVENT", () => {
    const event = {
      uid: "timed-event",
      start: new Date("2026-09-19T18:00:00.000Z") as VEvent["start"],
      end: new Date("2026-09-19T20:00:00.000Z") as VEvent["start"],
      geo: { lat: 52, lon: 5 },
      location: { val: "Somewhere" },
      summary: { val: "Evening event" },
      description: { val: "A description" },
    } as unknown as VEvent;

    const result = toRealEvent([event]);

    expect(result.startTimeKnown).toBe(true);
    expect(result.endTimeKnown).toBe(true);
  });

  it("treats endTimeKnown as true when there is no end at all", () => {
    const event = {
      uid: "no-end-event",
      start: new Date("2026-09-19T18:00:00.000Z") as VEvent["start"],
      geo: { lat: 52, lon: 5 },
      location: { val: "Somewhere" },
      summary: { val: "No end event" },
      description: { val: "A description" },
    } as unknown as VEvent;

    const result = toRealEvent([event]);

    expect(result.endAt).toBeNull();
    expect(result.endTimeKnown).toBe(true);
  });

  it("never fills titleNl/descriptionNl, only titleEn/descriptionEn", () => {
    const event = {
      uid: "single-event",
      start: new Date("2026-09-19T18:00:00.000Z") as VEvent["start"],
      end: new Date("2026-09-19T20:00:00.000Z") as VEvent["start"],
      geo: { lat: 52, lon: 5 },
      location: { val: "Somewhere" },
      summary: { val: "Street outreach" },
      description: { val: "Join us for a street outreach event." },
    } as unknown as VEvent;

    const result = toRealEvent([event]);

    expect(result.titleNl).toBeNull();
    expect(result.descriptionNl).toBeNull();
    expect(result.titleEn).toBe("Street outreach");
    expect(result.descriptionEn).toBe("Join us for a street outreach event.");
  });

  it("prefers real text over ARC's '(No description available)' placeholder from a paired VEVENT", () => {
    // Real bug: ARC posts a second VEVENT for the "other" language that has
    // no actual translation, using this literal placeholder instead of
    // omitting the property - it must never win over the sibling's real text.
    const real = {
      uid: "b-real",
      start: new Date("2026-09-19T18:00:00.000Z") as VEvent["start"],
      end: new Date("2026-09-19T20:00:00.000Z") as VEvent["start"],
      geo: { lat: 52, lon: 5 },
      location: { val: "Somewhere" },
      summary: { val: "Street outreach" },
      description: { val: "Join us for a street outreach event." },
    } as unknown as VEvent;
    const placeholder = {
      uid: "a-placeholder",
      start: real.start,
      end: real.end,
      geo: { lat: 52, lon: 5 },
      location: { val: "Somewhere" },
      summary: { val: "(No title available)" },
      description: { val: "(No description available)" },
    } as unknown as VEvent;

    const result = toRealEvent([placeholder, real]);

    expect(result.titleNl).toBeNull();
    expect(result.descriptionNl).toBeNull();
    expect(result.titleEn).toBe("Street outreach");
    expect(result.descriptionEn).toBe("Join us for a street outreach event.");
  });

  it("captures the VEVENT's url as sourceUrl", () => {
    const event = {
      uid: "with-url",
      url: "https://veganactivists.nl/nl/events/some-event",
      start: new Date("2026-09-19T18:00:00.000Z") as VEvent["start"],
      end: new Date("2026-09-19T20:00:00.000Z") as VEvent["start"],
      geo: { lat: 52, lon: 5 },
      location: { val: "Somewhere" },
      summary: { val: "Street outreach" },
      description: { val: "A description" },
    } as unknown as VEvent;

    expect(toRealEvent([event]).sourceUrl).toBe("https://veganactivists.nl/nl/events/some-event");
  });

  it("sets sourceUrl to null when no member of the group has a url", () => {
    const event = {
      uid: "no-url",
      start: new Date("2026-09-19T18:00:00.000Z") as VEvent["start"],
      end: new Date("2026-09-19T20:00:00.000Z") as VEvent["start"],
      geo: { lat: 52, lon: 5 },
      location: { val: "Somewhere" },
      summary: { val: "Street outreach" },
      description: { val: "A description" },
    } as unknown as VEvent;

    expect(toRealEvent([event]).sourceUrl).toBeNull();
  });
});

describe("isOwnEventUrl", () => {
  it("recognizes our own canonical event page, in either language", () => {
    expect(isOwnEventUrl("https://veganactivists.nl/nl/events/cube-of-truth-nijmegen")).toBe(true);
    expect(isOwnEventUrl("https://veganactivists.nl/en/events/cube-of-truth-nijmegen")).toBe(true);
  });

  it("recognizes the www subdomain and a trailing slash", () => {
    expect(isOwnEventUrl("https://www.veganactivists.nl/nl/events/some-event")).toBe(true);
    expect(isOwnEventUrl("https://veganactivists.nl/nl/events/some-event/")).toBe(true);
  });

  it("rejects null", () => {
    expect(isOwnEventUrl(null)).toBe(false);
  });

  it("rejects a genuinely external ARC URL", () => {
    expect(isOwnEventUrl("https://animalrightscalendar.com/event/abc123")).toBe(false);
  });

  it("rejects our own domain used for something other than an event page", () => {
    expect(isOwnEventUrl("https://veganactivists.nl/nl/organizations/some-org")).toBe(false);
    expect(isOwnEventUrl("https://veganactivists.nl/")).toBe(false);
  });

  it("rejects a URL that merely embeds our domain as a path/query, not the actual host", () => {
    // Anchored to the start of the string on purpose - a spoofed URL like this
    // must never be treated as ours just because the substring appears in it.
    expect(isOwnEventUrl("https://evil.example/veganactivists.nl/nl/events/x")).toBe(false);
    expect(isOwnEventUrl("https://evil.example/?redirect=veganactivists.nl/nl/events/x")).toBe(
      false,
    );
  });
});

describe("detectOrganizer", () => {
  it("recognizes Cube of Truth as Anonymous for the Voiceless", () => {
    const event = baseEvent({ titleEn: "Cube of Truth: Eindhoven: 16 augustus: 12:45" });
    expect(detectOrganizer(event)).toBe("Anonymous for the Voiceless");
  });

  it("recognizes 'Anonymous for the Voiceless' spelled out as Anonymous for the Voiceless", () => {
    const event = baseEvent({ titleEn: "Anonymous for the Voiceless: street outreach" });
    expect(detectOrganizer(event)).toBe("Anonymous for the Voiceless");
  });

  it("recognizes an anonymousforthevoiceless.org link in the description as Anonymous for the Voiceless", () => {
    const event = baseEvent({
      titleEn: "Street outreach",
      descriptionEn: "More info at anonymousforthevoiceless.org.",
    });
    expect(detectOrganizer(event)).toBe("Anonymous for the Voiceless");
  });

  it("recognizes a cubeoftruth.com link in the description as Anonymous for the Voiceless", () => {
    const event = baseEvent({
      titleEn: "Street outreach",
      descriptionEn: "More info at cubeoftruth.com.",
    });
    expect(detectOrganizer(event)).toBe("Anonymous for the Voiceless");
  });

  it("recognizes 'We The Free' spelled out as We The Free", () => {
    const event = baseEvent({ titleEn: "We The Free presents: Movie Challenge" });
    expect(detectOrganizer(event)).toBe("We The Free");
  });

  it("recognizes an activism.wtf link in the description as We The Free", () => {
    const event = baseEvent({
      titleEn: "Movie Challenge",
      descriptionEn: "Sign up at activism.wtf.",
    });
    expect(detectOrganizer(event)).toBe("We The Free");
  });

  it("recognizes a mystats.wtf link in the description as We The Free", () => {
    const event = baseEvent({
      titleEn: "Movie Challenge",
      descriptionEn: "Track your progress at mystats.wtf.",
    });
    expect(detectOrganizer(event)).toBe("We The Free");
  });

  it("recognizes Save Square as Animal Save", () => {
    const event = baseEvent({ titleEn: "BREDA Save Square" });
    expect(detectOrganizer(event)).toBe("Animal Save");
  });

  it("recognizes Pig Save as Animal Save", () => {
    const event = baseEvent({ titleNl: "Utrecht Pig Save" });
    expect(detectOrganizer(event)).toBe("Animal Save");
  });

  it("recognizes savemovement.nl mention as Animal Save", () => {
    const event = baseEvent({
      titleEn: "Vigil for the animals",
      descriptionEn: "Organized by our group, see savemovement.nl for details.",
    });
    expect(detectOrganizer(event)).toBe("Animal Save");
  });

  it("recognizes PvdD as Partij voor de Dieren", () => {
    const event = baseEvent({ titleNl: "PvdD ledenvergadering" });
    expect(detectOrganizer(event)).toBe("Partij voor de Dieren");
  });

  it("recognizes a veganfuture.org link in the description as Vegan Future", () => {
    const event = baseEvent({
      titleEn: "Some meetup",
      descriptionEn: "See https://veganfuture.org/event/123 for details.",
    });
    expect(detectOrganizer(event)).toBe("Vegan Future");
  });

  it("recognizes XR Landbouw in the title", () => {
    const event = baseEvent({ titleNl: "XR Landbouw actiedag Den Haag" });
    expect(detectOrganizer(event)).toBe("XR Landbouw");
  });

  it("recognizes a stopdeuitbuiting.nl link in the description as XR Landbouw", () => {
    const event = baseEvent({
      titleEn: "Actiedag tegen de bio-industrie",
      descriptionNl: "Meer info op www.stopdeuitbuiting.nl.",
    });
    expect(detectOrganizer(event)).toBe("XR Landbouw");
  });

  it("recognizes Active for Justice in the title", () => {
    const event = baseEvent({ titleEn: "Active for Justice demonstration - Maastricht" });
    expect(detectOrganizer(event)).toBe("Active for Justice");
  });

  it("recognizes an activeforjustice.nl link in the description as Active for Justice", () => {
    const event = baseEvent({
      titleEn: "Demo",
      descriptionEn: "Details on https://activeforjustice.nl/events",
    });
    expect(detectOrganizer(event)).toBe("Active for Justice");
  });

  it("recognizes Animal Equality in the title", () => {
    const event = baseEvent({ titleEn: "Animal Equality: undercover footage screening" });
    expect(detectOrganizer(event)).toBe("Animal Equality");
  });

  it("recognizes an animalequality.org link in the description as Animal Equality", () => {
    const event = baseEvent({
      titleEn: "Screening night",
      descriptionEn: "Organized with https://animalequality.org support.",
    });
    expect(detectOrganizer(event)).toBe("Animal Equality");
  });

  it("recognizes Bite Back in the title", () => {
    const event = baseEvent({ titleNl: "Bite Back vegan outreach Utrecht - Dierendag" });
    expect(detectOrganizer(event)).toBe("Bite Back");
  });

  it("recognizes a biteback.nl link in the description as Bite Back", () => {
    const event = baseEvent({
      titleEn: "World Plant Milk Day",
      descriptionNl: "Vragen? Mail info@biteback.nl.",
    });
    expect(detectOrganizer(event)).toBe("Bite Back");
  });

  it("does not attribute a joint demonstration to Bite Back on a bare mention", () => {
    // Real ARC event: Bite Back is one of many co-participants listed in the
    // body text, not the organizer - no "Bite Back" in the title, no
    // biteback.nl link, so this must not match.
    const event = baseEvent({
      titleNl: "Dierendagdemonstratie Amsterdam 2026",
      descriptionNl:
        "Wie doen er mee: Active for Justice, Animal Equality, Animal Rights, " +
        "Animal Save Nederland, Anonymous for the Voiceless, Bite Back, DAM, " +
        "NEON Black, Red een Legkip, Vegan Amsterdam",
    });
    expect(detectOrganizer(event)).not.toBe("Bite Back");
  });

  it("recognizes a 'Hosted by International Council for Animal Welfare' description as ICAW", () => {
    // Real ARC event text: ICAW's events carry no title mention and no
    // domain link, just this literal trailing line in the description.
    const event = baseEvent({
      titleEn: "Protest against fur: Milan Fashion Week Campaign",
      descriptionEn:
        "Get up-to-date information at: https://luma.com/9uuqzdxu\n\nAddress:\nGebouw Parnas\n" +
        "Amsterdam, Netherlands\n\nHosted by International Council for Animal Welfare",
    });
    expect(detectOrganizer(event)).toBe("International Council for Animal Welfare");
  });

  it("recognizes an i-caw.org link in the description as ICAW", () => {
    const event = baseEvent({
      titleEn: "Vegan outreach event",
      descriptionEn: "Questions? Visit https://www.i-caw.org/ for more information.",
    });
    expect(detectOrganizer(event)).toBe("International Council for Animal Welfare");
  });

  it("returns null when nothing matches", () => {
    const event = baseEvent({ titleEn: "Vegan potluck", descriptionEn: "Bring a dish to share." });
    expect(detectOrganizer(event)).toBeNull();
  });

  it("does not false-positive on unrelated text containing similar substrings", () => {
    const event = baseEvent({ titleEn: "A totally unrelated event about something else" });
    expect(detectOrganizer(event)).toBeNull();
  });
});

describe("flyerUrlOf", () => {
  it("extracts the URL from an ATTACH property with FMTTYPE params", () => {
    // node-ical's real shape for a parameterized property, e.g.
    // ATTACH;FMTTYPE=image/jpeg:https://... - verified against a live feed pull.
    const event = {
      attach: {
        val: "https://assets.animalrightscalendar.com/event_images/abc/flyer.jpg",
        params: { FMTTYPE: "image/jpeg" },
      },
    } as unknown as VEvent;
    expect(flyerUrlOf(event)).toBe(
      "https://assets.animalrightscalendar.com/event_images/abc/flyer.jpg",
    );
  });

  it("returns null when there is no ATTACH property", () => {
    const event = {} as VEvent;
    expect(flyerUrlOf(event)).toBeNull();
  });
});

describe("reusedFlyerUrls", () => {
  it("flags an image url referenced by more than one event", () => {
    const events = [
      baseEvent({ externalSourceId: "a", flyerUrl: "https://example.com/shared.jpg" }),
      baseEvent({ externalSourceId: "b", flyerUrl: "https://example.com/shared.jpg" }),
      baseEvent({ externalSourceId: "c", flyerUrl: "https://example.com/unique.jpg" }),
    ];
    const reused = reusedFlyerUrls(events);
    expect(reused.has("https://example.com/shared.jpg")).toBe(true);
    expect(reused.has("https://example.com/unique.jpg")).toBe(false);
  });

  it("ignores events without a flyer url", () => {
    const events = [baseEvent({ flyerUrl: null })];
    expect(reusedFlyerUrls(events).size).toBe(0);
  });
});
