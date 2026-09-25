import { Title } from "@solidjs/meta";
import { createSignal, For, Show } from "solid-js";
import { EventCard } from "~/components/EventCard";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { imageUrl } from "~/lib/image-url";
import type { Sha256 } from "~/lib/sha256";
import { pickLocalized, useLang } from "~/lib/i18n";
import { useMe, useNextEventsPerOrg, useOrganizations } from "~/lib/queries";
import type { EventJson } from "~/routes/api/events/event.schema";

/** Read by src/middleware.ts to decide this page is safe to cache publicly for anonymous visitors. */
export const route = { info: { cachePolicy: "public" } };

/**
 * An org description clamped to 3 lines with a "More…" toggle, so every
 * card on the list starts out roughly the same height regardless of how
 * much an org wrote about itself - only descriptions long enough to
 * plausibly overflow 3 lines get the toggle at all.
 */
function OrgDescription(props: { text: string; t: (nl: string, en: string) => string }) {
  const [expanded, setExpanded] = createSignal(false);
  const isLong = () => props.text.length > 220;
  return (
    <div class="mt-1">
      <p
        class={`text-sm text-zinc-600 ${expanded() || !isLong() ? "whitespace-pre-wrap" : "line-clamp-3"}`}
      >
        {props.text}
      </p>
      <Show when={isLong()}>
        <button
          type="button"
          class="mt-0.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded() ? props.t("Minder", "Less") : props.t("Meer…", "More…")}
        </button>
      </Show>
    </div>
  );
}

export default function OrganizationsListPage() {
  const { lang, t } = useLang();

  const me = useMe();
  const organizations = useOrganizations();
  const nextEvents = useNextEventsPerOrg();

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
            {t("Maak organisatie", "Create organization")}
          </a>
        </Show>
      </div>

      <Show
        when={organizations() !== undefined}
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
                <li class="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
                  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                    {/* On mobile this row groups the logo with the name so neither indents the
                        content below; sm:contents dissolves it so the logo becomes a direct flex
                        item again once there's room for the original side-by-side layout. */}
                    <div class="flex items-center gap-3 sm:contents">
                      <Show when={org.logoThumbnailImageId}>
                        {(id) => (
                          <img
                            // A JSON-API string here, not a domain Sha256 - the server already vetted it.
                            src={imageUrl(id() as Sha256)}
                            alt=""
                            class="h-16 w-16 shrink-0 rounded-lg object-cover"
                            width={64}
                            height={64}
                          />
                        )}
                      </Show>
                      <a
                        href={`/${lang()}/organizations/${org.slug}`}
                        class="text-lg font-semibold hover:underline sm:hidden"
                      >
                        {org.name}
                      </a>
                    </div>
                    <div class="min-w-0 flex-1">
                      <a
                        href={`/${lang()}/organizations/${org.slug}`}
                        class="hidden text-lg font-semibold hover:underline sm:inline-block"
                      >
                        {org.name}
                      </a>
                      <Show when={org.websiteUrl}>
                        {(websiteUrl) => (
                          <p class="mt-0.5 hidden sm:block">
                            <a
                              href={websiteUrl()}
                              target="_blank"
                              rel="noreferrer"
                              class="text-sm break-all text-zinc-500 underline hover:text-zinc-700"
                            >
                              {websiteUrl()}
                            </a>
                          </p>
                        )}
                      </Show>
                      <Show when={pickLocalized(org.descriptionNl, org.descriptionEn, lang())}>
                        {(description) => <OrgDescription text={description()} t={t} />}
                      </Show>
                      <div class="mt-4">
                        <p class="mb-1 text-xs font-semibold tracking-widest text-zinc-500 uppercase">
                          {t("Volgende evenement", "Next event")}
                        </p>
                        <Show
                          when={nextEvents() !== undefined}
                          fallback={<p class="text-sm text-zinc-400">{t("Laden…", "Loading…")}</p>}
                        >
                          <Show
                            when={nextEventByOrgId().get(org.id)}
                            fallback={
                              <p class="text-sm text-zinc-500 italic">
                                {t(
                                  "Geen bekend eerstvolgend evenement — dat betekent niet dat er geen gepland is, we weten er alleen niet van.",
                                  "No known upcoming event — that doesn't mean there isn't one, we just don't know of it.",
                                )}
                              </p>
                            }
                          >
                            {(event) => (
                              <EventCard
                                event={event()}
                                lang={lang()}
                                href={`/${lang()}/events/${event().slug}`}
                                orgLogoThumbnailImageId={org.logoThumbnailImageId}
                              />
                            )}
                          </Show>
                        </Show>
                      </div>
                    </div>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>

      <Show when={me() !== undefined && !me()}>
        <p class="mt-8 text-center text-sm text-zinc-600">
          {t("Wil je een organisatie maken? ", "Want to create an organization? ")}
          <a href={`/${lang()}/signup-help`} class="underline">
            {t("Meld je aan om een account te maken.", "Sign up to create an account.")}
          </a>
        </p>
      </Show>
    </main>
  );
}
