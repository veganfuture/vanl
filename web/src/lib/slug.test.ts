import { describe, expect, it } from "vitest";
import { generateSlug } from "./slug";

describe("generateSlug", () => {
  it("lowercases, hyphenates, and strips diacritics", () => {
    const slug = generateSlug("Café Meetup: Vegan Potluck!");
    expect(slug).toMatch(/^cafe-meetup-vegan-potluck-[0-9a-f]{8}$/);
  });

  it("produces a different suffix each time for the same title", () => {
    const a = generateSlug("Repeat Event");
    const b = generateSlug("Repeat Event");
    expect(a).not.toBe(b);
  });

  it("falls back to just the suffix when the title has no slug-able characters", () => {
    const slug = generateSlug("🌱🌱🌱");
    expect(slug).toMatch(/^[0-9a-f]{8}$/);
  });
});
