import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatEventDate } from "./format-date";

function localIso(year: number, month: number, day: number, hour = 10, minute = 0): string {
  return new Date(year, month, day, hour, minute).toISOString();
}

describe("formatEventDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 16, 9, 0)); // Wed 16 Sep 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 'Today' plus the time for an event starting today", () => {
    expect(formatEventDate(localIso(2026, 8, 16, 14, 0), "en")).toBe("Today 14:00");
    expect(formatEventDate(localIso(2026, 8, 16, 14, 0), "nl")).toBe("Vandaag 14:00");
  });

  it("shows 'Tomorrow' plus the time for an event starting tomorrow", () => {
    expect(formatEventDate(localIso(2026, 8, 17, 9, 30), "en")).toBe("Tomorrow 09:30");
    expect(formatEventDate(localIso(2026, 8, 17, 9, 30), "nl")).toBe("Morgen 09:30");
  });

  it("leads with the short weekday and omits the year for a date later this year", () => {
    expect(formatEventDate(localIso(2026, 9, 24, 14, 0), "en")).toBe("Sat 24 Oct 14:00");
  });

  it("includes the year for a date in a different year", () => {
    expect(formatEventDate(localIso(2027, 0, 5, 14, 0), "en")).toBe("Tue 5 Jan 2027 14:00");
  });

  it("does not treat a date a week from now as 'today' or 'tomorrow'", () => {
    const result = formatEventDate(localIso(2026, 8, 23, 14, 0), "en");
    expect(result).not.toContain("Today");
    expect(result).not.toContain("Tomorrow");
    expect(result).toBe("Wed 23 Sept 14:00");
  });
});
