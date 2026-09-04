import { describe, expect, it } from "vitest";
import { detectOrganizer, type RealEvent } from "./import-arc-events";

function baseEvent(overrides: Partial<RealEvent> = {}): RealEvent {
  return {
    externalSourceId: "test-id",
    titleNl: null,
    titleEn: null,
    descriptionNl: null,
    descriptionEn: null,
    startAt: new Date(),
    endAt: null,
    location: "Somewhere",
    geo: { lat: 52, lon: 5 },
    externalEventUrl: null,
    ...overrides,
  };
}

describe("detectOrganizer", () => {
  it("recognizes Cube of Truth as Anonymous for the Voiceless", () => {
    const event = baseEvent({ titleEn: "Cube of Truth: Eindhoven: 16 augustus: 12:45" });
    expect(detectOrganizer(event)).toBe("Anonymous for the Voiceless");
  });

  it("recognizes WTF as We The Free", () => {
    const event = baseEvent({ titleEn: "WTF: Utrecht, Netherlands - WTF Movie Challenge" });
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

  it("returns null when nothing matches", () => {
    const event = baseEvent({ titleEn: "Vegan potluck", descriptionEn: "Bring a dish to share." });
    expect(detectOrganizer(event)).toBeNull();
  });

  it("does not false-positive on unrelated text containing similar substrings", () => {
    const event = baseEvent({ titleEn: "A totally unrelated event about something else" });
    expect(detectOrganizer(event)).toBeNull();
  });
});
