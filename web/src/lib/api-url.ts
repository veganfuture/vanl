import { getRequestEvent, isServer } from "solid-js/web";

/**
 * Resolve a same-origin API path to a URL `fetch` can actually use.
 *
 * In the browser a relative path works fine, but `createResource` fetchers
 * also run during SSR, where Node's `fetch` (unlike a browser's) has no
 * document to resolve a relative URL against and throws
 * `TypeError: Failed to parse URL from /api/...`. On the server we make it
 * absolute using the incoming request's own origin instead.
 */
export function apiUrl(path: string): string {
  if (!isServer) {
    return path;
  }
  const event = getRequestEvent();
  return event ? new URL(path, event.request.url).toString() : path;
}
