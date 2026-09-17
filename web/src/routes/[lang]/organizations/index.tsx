import { Title } from "@solidjs/meta";
import { createResource, For, Show } from "solid-js";
import { EventCard } from "~/components/EventCard";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch } from "~/lib/api-fetch";
import { imageUrl } from "~/lib/image-url";
import { pickLocalized, useLang } from "~/lib/i18n";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { ListOrganizationsResponseSchema } from "~/routes/api/organizations/index.schema";
import { ListEventsResponseSchema } from "~/routes/api/events/index.schema";
import type { EventJson } from "~/routes/api/events/event.schema";

export default function OrganizationsListPage() {
  const { lang, t } = useLang();

  const [me] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  const [organizations] = createResource(async () => {
    const result = await apiFetch("/api/organizations", {
      response: ListOrganizationsResponseSchema,
    });
    return result.match(
      (data) => data.organizations,
      () => [],
    );
  });

  const [nextEvents] = createResource(async () => {
    const result = await apiFetch("/api/events?nextPerOrg=true", {
      response: ListEventsResponseSchema,
    });
    return result.match(
      (data) => data.events,
      () => [],
    );
  });

  const nextEventByOrgId = () => {
    const map = new Map<string, EventJson>();
    for (const event of nextEvents() ?? []) {
      if (event.publisherOrgId) {
        map.set(event.publisherOrgId, event);
      }
    }
    return map;
  };

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Organisaties", "Organizations")} — Vegan Activists NL</Title>
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{t("Organisaties", "Organizations")}</h1>
        <Show when={me()}>
          <a
            href={`/${lang()}/organizations/new`}
            class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            {t("Organisatie aanmaken", "Create organization")}
          </a>
        </Show>
      </div>

      <Show
        when={!organizations.loading}
        fallback={<p class="text-zinc-600">{t("Organisaties laden…", "Loading organizations…")}</p>}
      >
        <Show
          when={organizations() && organizations()!.length > 0}
          fallback={
            <p class="text-zinc-600">{t("Nog geen organisaties.", "No organizations yet.")}</p>
          }
        >
          <ul class="space-y-4">
            <For each={organizations()}>
              {(org) => (
                <li class="flex items-center gap-4 rounded-lg border border-zinc-200 p-4">
                  <Show when={org.logoThumbnailImageId}>
                    {(id) => (
                      <img
                        src={imageUrl(id())}
                        alt=""
                        class="h-16 w-16 shrink-0 rounded object-cover"
                        width={64}
                        height={64}
                      />
                    )}
                  </Show>
                  <div>
                    <a
                      href={`/${lang()}/organizations/${org.slug}`}
                      class="text-lg font-semibold hover:underline"
                    >
                      {org.name}
                    </a>
                    <Show when={pickLocalized(org.descriptionNl, org.descriptionEn, lang())}>
                      {(description) => <p class="text-sm text-zinc-600">{description()}</p>}
                    </Show>
                    <Show when={nextEventByOrgId().get(org.id)}>
                      {(event) => (
                        <div class="mt-2">
                          <p class="mb-1 text-xs font-semibold tracking-widest text-zinc-500 uppercase">
                            {t("Volgende evenement", "Next event")}
                          </p>
                          {/* No orgLogoThumbnailImageId: the org's own logo is already shown
                              to the left of this whole card, so falling back to it here would
                              just repeat it - only show a thumbnail when the event has its own flyer. */}
                          <EventCard
                            event={event()}
                            lang={lang()}
                            href={`/${lang()}/events/${event().slug}`}
                          />
                        </div>
                      )}
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>

      <Show when={!me.loading && !me()}>
        <p class="mt-8 text-center text-sm text-zinc-600">
          {t("Wil je een organisatie aanmaken? ", "Want to create an organization? ")}
          <a href={`/${lang()}/signup-help`} class="underline">
            {t("Meld je aan om een account te maken.", "Sign up to create an account.")}
          </a>
        </p>
      </Show>
    </main>
  );
}
