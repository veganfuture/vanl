import { describe, expect, it } from "vitest";
import { lookupAddress, reverseGeocode, suggestAddresses } from "./pdok-client";

/**
 * Hits the real pdok.nl API (free, public, no key needed) rather than
 * mocking it - consistent with this project's existing domain tests, which
 * run against a real Postgres rather than a fake one.
 */

describe("suggestAddresses", () => {
  it("finds a real address by free-text query", async () => {
    const result = await suggestAddresses("Europalaan 93 Utrecht");
    const suggestions = result._unsafeUnwrap();

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].label).toContain("Europalaan");
    expect(suggestions[0].pdokId).toMatch(/^adr-/);
  });
});

describe("lookupAddress", () => {
  it("resolves a known address id to its canonical fields", async () => {
    const result = await lookupAddress("adr-bf54db721969487ed33ba84d9973c702");
    const address = result._unsafeUnwrap();

    expect(address).toMatchObject({
      pdokId: "adr-bf54db721969487ed33ba84d9973c702",
      street: "Europalaan",
      houseNumber: "93",
      postcode: "3526KP",
      woonplaatsNaam: "Utrecht",
    });
    expect(address.lat).toBeCloseTo(52.06415055, 4);
    expect(address.lng).toBeCloseTo(5.10696041, 4);
  });

  it("returns a PdokError for an unknown id", async () => {
    const result = await lookupAddress("adr-does-not-exist");
    expect(result.isErr()).toBe(true);
  });
});

describe("reverseGeocode", () => {
  it("finds a small distance for a coordinate inside the Netherlands", async () => {
    const result = await reverseGeocode(52.0717544, 5.546723); // Renswoude
    const found = result._unsafeUnwrap();

    expect(found).not.toBeNull();
    expect(found!.distanceMeters).toBeLessThan(100);
    expect(found!.address.woonplaatsNaam).toBe("Renswoude");
  });

  it("finds a large distance for a coordinate across the German border", async () => {
    const result = await reverseGeocode(51.2277, 6.7735); // Düsseldorf, Germany
    const found = result._unsafeUnwrap();

    expect(found).not.toBeNull();
    expect(found!.distanceMeters).toBeGreaterThan(10_000);
  });
});
