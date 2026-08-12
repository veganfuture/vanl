import { untrack } from "solid-js";

/**
 * Fallback shown when an ErrorBoundary catches a render error. Users get a short
 * code + timestamp they can hand to a site admin instead of a raw stack trace.
 */
export function ErrorFallback(props: { error: unknown; reset: () => void }) {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const timestamp = new Date().toISOString();

  // The fallback is (re-)created fresh per error by ErrorBoundary, so this log
  // is intentionally a one-off read of props.error rather than a tracked effect.
  untrack(() => console.error(`[${code}] ${timestamp}`, props.error));

  return (
    <main class="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <div class="max-w-md">
        <h1 class="mb-2 text-2xl font-semibold text-zinc-900">Something went wrong</h1>
        <p class="mb-4 text-zinc-600">
          Please try again. If the problem continues, report this to a site admin along with the
          details below.
        </p>
        <p class="rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-sm text-zinc-700">
          Error code: {code}
          <br />
          Time: {timestamp}
        </p>
        <button
          onClick={() => props.reset()}
          class="mt-4 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
