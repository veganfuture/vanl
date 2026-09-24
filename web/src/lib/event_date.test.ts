import { describe, expect, it } from "vitest";
import { resolveDateOnlyInstant, resolveDateOnlyInstantFromParts } from "./event_date";

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
