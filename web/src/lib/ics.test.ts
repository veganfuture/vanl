import { describe, expect, it } from "vitest";
import {
  escapeIcsText,
  foldLine,
  formatIcsDate,
  formatIcsDateOnly,
  formatIcsDateTimeProperty,
  formatIcsUid,
} from "./ics";

describe("escapeIcsText", () => {
  it("escapes backslash, semicolon, comma and newline per RFC 5545 §3.3.11", () => {
    expect(escapeIcsText("Talk; Q&A, line1\nline2\\end")).toBe(
      "Talk\\; Q&A\\, line1\\nline2\\\\end",
    );
  });
});

describe("foldLine", () => {
  it("leaves short lines untouched", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds lines longer than 75 octets with a single leading space", () => {
    const long = "SUMMARY:" + "a".repeat(80);
    const folded = foldLine(long);
    const parts = folded.split("\r\n ");
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBe(75);
    expect(parts[0] + parts[1]).toBe(long);
  });
});

describe("formatIcsDate", () => {
  it("formats a UTC instant as a basic-format DTSTAMP", () => {
    expect(formatIcsDate(new Date("2026-09-19T18:00:00.000Z"))).toBe("20260919T180000Z");
  });
});

describe("formatIcsDateOnly", () => {
  it("reads the calendar date in Amsterdam local time, not UTC", () => {
    // Amsterdam midnight (CEST, UTC+2) on 2026-09-19 stored as a UTC instant.
    expect(formatIcsDateOnly(new Date("2026-09-18T22:00:00.000Z"))).toBe("20260919");
  });
});

describe("formatIcsDateTimeProperty", () => {
  it("emits a full UTC timestamp when timeKnown is true", () => {
    expect(formatIcsDateTimeProperty("DTSTART", new Date("2026-09-19T18:00:00.000Z"), true)).toBe(
      "DTSTART:20260919T180000Z",
    );
  });

  it("emits VALUE=DATE with the Amsterdam calendar date when timeKnown is false", () => {
    expect(formatIcsDateTimeProperty("DTEND", new Date("2026-09-18T22:00:00.000Z"), false)).toBe(
      "DTEND;VALUE=DATE:20260919",
    );
  });
});

describe("formatIcsUid", () => {
  it("appends the shared domain suffix", () => {
    expect(formatIcsUid("abc-123")).toBe("UID:abc-123@veganactivists.nl");
  });
});
