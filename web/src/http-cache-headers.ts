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
  },
});
