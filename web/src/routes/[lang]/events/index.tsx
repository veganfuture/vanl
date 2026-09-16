import { Title } from "@solidjs/meta";
import { createResource, For, Show } from "solid-js";
import { EventThumbnail } from "~/components/EventThumbnail";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch } from "~/lib/api-fetch";
import { pickLocalized, useLang } from "~/lib/i18n";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import type { EventJson } from "~/routes/api/events/event.schema";
import { ListEventsResponseSchema } from "~/routes/api/events/index.schema";
import { ListOrganizationsResponseSchema } from "~/routes/api/organizations/index.schema";
import { GetPlaceResponseSchema } from "~/routes/api/places/[id].schema";

/** A single month's worth of events, in display order, for the month-divider grouping below. */
type EventGroup = {
  key: string;
  label: string;
  items: EventJson[];
};

export default function EventsListPage() {
  const { lang, t } = useLang();

  const [me] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  // Only shown for site admins - listVisibleEvents-only for everyone else,
  // so a real visitor never sees a status other than "visible" here anyway.
  const statusLabels: Record<string, string> = {
    draft: t("Concept", "Draft"),
    hidden: t("Verborgen", "Hidden"),
    cancelled: t("Geannuleerd", "Cancelled"),
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

  // EventJson only carries a raw placeId - fetch each referenced place so
  // the card can show its municipality (the "woonplaats") without exposing
  // the event's exact address.
  const [municipalityByPlaceId] = createResource(events, async (loadedEvents) => {
    const uniqueIds = [...new Set(loadedEvents.map((e) => e.placeId))];
    const entries = await Promise.all(
      uniqueIds.map(async (id) => {
        const result = await apiFetch(`/api/places/${id}`, { response: GetPlaceResponseSchema });
        return result.match(
          (data) => [id, data.place.municipalityName] as const,
          () => [id, null] as const,
        );
      }),
    );
    return new Map(entries);
  });

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(lang() === "nl" ? "nl-NL" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  // Chronological, then bucketed by calendar month so the list can be
  // broken up with a month divider (startAt is a fixed-format ISO string,
  // so plain string comparison already sorts it chronologically).
  const eventGroups = (): EventGroup[] => {
    const sorted = [...(events() ?? [])].sort((a, b) => a.startAt.localeCompare(b.startAt));
    const groups: EventGroup[] = [];
    for (const event of sorted) {
      const date = new Date(event.startAt);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const current = groups.at(-1);
      if (current?.key === key) {
        current.items.push(event);
      } else {
        const label = date.toLocaleString(lang() === "nl" ? "nl-NL" : "en-GB", {
          month: "long",
          year: "numeric",
        });
        groups.push({ key, label, items: [event] });
      }
    }
    return groups;
  };

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Evenementen", "Events")} — Vegan Activists NL</Title>
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{t("Evenementen", "Events")}</h1>
        <Show when={me()}>
          <a
            href={`/${lang()}/events/new`}
            class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            {t("Evenement aanmaken", "Create event")}
          </a>
        </Show>
      </div>

      <Show
        when={!events.loading}
        fallback={<p class="text-zinc-600">{t("Evenementen laden…", "Loading events…")}</p>}
      >
        <Show
          when={events() && events()!.length > 0}
          fallback={<p class="text-zinc-600">{t("Nog geen evenementen.", "No events yet.")}</p>}
        >
          <div class="space-y-8">
            <For each={eventGroups()}>
              {(group) => (
                <section>
                  <div class="mb-4 flex items-center gap-4">
                    <div class="h-px flex-1 bg-zinc-300" />
                    <h2 class="shrink-0 text-sm font-semibold tracking-widest text-zinc-500 uppercase">
                      {group.label}
                    </h2>
                    <div class="h-px flex-1 bg-zinc-300" />
                  </div>
                  <ul class="space-y-4">
                    <For each={group.items}>
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
                                {event.statusReason ? ` — ${event.statusReason}` : ""}
                              </span>
                            </Show>
                            <p class="flex items-center gap-1.5 text-sm text-zinc-600">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5"
                                class="h-4 w-4 shrink-0 text-zinc-400"
                                aria-hidden="true"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                                />
                              </svg>
                              <span>{formatDate(event.startAt)}</span>
                            </p>
                            <p class="flex items-center gap-1.5 text-sm text-zinc-600">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5"
                                class="h-4 w-4 shrink-0 text-zinc-400"
                                aria-hidden="true"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                                />
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
                                />
                              </svg>
                              <span>{municipalityByPlaceId()?.get(event.placeId) ?? "…"}</span>
                            </p>
                          </div>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={!me.loading && !me()}>
        <p class="mt-8 text-center text-sm text-zinc-600">
          {t("Wil je een evenement aanmaken? ", "Want to create an event? ")}
          <a href={`/${lang()}/signup-help`} class="underline">
            {t("Meld je aan om een account te maken.", "Sign up to create an account.")}
          </a>
        </p>
      </Show>
    </main>
  );
}
