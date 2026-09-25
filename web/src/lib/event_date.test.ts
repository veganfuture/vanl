import { describe, expect, it } from "vitest";
import {
  resolveDateOnlyInstant,
  resolveDateOnlyInstantFromParts,
  resolveDateOnlyParts,
} from "./event_date";

describe("resolveDateOnlyInstant", () => {
  it("resolves a summer (CEST, UTC+2) calendar date to Amsterdam midnight as UTC", () => {
    expect(resolveDateOnlyInstant("2026-09-19").toISOString()).toBe("2026-09-18T22:00:00.000Z");
  });

  it("resolves a winter (CET, UTC+1) calendar date to Amsterdam midnight as UTC", () => {
    expect(resolveDateOnlyInstant("2026-01-19").toISOString()).toBe("2026-01-18T23:00:00.000Z");
  });
});

describe("resolveDateOnlyInstantFromParts", () => {
  it("resolves a summer (CEST, UTC+2) calendar date to Amsterdam midnight as UTC", () => {
    expect(resolveDateOnlyInstantFromParts(2026, 9, 19).toISOString()).toBe(
      "2026-09-18T22:00:00.000Z",
    );
  });

  it("resolves a winter (CET, UTC+1) calendar date to Amsterdam midnight as UTC", () => {
    expect(resolveDateOnlyInstantFromParts(2026, 1, 19).toISOString()).toBe(
      "2026-01-18T23:00:00.000Z",
    );
  });

  it("treats month as 1-indexed, matching the calendar rather than JS Date's getMonth()", () => {
    expect(resolveDateOnlyInstantFromParts(2026, 1, 1).toISOString()).toBe(
      "2025-12-31T23:00:00.000Z",
    );
  });

  it("agrees with resolveDateOnlyInstant for the same calendar day", () => {
    expect(resolveDateOnlyInstantFromParts(2026, 9, 19).toISOString()).toBe(
      resolveDateOnlyInstant("2026-09-19").toISOString(),
    );
  });
});

describe("resolveDateOnlyParts", () => {
  it("reads the Amsterdam calendar day back out of a summer (CEST) instant", () => {
    expect(resolveDateOnlyParts(new Date("2026-09-18T22:00:00.000Z"))).toEqual({
      year: 2026,
      month: 9,
      day: 19,
    });
  });

  it("reads the Amsterdam calendar day back out of a winter (CET) instant", () => {
    expect(resolveDateOnlyParts(new Date("2026-01-18T23:00:00.000Z"))).toEqual({
      year: 2026,
      month: 1,
      day: 19,
    });
  });

  it("round-trips with resolveDateOnlyInstantFromParts", () => {
    expect(resolveDateOnlyParts(resolveDateOnlyInstantFromParts(2026, 9, 19))).toEqual({
      year: 2026,
      month: 9,
      day: 19,
    });
  });

  it("rolls a day-of-month overflow over into the next month via the plain Date constructor, matching resolveDateOnlyInstantFromParts", () => {
    // Passing day 32 for a 31-day month is exactly how calendar-links.ts
    // computes "the day after the last day of the month" without a
    // string round trip - relies on this same rollover.
    expect(resolveDateOnlyInstantFromParts(2026, 10, 32).toISOString()).toBe(
      resolveDateOnlyInstantFromParts(2026, 11, 1).toISOString(),
    );
  });
});
