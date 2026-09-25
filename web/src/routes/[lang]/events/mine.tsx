import { Title } from "@solidjs/meta";
import { createResource, For, Show } from "solid-js";
import { EventThumbnail } from "~/components/EventThumbnail";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch } from "~/lib/api-fetch";
import { formatEventDate } from "~/lib/format-date";
import { pickLocalized, useLang } from "~/lib/i18n";
import { useMe, useOrganizations } from "~/lib/queries";
import { ListEventsResponseSchema } from "~/routes/api/events/index.schema";

export default function MyEventsPage() {
  const { lang, t } = useLang();

  const locationKindLabels: Record<string, string> = {
    precise_address: t("Exact adres", "Precise address"),
    meeting_point_city_only: t("Verzamelpunt", "Meeting point"),
  };
  const statusLabels: Record<string, string> = {
    draft: t("Concept", "Draft"),
    hidden: t("Verborgen", "Hidden"),
    cancelled: t("Geannuleerd", "Cancelled"),
  };

  const me = useMe();

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

  // See events/index.tsx - same org-logo lookup for the flyer-less-event
  // thumbnail fallback.
  const organizations = useOrganizations();
  const orgLogoById = () =>
    new Map((organizations() ?? []).map((org) => [org.id, org.logoThumbnailImageId]));

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Mijn evenementen", "My events")} — Vegan Activists NL</Title>
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{t("Mijn evenementen", "My events")}</h1>
        <Show when={me()}>
          <a
            href={`/${lang()}/events/new`}
            class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            {t("Maak evenement", "Create event")}
          </a>
        </Show>
      </div>

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
                    <li class="flex items-center gap-4 rounded-lg border border-zinc-200 p-4">
                      <EventThumbnail
                        flyerThumbnailImageId={event.flyerThumbnailImageId}
                        orgLogoThumbnailImageId={
                          event.publisherOrgId
                            ? (orgLogoById()?.get(event.publisherOrgId) ?? null)
                            : null
                        }
                      />
                      <div>
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
                        <p class="text-sm text-zinc-600">
                          {formatEventDate(event.startAt, lang(), event.startTimeKnown)}
                        </p>
                        <p class="text-sm text-zinc-600">
                          {locationKindLabels[event.locationKind]} — {event.locationDescription}
                        </p>
                      </div>
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
