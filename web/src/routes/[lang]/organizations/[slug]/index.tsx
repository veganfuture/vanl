import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, For, Show } from "solid-js";
import { EventCard } from "~/components/EventCard";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { Toast } from "~/components/Toast";
import { apiFetch } from "~/lib/api-fetch";
import { imageUrl } from "~/lib/image-url";
import { pickLocalized, useLang } from "~/lib/i18n";
import { useQueryToast } from "~/lib/toast";
import { GetOrganizationBySlugResponseSchema } from "~/routes/api/organizations/by-slug/[slug].schema";
import { ListEventsResponseSchema } from "~/routes/api/events/index.schema";

/** Read by src/middleware.ts to decide this page is safe to cache publicly for anonymous visitors. */
export const route = { info: { cachePolicy: "public" } };

export default function OrganizationDetailPage() {
  const params = useParams<{ slug: string }>();
  const { lang, t } = useLang();
  const [toastMessage, dismissToast] = useQueryToast(lang);

  const [org] = createResource(
    () => params.slug ?? "",
    async (slug) => {
      const result = await apiFetch(`/api/organizations/by-slug/${encodeURIComponent(slug)}`, {
        response: GetOrganizationBySlugResponseSchema,
      });
      return result.match(
        (data) => data.organization,
        () => null,
      );
    },
  );

  const [events] = createResource(
    () => org()?.id,
    async (orgId) => {
      const result = await apiFetch(`/api/events?orgId=${encodeURIComponent(orgId)}`, {
        response: ListEventsResponseSchema,
      });
      return result.match(
        (data) => data.events,
        () => [],
      );
    },
  );

  const canManage = () => org()?.isMember ?? false;

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Show when={toastMessage()}>
        {(message) => <Toast message={message()} onDismiss={dismissToast} />}
      </Show>
      <Show when={!org.loading} fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}>
        <Show
          when={org()}
          fallback={
            <p class="text-zinc-600">
              {t("Organisatie niet gevonden.", "Organization not found.")}
            </p>
          }
        >
          {(currentOrg) => (
            <>
              <Title>{currentOrg().name} — Vegan Activists NL</Title>
              <Show when={currentOrg().logoFullImageId}>
                {(id) => (
                  <img
                    src={imageUrl(id())}
                    alt=""
                    class="mb-4 h-24 w-24 rounded-lg border border-zinc-200 object-cover"
                  />
                )}
              </Show>
              <div class="mb-2 flex items-center justify-between">
                <h1 class="text-2xl font-semibold">{currentOrg().name}</h1>
                <Show when={canManage()}>
                  <div class="flex gap-2">
                    <a
                      href={`/${lang()}/organizations/${currentOrg().slug}/members`}
                      class="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold transition hover:bg-zinc-50"
                    >
                      {t("Leden", "Members")}
                    </a>
                    <a
                      href={`/${lang()}/organizations/${currentOrg().slug}/edit`}
                      class="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold transition hover:bg-zinc-50"
                    >
                      {t("Bewerken", "Edit")}
                    </a>
                  </div>
                </Show>
              </div>
              <Show
                when={pickLocalized(currentOrg().descriptionNl, currentOrg().descriptionEn, lang())}
              >
                {(description) => (
                  <p class="mb-4 whitespace-pre-wrap text-zinc-700">{description()}</p>
                )}
              </Show>
              <Show when={currentOrg().websiteUrl}>
                <p class="mb-8">
                  <a
                    href={currentOrg().websiteUrl!}
                    class="underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {currentOrg().websiteUrl}
                  </a>
                </p>
              </Show>

              <h2 class="mb-4 text-lg font-semibold">
                {t("Aankomende evenementen", "Upcoming events")}
              </h2>
              <Show
                when={!events.loading}
                fallback={<p class="text-zinc-600">{t("Evenementen laden…", "Loading events…")}</p>}
              >
                <Show
                  when={events() && events()!.length > 0}
                  fallback={
                    <p class="text-zinc-600">
                      {t("Geen aankomende evenementen.", "No upcoming events.")}
                    </p>
                  }
                >
                  <ul class="space-y-4">
                    <For each={events()}>
                      {(event) => (
                        <li class="rounded-lg border border-zinc-200 p-4">
                          {/* No orgLogoThumbnailImageId: the org's own logo is already
                              shown at the top of this page, so falling back to it here
                              would just repeat it - only show a thumbnail when the event
                              has its own flyer. */}
                          <EventCard
                            event={event}
                            lang={lang()}
                            href={`/${lang()}/events/${event.slug}`}
                          />
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </Show>
            </>
          )}
        </Show>
      </Show>
    </main>
  );
}
