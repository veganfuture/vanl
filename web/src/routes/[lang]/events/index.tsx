import { Title } from "@solidjs/meta";
import { createResource, For, Show } from "solid-js";
import { EventThumbnail } from "~/components/EventThumbnail";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch } from "~/lib/api-fetch";
import { pickLocalized, useLang } from "~/lib/i18n";
import { ListEventsResponseSchema } from "~/routes/api/events/index.schema";
import { ListOrganizationsResponseSchema } from "~/routes/api/organizations/index.schema";

export default function EventsListPage() {
  const { lang, t } = useLang();

  const locationKindLabels: Record<string, string> = {
    precise_address: t("Exact adres", "Precise address"),
    meeting_point_city_only: t("Verzamelpunt", "Meeting point"),
  };

  const [events] = createResource(async () => {
    const result = await apiFetch("/api/events", { response: ListEventsResponseSchema });
    return result.match(
      (data) => data.events,
      () => [],
    );
  });

  // EventJson only carries publisherOrgId, not the org's own logo - fetch
  // orgs separately to build a lookup for the flyer-less-event thumbnail
  // fallback (see EventThumbnail).
  const [orgLogoById] = createResource(async () => {
    const result = await apiFetch("/api/organizations", {
      response: ListOrganizationsResponseSchema,
    });
    return result.match(
      (data) => new Map(data.organizations.map((org) => [org.id, org.logoThumbnailImageId])),
      () => new Map<string, string | null>(),
    );
  });

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(lang() === "nl" ? "nl-NL" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Evenementen", "Events")} — Vegan Activists NL</Title>
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{t("Evenementen", "Events")}</h1>
        <a
          href={`/${lang()}/events/new`}
          class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          {t("Evenement aanmaken", "Create event")}
        </a>
      </div>

      <Show
        when={!events.loading}
        fallback={<p class="text-zinc-600">{t("Evenementen laden…", "Loading events…")}</p>}
      >
        <Show
          when={events() && events()!.length > 0}
          fallback={<p class="text-zinc-600">{t("Nog geen evenementen.", "No events yet.")}</p>}
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
                    <p class="text-sm text-zinc-600">{formatDate(event.startAt)}</p>
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
    </main>
  );
}
