import { describe, expect, it } from "vitest";
import { validateEvent, type ValidatableEvent } from "./event_validation";

function baseEvent(overrides: Partial<ValidatableEvent> = {}): ValidatableEvent {
  return {
    titleNl: null,
    titleEn: "Test Event",
    descriptionNl: null,
    descriptionEn: "A test event",
    startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endAt: null,
    locationKind: "meeting_point_city_only",
    placeId: "11111111-1111-1111-1111-111111111111",
    locationDescription: "Somewhere in town",
    pdokAddressId: null,
    mapUrl: null,
    externalEventUrl: null,
    registrationUrl: null,
    ...overrides,
  };
}

describe("validateEvent", () => {
  it("accepts a fully valid meeting_point_city_only event", () => {
    const result = validateEvent(baseEvent(), { lang: "en", requireFutureStart: true });
    expect(result.isOk()).toBe(true);
  });

  it("accepts a fully valid precise_address event", () => {
    const result = validateEvent(
      baseEvent({ locationKind: "precise_address", placeId: null, pdokAddressId: "adr-123" }),
      { lang: "en", requireFutureStart: true },
    );
    expect(result.isOk()).toBe(true);
  });

  it("rejects when neither titleNl nor titleEn is given", () => {
    const result = validateEvent(baseEvent({ titleEn: null, descriptionEn: null }), {
      lang: "en",
      requireFutureStart: true,
    });
    expect(result._unsafeUnwrapErr()).toContain("Enter a title (Dutch, English, or both).");
  });

  it("rejects a title given without its matching-language description", () => {
    const result = validateEvent(baseEvent({ titleNl: "Titel zonder beschrijving" }), {
      lang: "en",
      requireFutureStart: true,
    });
    expect(result._unsafeUnwrapErr()).toContain(
      "The Dutch title and description must be given together.",
    );
  });

  it("rejects a description given without its matching-language title", () => {
    const result = validateEvent(baseEvent({ descriptionNl: "Beschrijving zonder titel" }), {
      lang: "en",
      requireFutureStart: true,
    });
    expect(result._unsafeUnwrapErr()).toContain(
      "The Dutch title and description must be given together.",
    );
  });

  it("rejects a missing startAt", () => {
    const result = validateEvent(baseEvent({ startAt: null }), {
      lang: "en",
      requireFutureStart: true,
    });
    expect(result._unsafeUnwrapErr()).toContain("Choose a start date and time.");
  });

  it("rejects a past startAt when requireFutureStart is set", () => {
    const result = validateEvent(
      baseEvent({ startAt: new Date(Date.now() - 24 * 60 * 60 * 1000) }),
      { lang: "en", requireFutureStart: true },
    );
    expect(result._unsafeUnwrapErr()).toContain("The start date can't be in the past.");
  });

  it("allows a past startAt when requireFutureStart is not set (editing)", () => {
    const result = validateEvent(
      baseEvent({ startAt: new Date(Date.now() - 24 * 60 * 60 * 1000) }),
      { lang: "en", requireFutureStart: false },
    );
    expect(result.isOk()).toBe(true);
  });

  it("rejects an endAt at or before startAt", () => {
    const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const endAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const result = validateEvent(baseEvent({ startAt, endAt }), {
      lang: "en",
      requireFutureStart: true,
    });
    expect(result._unsafeUnwrapErr()).toContain("The end date must be after the start date.");
  });

  it("rejects precise_address without a pdokAddressId", () => {
    const result = validateEvent(
      baseEvent({ locationKind: "precise_address", placeId: null, pdokAddressId: null }),
      { lang: "en", requireFutureStart: true },
    );
    expect(result._unsafeUnwrapErr()).toContain("Search and pick an address.");
  });

  it("rejects meeting_point_city_only without a placeId", () => {
    const result = validateEvent(baseEvent({ placeId: null }), {
      lang: "en",
      requireFutureStart: true,
    });
    expect(result._unsafeUnwrapErr()).toContain("Search and pick a city or town.");
  });

  it("rejects an empty locationDescription", () => {
    const result = validateEvent(baseEvent({ locationDescription: "   " }), {
      lang: "en",
      requireFutureStart: true,
    });
    expect(result._unsafeUnwrapErr()).toContain("Enter a location description.");
  });

  it("rejects a malformed mapUrl", () => {
    const result = validateEvent(baseEvent({ mapUrl: "not-a-url" }), {
      lang: "en",
      requireFutureStart: true,
    });
    expect(result._unsafeUnwrapErr()).toContain("Map URL is not a valid URL.");
  });

  it("reports every failing rule at once, not just the first", () => {
    const result = validateEvent(
      baseEvent({ titleEn: null, descriptionEn: null, locationDescription: "", startAt: null }),
      { lang: "en", requireFutureStart: true },
    );
    expect(result._unsafeUnwrapErr().length).toBeGreaterThanOrEqual(3);
  });

  it("produces Dutch messages when lang is nl", () => {
    const result = validateEvent(baseEvent({ startAt: null }), {
      lang: "nl",
      requireFutureStart: true,
    });
    expect(result._unsafeUnwrapErr()).toContain("Kies een startdatum en -tijd.");
  });
});
