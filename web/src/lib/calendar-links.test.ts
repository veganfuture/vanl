import { describe, expect, it } from "vitest";
import {
  buildIcsFile,
  googleCalendarUrl,
  office365Url,
  outlookComUrl,
  type CalendarEventInput,
} from "./calendar-links";

const timedEvent: CalendarEventInput = {
  title: "Vegan potluck",
  description: "Bring a dish to share",
  location: "Amsterdam",
  startAt: new Date("2026-10-24T18:00:00.000Z"),
  startTimeKnown: true,
  endAt: new Date("2026-10-24T20:00:00.000Z"),
};

const allDayEvent: CalendarEventInput = {
  title: "Animal Rights March",
  description: "All day demonstration",
  location: "Den Haag",
  // Amsterdam midnight on 2026-10-24 is 2026-10-23T22:00:00Z (CEST, UTC+2).
  startAt: new Date("2026-10-23T22:00:00.000Z"),
  startTimeKnown: false,
  endAt: null,
};

describe("googleCalendarUrl", () => {
  it("encodes a timed event as a UTC start/end pair", () => {
    const url = new URL(googleCalendarUrl(timedEvent));
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261024T180000Z/20261024T200000Z");
    expect(url.searchParams.get("text")).toBe("Vegan potluck");
  });

  it("encodes an all-day event with an exclusive end date one day past the last covered day", () => {
    const url = new URL(googleCalendarUrl(allDayEvent));
    expect(url.searchParams.get("dates")).toBe("20261024/20261025");
  });
});

describe("outlookComUrl / office365Url", () => {
  it("passes allday=false and ISO timestamps for a timed event", () => {
    const url = new URL(outlookComUrl(timedEvent));
    expect(url.searchParams.get("allday")).toBe("false");
    expect(url.searchParams.get("startdt")).toBe("2026-10-24T18:00:00.000Z");
    expect(url.searchParams.get("enddt")).toBe("2026-10-24T20:00:00.000Z");
  });

  it("passes allday=true and bare dates for an all-day event", () => {
    const url = new URL(office365Url(allDayEvent));
    expect(url.searchParams.get("allday")).toBe("true");
    expect(url.searchParams.get("startdt")).toBe("2026-10-24");
    expect(url.searchParams.get("enddt")).toBe("2026-10-25");
  });

  it("defaults a missing endAt to one hour later for a timed event", () => {
    const url = new URL(outlookComUrl({ ...timedEvent, endAt: null }));
    expect(url.searchParams.get("startdt")).toBe("2026-10-24T18:00:00.000Z");
    expect(url.searchParams.get("enddt")).toBe("2026-10-24T19:00:00.000Z");
  });
});

describe("buildIcsFile", () => {
  it("emits a timed VEVENT with UTC DTSTART/DTEND", () => {
    const ics = buildIcsFile({ ...timedEvent, uid: "abc123" });
    expect(ics).toContain("UID:abc123@veganactivists.nl");
    expect(ics).toContain("DTSTART:20261024T180000Z");
    expect(ics).toContain("DTEND:20261024T200000Z");
    expect(ics).toContain("SUMMARY:Vegan potluck");
  });

  it("emits an all-day VEVENT with VALUE=DATE and an exclusive end", () => {
    const ics = buildIcsFile({ ...allDayEvent, uid: "def456" });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261024");
    expect(ics).toContain("DTEND;VALUE=DATE:20261025");
  });

  it("escapes RFC 5545 special characters in text fields", () => {
    const ics = buildIcsFile({
      ...timedEvent,
      title: "Talk; Q&A, discussion",
      uid: "esc1",
    });
    expect(ics).toContain("SUMMARY:Talk\\; Q&A\\, discussion");
  });
});
