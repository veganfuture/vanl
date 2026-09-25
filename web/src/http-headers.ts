import { createMiddleware } from "@solidjs/start/middleware";
import { parseCookies, SESSION_COOKIE_NAME } from "~/domain/auth/cookies";
import { resolveCacheControl } from "~/lib/cache-control";

export default createMiddleware({
  onBeforeResponse: (event) => {
    const { pathname } = new URL(event.request.url);
    const hasSessionCookie = Boolean(
      parseCookies(event.request.headers.get("cookie"))[SESSION_COOKIE_NAME],
    );
    const cacheControl = resolveCacheControl(pathname, hasSessionCookie);
    if (cacheControl) {
      event.response.headers.set("cache-control", cacheControl);
    }

    // Site-wide hardening headers (see docs/threat-model.md). CSP itself is
    // set per-document in entry-server.tsx, since it needs a per-request
    // nonce - these three don't, so they apply uniformly to every response,
    // API routes included.
    event.response.headers.set("x-frame-options", "DENY");
    event.response.headers.set("x-content-type-options", "nosniff");
    event.response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  },
});
