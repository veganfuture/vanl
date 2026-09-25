// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";
import { getRequestEvent } from "solid-js/web";

function resolveHtmlLang(): string {
  const event = getRequestEvent();
  const pathname = event ? new URL(event.request.url).pathname : "/";
  return pathname === "/nl" || pathname.startsWith("/nl/") ? "nl" : "en";
}

/**
 * Fresh per-request nonce so `script-src` can stay `'self'` instead of
 * `'unsafe-inline'` - SolidStart's own hydration/resumability scripts are
 * inline (no src), so a strict CSP with no nonce would block the app from
 * hydrating at all. Google Maps is the only cross-origin embed the site
 * uses (event location iframe); everything else is same-origin.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src https://www.google.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function generateNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

export default createHandler(
  () => (
    <StartServer
      document={({ assets, children, scripts }) => (
        <html lang={resolveHtmlLang()}>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" href="/favicon.ico" sizes="any" />
            <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
            {assets}
          </head>
          <body>
            <div id="app">{children}</div>
            {scripts}
          </body>
        </html>
      )}
    />
  ),
  (context) => {
    const nonce = generateNonce();
    context.response.headers.set("content-security-policy", buildCsp(nonce));
    return { nonce };
  },
);
