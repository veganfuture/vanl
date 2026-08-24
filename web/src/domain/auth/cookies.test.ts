import { describe, expect, it } from "vitest";
import { buildDeleteCookie, buildSetCookie, parseCookies } from "./cookies";

describe("parseCookies", () => {
  it("parses a typical Cookie header", () => {
    expect(parseCookies("a=1; b=two; c=three%20four")).toEqual({
      a: "1",
      b: "two",
      c: "three four",
    });
  });

  it("returns an empty object for null or empty input", () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies("")).toEqual({});
  });
});

describe("buildSetCookie", () => {
  it("is HttpOnly, Secure, and SameSite=Lax by default", () => {
    const header = buildSetCookie("vanl_session", "abc123", { maxAgeSeconds: 3600 });
    expect(header).toContain("vanl_session=abc123");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Max-Age=3600");
  });

  it("can opt out of HttpOnly", () => {
    const header = buildSetCookie("vanl_account_name", "alice", { httpOnly: false });
    expect(header).not.toContain("HttpOnly");
  });
});

describe("buildDeleteCookie", () => {
  it("expires the cookie immediately", () => {
    expect(buildDeleteCookie("vanl_session")).toContain("Max-Age=0");
  });
});
