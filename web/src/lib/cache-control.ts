/**
 * Which pages are safe to cache publicly (for anonymous visitors) is
 * decided by each page file itself, not by pattern-matching URLs here -
 * see the `export const route = { info: { cachePolicy: "public" } }` line
 * in e.g. events/index.tsx. Vite's import.meta.glob resolves every page
 * file's *raw source text* at build/dev-server time (no execution, so this
 * never pulls a page's own component code/dependencies into this module);
 * each matched file's own path mechanically determines its URL pattern.
 *
 * Kept in its own module, separate from src/http-cache-headers.ts's
 * `createMiddleware(...)` wiring, so this pure logic is unit-testable
 * without pulling in @solidjs/start/middleware (which depends on a
 * build-time-only virtual module unavailable under plain vitest).
 */
const routeFiles = import.meta.glob("/src/routes/\\[lang\\]/**/*.tsx", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const CACHE_POLICY_MARKER = /cachePolicy:\s*"public"/;

const ALL_ROUTE_SEGMENTS: string[][] = Object.keys(routeFiles).map(toRouteSegments);

const PUBLIC_CACHEABLE_PATTERNS: RegExp[] = Object.entries(routeFiles)
  .filter(([, source]) => CACHE_POLICY_MARKER.test(source))
  .map(([filePath]) => toRoutePattern(filePath, ALL_ROUTE_SEGMENTS));

export function toRouteSegments(filePath: string): string[] {
  const routePath = filePath
    .replace(/^\/src\/routes/, "")
    .replace(/\.tsx$/, "")
    .replace(/\/index$/, "");
  return routePath.split("/").filter(Boolean);
}

export function toRoutePattern(filePath: string, allRouteSegments: string[][]): RegExp {
  const segments = toRouteSegments(filePath);
  const pattern = segments
    .map((segment, i) =>
      segment.startsWith("[")
        ? toWildcardSegment(segments.slice(0, i), allRouteSegments)
        : toLiteralSegment(segment),
    )
    .join("/");
  return new RegExp(`^/${pattern}$`);
}

export function toLiteralSegment(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A `[param]` route segment becomes a wildcard - but SolidStart's own
 * router always prefers a literal sibling route over a dynamic one at the
 * same position (e.g. a request for /events/mine resolves to
 * events/mine.tsx, never events/[slug]/index.tsx, even though "mine" would
 * otherwise look like a valid slug). Replicate that precedence here by
 * excluding any such literal sibling - computed from the actual route
 * tree (passed in as `allRouteSegments`), not a hand-maintained list, so a
 * newly added sibling file is excluded automatically without touching this
 * file.
 */
export function toWildcardSegment(
  precedingSegments: string[],
  allRouteSegments: string[][],
): string {
  const literalSiblings = new Set<string>();
  for (const segments of allRouteSegments) {
    const sibling = segments[precedingSegments.length];
    if (
      sibling &&
      !sibling.startsWith("[") &&
      precedingSegments.every((segment, i) => segments[i] === segment)
    ) {
      literalSiblings.add(sibling);
    }
  }
  if (literalSiblings.size === 0) {
    return "[^/]+";
  }
  const excluded = [...literalSiblings].map(toLiteralSegment).join("|");
  return `(?!(?:${excluded})$)[^/]+`;
}

export function isPubliclyCacheablePath(pathname: string): boolean {
  return PUBLIC_CACHEABLE_PATTERNS.some((re) => re.test(pathname));
}

/**
 * The full cache-control decision for a page request, kept as one pure
 * function (pathname + cookie-presence in, header value or null out) so
 * it's testable without a real H3/FetchEvent - `null` means "not a page
 * route this app manages caching for" (e.g. /api/**), which must be left
 * untouched rather than given any Cache-Control at all.
 */
export function resolveCacheControl(pathname: string, hasSessionCookie: boolean): string | null {
  const [lang] = pathname.split("/").filter(Boolean);
  if (lang !== "nl" && lang !== "en") {
    return null;
  }
  if (!isPubliclyCacheablePath(pathname)) {
    return "private, no-store";
  }
  return hasSessionCookie
    ? "private, no-store"
    : "public, s-maxage=300, stale-while-revalidate=60, stale-if-error=86400";
}
