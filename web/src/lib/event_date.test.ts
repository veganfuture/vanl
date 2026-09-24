import { describe, expect, it } from "vitest";
import { resolveDateOnlyInstant } from "./event_date";

describe("resolveDateOnlyInstant", () => {
  it("resolves a summer (CEST, UTC+2) calendar date to Amsterdam midnight as UTC", () => {
    expect(resolveDateOnlyInstant("2026-09-19").toISOString()).toBe("2026-09-18T22:00:00.000Z");
  });

  it("resolves a winter (CET, UTC+1) calendar date to Amsterdam midnight as UTC", () => {
    expect(resolveDateOnlyInstant("2026-01-19").toISOString()).toBe("2026-01-18T23:00:00.000Z");
  });
});
