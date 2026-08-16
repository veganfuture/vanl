import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, For, Show } from "solid-js";
import { EventThumbnail } from "~/components/EventThumbnail";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch } from "~/lib/api-fetch";
import { imageUrl } from "~/lib/image-url";
import { pickLocalized, useLang } from "~/lib/i18n";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { GetOrganizationBySlugResponseSchema } from "~/routes/api/organizations/by-slug/[slug].schema";
import { MyOrganizationsResponseSchema } from "~/routes/api/organizations/mine.schema";
import { ListEventsResponseSchema } from "~/routes/api/events/index.schema";

export default function OrganizationDetailPage() {
  const params = useParams<{ slug: string }>();
  const { lang, t } = useLang();

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

  // No org-scoped filter on the public events listing yet (same "basic,
  // unfiltered" stage as the events index page - see event_repository.ts's
  // listVisibleEvents), so this filters the full visible list client-side.
  const [events] = createResource(
    () => org()?.id,
    async (orgId) => {
      const result = await apiFetch("/api/events", { response: ListEventsResponseSchema });
      return result.match(
        (data) => data.events.filter((event) => event.publisherOrgId === orgId),
        () => [],
      );
    },
  );

  const [me] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  const [myOrgs] = createResource(async () => {
    const result = await apiFetch("/api/organizations/mine", {
      response: MyOrganizationsResponseSchema,
    });
    return result.match(
      (data) => data.organizations,
      () => [],
    );
  });

  const canManage = () => {
    const currentUser = me();
    const currentOrg = org();
    if (!currentUser || !currentOrg) return false;
    if (currentUser.isSiteAdmin) return true;
    return (myOrgs() ?? []).some((myOrg) => myOrg.id === currentOrg.id);
  };

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(lang() === "nl" ? "nl-NL" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
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
              <Show when={currentOrg().description}>
                <p class="mb-4 whitespace-pre-wrap text-zinc-700">{currentOrg().description}</p>
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

              <h2 class="mb-4 text-lg font-semibold">{t("Evenementen", "Events")}</h2>
              <Show
                when={!events.loading}
                fallback={<p class="text-zinc-600">{t("Evenementen laden…", "Loading events…")}</p>}
              >
                <Show
                  when={events() && events()!.length > 0}
                  fallback={
                    <p class="text-zinc-600">{t("Nog geen evenementen.", "No events yet.")}</p>
                  }
                >
                  <ul class="space-y-4">
                    <For each={events()}>
                      {(event) => (
                        <li class="flex items-center gap-4 rounded-lg border border-zinc-200 p-4">
                          <EventThumbnail
                            flyerThumbnailImageId={event.flyerThumbnailImageId}
                            orgLogoThumbnailImageId={currentOrg().logoThumbnailImageId}
                          />
                          <div>
                            <a
                              href={`/${lang()}/events/${event.slug}`}
                              class="text-lg font-semibold hover:underline"
                            >
                              {pickLocalized(event.titleNl, event.titleEn, lang())}
                            </a>
                            <p class="text-sm text-zinc-600">{formatDate(event.startAt)}</p>
                          </div>
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
