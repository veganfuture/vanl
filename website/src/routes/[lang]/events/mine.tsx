import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, For, Show } from "solid-js";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch } from "~/lib/api-fetch";
import { pickLocalized, resolveLang } from "~/lib/i18n";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { ListEventsResponseSchema } from "~/routes/api/events/index.schema";

export default function MyEventsPage() {
  const params = useParams<{ lang: string }>();
  const lang = () => resolveLang(params.lang);
  const t = (nl: string, en: string) => (lang() === "nl" ? nl : en);

  const locationKindLabels: Record<string, string> = {
    precise_address: t("Exact adres", "Precise address"),
    meeting_point_city_only: t("Verzamelpunt", "Meeting point"),
  };
  const statusLabels: Record<string, string> = {
    hidden: t("Verborgen", "Hidden"),
    cancelled: t("Geannuleerd", "Cancelled"),
  };

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(lang() === "nl" ? "nl-NL" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  const [me] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  const [events] = createResource(me, async (currentUser) => {
    if (!currentUser) {
      return [];
    }
    const result = await apiFetch("/api/events/mine", { response: ListEventsResponseSchema });
    return result.match(
      (data) => data.events,
      () => [],
    );
  });

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Mijn evenementen", "My events")} — Vegan Activists NL</Title>
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{t("Mijn evenementen", "My events")}</h1>
        <a
          href={`/${lang()}/events/new`}
          class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          {t("Evenement aanmaken", "Create event")}
        </a>
      </div>

      <Show when={!me.loading} fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}>
        <Show
          when={me()}
          fallback={
            <p class="text-zinc-600">
              {t("Je moet ", "You need to ")}
              <a href={`/${lang()}/login`} class="underline">
                {t("inloggen", "log in")}
              </a>
              {t(" om je evenementen te zien.", " to see your events.")}
            </p>
          }
        >
          <Show
            when={!events.loading}
            fallback={<p class="text-zinc-600">{t("Evenementen laden…", "Loading events…")}</p>}
          >
            <Show
              when={events() && events()!.length > 0}
              fallback={
                <p class="text-zinc-600">
                  {t(
                    "Je hebt nog geen evenementen aangemaakt.",
                    "You haven't created any events yet.",
                  )}
                </p>
              }
            >
              <ul class="space-y-4">
                <For each={events()}>
                  {(event) => (
                    <li class="rounded-lg border border-zinc-200 p-4">
                      <a
                        href={`/${lang()}/events/${event.slug}`}
                        class="text-lg font-semibold hover:underline"
                      >
                        {pickLocalized(event.titleNl, event.titleEn, lang())}
                      </a>
                      <Show when={statusLabels[event.status]}>
                        <span class="ml-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          {statusLabels[event.status]}
                        </span>
                      </Show>
                      <p class="text-sm text-zinc-600">{formatDate(event.startAt)}</p>
                      <p class="text-sm text-zinc-600">
                        {locationKindLabels[event.locationKind]} — {event.locationDescription}
                      </p>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </Show>
      </Show>
    </main>
  );
}
