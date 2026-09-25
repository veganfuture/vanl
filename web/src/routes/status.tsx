import { Title } from "@solidjs/meta";
import { createResource, onCleanup, Show } from "solid-js";
import { apiFetch } from "~/lib/api-fetch";
import { StatusResponseSchema } from "~/routes/api/status.schema";

const REFRESH_INTERVAL_MS = 15_000;

function StatusDot(props: { ok: boolean }) {
  return (
    <span
      class={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
        props.ok ? "bg-emerald-500" : "bg-red-500"
      }`}
      aria-hidden="true"
    />
  );
}

function ComponentRow(props: { label: string; ok: boolean; detail?: string; error?: string }) {
  return (
    <div class="flex items-start justify-between gap-4 border-b border-zinc-100 py-3 last:border-0">
      <div>
        <p class="font-medium text-zinc-900">{props.label}</p>
        <Show when={props.detail}>
          <p class="text-sm text-zinc-500">{props.detail}</p>
        </Show>
        <Show when={props.error}>
          <p class="text-sm text-red-600">{props.error}</p>
        </Show>
      </div>
      <div class="flex shrink-0 items-center gap-2 pt-0.5">
        <StatusDot ok={props.ok} />
        <span class={`text-sm font-medium ${props.ok ? "text-emerald-700" : "text-red-700"}`}>
          {props.ok ? "Up" : "Down"}
        </span>
      </div>
    </div>
  );
}

/**
 * Public and not localized (unlike almost everything else under
 * src/routes/[lang]) - a monitoring page has to work when the site is
 * broken, which rules out anything gated behind login (see api/status.ts's
 * comment) and makes "which language" a non-concern for its one-line rows.
 */
export default function StatusPage() {
  const [status, { refetch }] = createResource(async () => {
    const result = await apiFetch("/api/status", { response: StatusResponseSchema });
    return result.match(
      (data) => data,
      () => undefined,
    );
  });

  const interval = setInterval(() => refetch(), REFRESH_INTERVAL_MS);
  onCleanup(() => clearInterval(interval));

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <Title>Status — Vegan Activists NL</Title>
      <h1 class="mb-6 text-2xl font-semibold">System status</h1>

      <Show when={status()} fallback={<p class="text-zinc-600">Loading status…</p>}>
        {(current) => (
          <div class="rounded-lg border border-zinc-200 px-4">
            <ComponentRow label="Website" ok={current().web.ok} />
            <ComponentRow
              label="Database"
              ok={current().database.ok}
              error={current().database.error}
            />
            <ComponentRow
              label="Signal bot"
              ok={current().bot.ok}
              detail={
                current().bot.ok
                  ? current().bot.signalConnected
                    ? "Connected to Signal"
                    : "Not connected to Signal"
                  : undefined
              }
              error={current().bot.error}
            />
          </div>
        )}
      </Show>

      <p class="mt-4 text-xs text-zinc-400">Refreshes every 15 seconds.</p>
    </main>
  );
}
