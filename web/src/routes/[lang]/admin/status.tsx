import { Title } from "@solidjs/meta";
import { createResource, onCleanup, Show } from "solid-js";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch } from "~/lib/api-fetch";
import { useLang } from "~/lib/i18n";
import { useMe } from "~/lib/queries";
import { StatusResponseSchema, type StatusResponse } from "~/routes/api/status.schema";

type OkStatus = Extract<StatusResponse, { time: string }>;

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

function ComponentRow(props: {
  label: string;
  ok: boolean;
  detail?: string;
  error?: string;
  upLabel: string;
  downLabel: string;
}) {
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
          {props.ok ? props.upLabel : props.downLabel}
        </span>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const { lang, t } = useLang();
  const me = useMe();

  const [status, { refetch }] = createResource(me, async (currentUser) => {
    if (!currentUser?.isSiteAdmin) {
      return undefined;
    }
    const result = await apiFetch("/api/status", { response: StatusResponseSchema });
    return result.match(
      (data) => ("time" in data ? data : undefined),
      () => undefined,
    );
  });

  const interval = setInterval(() => refetch(), REFRESH_INTERVAL_MS);
  onCleanup(() => clearInterval(interval));

  const okStatus = (): OkStatus | undefined => status();

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Status", "Status")} — Vegan Activists NL</Title>
      <h1 class="mb-6 text-2xl font-semibold">{t("Systeemstatus", "System status")}</h1>

      <Show
        when={me() !== undefined}
        fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}
      >
        <Show
          when={me()}
          fallback={
            <p class="text-zinc-600">
              {t("Je moet ", "You need to ")}
              <a href={`/${lang()}/login`} class="underline">
                {t("inloggen", "log in")}
              </a>
              {t(" om deze pagina te zien.", " to see this page.")}
            </p>
          }
        >
          <Show
            when={me()?.isSiteAdmin}
            fallback={
              <p class="text-zinc-600">
                {t(
                  "Je hebt geen toestemming om deze pagina te bekijken.",
                  "You don't have permission to view this page.",
                )}
              </p>
            }
          >
            <Show
              when={okStatus()}
              fallback={<p class="text-zinc-600">{t("Status laden…", "Loading status…")}</p>}
            >
              {(current) => (
                <div class="rounded-lg border border-zinc-200 px-4">
                  <ComponentRow
                    label={t("Website", "Website")}
                    ok={current().web.ok}
                    upLabel={t("Actief", "Running")}
                    downLabel={t("Uitgevallen", "Down")}
                  />
                  <ComponentRow
                    label={t("Database", "Database")}
                    ok={current().database.ok}
                    error={current().database.error}
                    upLabel={t("Verbonden", "Connected")}
                    downLabel={t("Niet verbonden", "Not connected")}
                  />
                  <ComponentRow
                    label={t("Signal-bot", "Signal bot")}
                    ok={current().bot.ok}
                    detail={
                      current().bot.ok
                        ? current().bot.signalConnected
                          ? t("Verbonden met Signal", "Connected to Signal")
                          : t("Niet verbonden met Signal", "Not connected to Signal")
                        : undefined
                    }
                    error={current().bot.error}
                    upLabel={t("Actief", "Running")}
                    downLabel={t("Onbereikbaar", "Unreachable")}
                  />
                </div>
              )}
            </Show>
            <p class="mt-4 text-xs text-zinc-400">
              {t("Wordt elke 15 seconden vernieuwd.", "Refreshes every 15 seconds.")}
            </p>
          </Show>
        </Show>
      </Show>
    </main>
  );
}
