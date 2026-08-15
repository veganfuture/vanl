import { onMount } from "solid-js";
import { LOCALE_COOKIE_NAME, type Locale } from "~/lib/i18n";

// Browsers cap Set-Cookie Max-Age at 400 days regardless of what's requested.
const LOCALE_COOKIE_TTL_SECONDS = 400 * 24 * 60 * 60;

/**
 * Makes the current page's locale "sticky" - remembers it in a cookie so `/`
 * redirects straight back here next time, instead of re-guessing from
 * navigator.languages. Every [lang]/* page's rendered content is already
 * unambiguous from its own URL, so this cookie is only ever read client-side
 * (by `/`'s redirect) - it never varies server-rendered HTML, which would
 * defeat CDN caching of the localized pages themselves.
 */
export function LocaleCookieSync(props: { lang: Locale }) {
  onMount(() => {
    document.cookie = `${LOCALE_COOKIE_NAME}=${props.lang}; Path=/; Max-Age=${LOCALE_COOKIE_TTL_SECONDS}; Secure; SameSite=Lax`;
  });
  return null;
}
