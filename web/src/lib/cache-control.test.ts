import { describe, expect, it } from "vitest";
import {
  isPubliclyCacheablePath,
  resolveCacheControl,
  toLiteralSegment,
  toRoutePattern,
  toRouteSegments,
  toWildcardSegment,
} from "./cache-control";

describe("toRouteSegments", () => {
  it("strips the routes prefix, the .tsx extension, and a trailing /index", () => {
    expect(toRouteSegments("/src/routes/[lang]/events/index.tsx")).toEqual(["[lang]", "events"]);
  });

  it("keeps a dynamic segment as its own path segment", () => {
    expect(toRouteSegments("/src/routes/[lang]/events/[slug]/index.tsx")).toEqual([
      "[lang]",
      "events",
      "[slug]",
    ]);
  });

  it("keeps a non-index file as its own trailing segment", () => {
    expect(toRouteSegments("/src/routes/[lang]/events/mine.tsx")).toEqual([
      "[lang]",
      "events",
      "mine",
    ]);
  });

  it("handles a nested non-index file under a dynamic segment", () => {
    expect(toRouteSegments("/src/routes/[lang]/events/[slug]/edit.tsx")).toEqual([
      "[lang]",
      "events",
      "[slug]",
      "edit",
    ]);
  });
});

describe("toLiteralSegment", () => {
  it("escapes regex-special characters", () => {
    expect(toLiteralSegment("signup-help")).toBe("signup-help");
    expect(toLiteralSegment("a.b+c")).toBe("a\\.b\\+c");
  });
});

describe("toWildcardSegment", () => {
  // A synthetic route tree mirroring the real events/ directory shape:
  // events/index, events/mine, events/new, events/[slug]/index, events/[slug]/edit.
  const allRouteSegments = [
    ["[lang]", "events"],
    ["[lang]", "events", "mine"],
    ["[lang]", "events", "new"],
    ["[lang]", "events", "[slug]"],
    ["[lang]", "events", "[slug]", "edit"],
  ];

  it("excludes literal sibling route names from the wildcard", () => {
    const pattern = toWildcardSegment(["[lang]", "events"], allRouteSegments);
    const re = new RegExp(`^${pattern}$`);
    expect(re.test("mine")).toBe(false);
    expect(re.test("new")).toBe(false);
    expect(re.test("some-real-slug")).toBe(true);
  });

  it("is a plain wildcard when there are no literal siblings at that position", () => {
    // [lang] itself has no literal sibling - every route lives under it.
    const pattern = toWildcardSegment([], allRouteSegments);
    expect(pattern).toBe("[^/]+");
  });
});

describe("toRoutePattern", () => {
  const allRouteSegments = [
    ["[lang]", "events"],
    ["[lang]", "events", "mine"],
    ["[lang]", "events", "new"],
    ["[lang]", "events", "[slug]"],
    ["[lang]", "events", "[slug]", "edit"],
  ];

  it("matches the listing page", () => {
    const re = toRoutePattern("/src/routes/[lang]/events/index.tsx", allRouteSegments);
    expect(re.test("/nl/events")).toBe(true);
    expect(re.test("/nl/events/anything")).toBe(false);
  });

  it("matches a real slug but not a literal sibling route's name", () => {
    const re = toRoutePattern("/src/routes/[lang]/events/[slug]/index.tsx", allRouteSegments);
    expect(re.test("/nl/events/some-real-slug")).toBe(true);
    expect(re.test("/en/events/some-real-slug")).toBe(true);
    expect(re.test("/nl/events/mine")).toBe(false);
    expect(re.test("/nl/events/new")).toBe(false);
  });

  it("does not match a path nested deeper than the detail page", () => {
    const re = toRoutePattern("/src/routes/[lang]/events/[slug]/index.tsx", allRouteSegments);
    expect(re.test("/nl/events/some-real-slug/edit")).toBe(false);
  });
});

describe("isPubliclyCacheablePath (against the real route tree)", () => {
  it("recognizes the known-public pages", () => {
    expect(isPubliclyCacheablePath("/nl")).toBe(true);
    expect(isPubliclyCacheablePath("/nl/events")).toBe(true);
    expect(isPubliclyCacheablePath("/nl/events/some-slug")).toBe(true);
    expect(isPubliclyCacheablePath("/nl/organizations")).toBe(true);
    expect(isPubliclyCacheablePath("/nl/organizations/some-slug")).toBe(true);
    expect(isPubliclyCacheablePath("/nl/signup-help")).toBe(true);
  });

  it("does not mistake reserved sibling routes for a detail page", () => {
    expect(isPubliclyCacheablePath("/nl/events/mine")).toBe(false);
    expect(isPubliclyCacheablePath("/nl/events/new")).toBe(false);
    expect(isPubliclyCacheablePath("/nl/organizations/mine")).toBe(false);
    expect(isPubliclyCacheablePath("/nl/organizations/new")).toBe(false);
  });

  it("does not treat nested edit/members pages as public", () => {
    expect(isPubliclyCacheablePath("/nl/events/some-slug/edit")).toBe(false);
    expect(isPubliclyCacheablePath("/nl/organizations/some-slug/members")).toBe(false);
  });

  it("defaults an unrecognized page to not publicly cacheable", () => {
    expect(isPubliclyCacheablePath("/nl/account")).toBe(false);
    expect(isPubliclyCacheablePath("/nl/admin/users")).toBe(false);
    expect(isPubliclyCacheablePath("/nl/blog")).toBe(false);
  });
});

describe("resolveCacheControl", () => {
  it("leaves non-page routes (e.g. /api/**) untouched", () => {
    expect(resolveCacheControl("/api/events", false)).toBeNull();
  });

  it("returns the public, shared-cache header for an anonymous request to a public page", () => {
    expect(resolveCacheControl("/nl/events", false)).toBe(
      "public, s-maxage=300, stale-while-revalidate=60, stale-if-error=86400",
    );
  });

  it("returns private, no-store for a logged-in visitor even on a public page", () => {
    expect(resolveCacheControl("/nl/events", true)).toBe("private, no-store");
  });

  it("returns private, no-store for a private page regardless of session state", () => {
    expect(resolveCacheControl("/nl/events/mine", false)).toBe("private, no-store");
    expect(resolveCacheControl("/nl/events/mine", true)).toBe("private, no-store");
    expect(resolveCacheControl("/nl/admin/users", false)).toBe("private, no-store");
  });
});
