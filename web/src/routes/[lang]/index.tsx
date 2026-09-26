import { Link } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { For, Show } from "solid-js";
import { EventCard } from "~/components/EventCard";
import { GroupsAccordion } from "~/components/GroupsAccordion";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { NotFound } from "~/components/NotFound";
import { SocialMeta } from "~/components/SocialMeta";
import { GROUPS } from "~/lib/groups";
import { useLang } from "~/lib/i18n";
import { BASE_URL, OG_IMAGE, SITE_DESCRIPTION, withBaseUrl } from "~/lib/metadata";
import { useUpcomingEvents } from "~/lib/queries";

/** Read by src/middleware.ts to decide this page is safe to cache publicly for anonymous visitors. */
export const route = { info: { cachePolicy: "public" } };

export default function LandingPage() {
  const params = useParams<{ lang: string }>();
  const isValidLang = () => params.lang === "nl" || params.lang === "en";
  const { lang, t } = useLang();
  const upcomingEvents = useUpcomingEvents(3);

  return (
    // [lang] matches any single path segment, so a stale/garbage value here
    // (e.g. someone hitting the old unprefixed /events or /login) must not
    // silently render the landing page - fall through to a real 404 instead.
    <Show when={isValidLang()} fallback={<NotFound />}>
      <LocaleCookieSync lang={lang()} />
      <SocialMeta
        name="VeganActivists.nl"
        description={SITE_DESCRIPTION}
        image={withBaseUrl(OG_IMAGE)}
        url={`${BASE_URL}/${lang()}`}
        locale={lang() === "nl" ? "nl_NL" : "en_US"}
      />
      <Link rel="alternate" hreflang="en" href={`${BASE_URL}/en`} />
      <Link rel="alternate" hreflang="nl" href={`${BASE_URL}/nl`} />

      <main class="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-emerald-50 text-zinc-900">
        <section class="mx-auto max-w-6xl px-6 pt-6 pb-16 md:pb-24">
          <h2 class="mb-4 text-4xl font-extrabold tracking-tight md:text-5xl">
            {t("Sluit je aan bij de", "Join the")}{" "}
            <span class="text-emerald-700">{t("Signal-groepen", "Signal group")}</span>
          </h2>
          <p class="mb-6 max-w-3xl text-lg text-zinc-700">
            {t(
              "We coördineren acties, delen materiaal en helpen elkaar om de het einde van de exploitatie van dieren te versnellen. Toegang gaat via Signal voor privacy en veiligheid.",
              "We coordinate actions, share materials, and support each other to accelerate the end of animal exploitation. Access is via Signal for privacy and safety.",
            )}
          </p>

          <h3 class="mb-2 text-sm font-semibold text-zinc-700">{t("Groepen", "Groups")}</h3>
          <GroupsAccordion groups={GROUPS} lang={lang()} />

          <ul class="mt-6 space-y-2 text-sm text-zinc-600">
            <li>• {t("End‑to‑end versleuteld via Signal", "End-to-end encrypted via Signal")}</li>
            <li>• {t("Alleen voor vreedzame, legale acties", "Peaceful, legal actions only")}</li>
            <li>
              •{" "}
              {t(
                "Iedereen die zich inzet voor dierenrechten is welkom",
                "Everyone committed to animal rights is welcome.",
              )}
            </li>
          </ul>
        </section>

        <section class="mx-auto max-w-6xl px-6 pb-16 md:pb-24">
          <div class="mb-4 flex items-baseline justify-between">
            <h2 class="text-2xl font-bold tracking-tight md:text-3xl">
              {t("Aankomende evenementen", "Upcoming events")}
            </h2>
            <a
              href={`/${lang()}/events`}
              class="shrink-0 text-sm font-semibold text-emerald-700 no-underline hover:underline"
            >
              {t("Bekijk alle evenementen", "View all events")}
            </a>
          </div>
          <Show
            when={upcomingEvents() && upcomingEvents()!.length > 0}
            fallback={
              <p class="text-sm text-zinc-600 italic">
                {t(
                  "Geen bekende aankomende evenementen — dat betekent niet dat er geen gepland zijn, we weten er alleen niet van.",
                  "No known upcoming events — that doesn't mean there aren't any planned, we just don't know of them.",
                )}
              </p>
            }
          >
            <ul class="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <For each={upcomingEvents()}>
                {(upcomingEvent) => (
                  <li class="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
                    <EventCard
                      event={upcomingEvent}
                      lang={lang()}
                      href={`/${lang()}/events/${upcomingEvent.slug}`}
                    />
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>

        <section class="border-y border-emerald-100 bg-white/60">
          <div class="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-8 md:grid-cols-3">
            <div>
              <h4 class="font-semibold">{t("Privacy dankzij Signal", "Privacy through Signal")}</h4>
              <p class="text-sm text-zinc-600">
                {t(
                  "Signal is open‑source, betaald door donaties en end‑to‑end versleuteld. Je telefoonnummer is onzichtbaar voor leden.",
                  "Signal is open-source, funded by donation and end-to-end encrypted. Your phone number is invisible to members.",
                )}
              </p>
            </div>
            <div>
              <h4 class="font-semibold">{t("Groepsoverstijgend", "Independent")}</h4>
              <p class="text-sm text-zinc-600">
                {t(
                  "Vegan Activists NL is niet verbonden aan een specifieke activisme organisatie, maar is een smeltkroes voor activisten uit alle actiegroepen die actief zijn in Nederland. Bij ons vind je elk type activist.",
                  "Vegan Activists NL is not affiliated with any single activist organization. It brings together activists from across the many groups active in the Netherlands. You'll find every kind of activist here.",
                )}
              </p>
            </div>
            <div>
              <h4 class="font-semibold">{t("Maak het verschil", "Make a difference")}</h4>
              <p class="text-sm text-zinc-600">
                {t(
                  "De dierenrechtenbeweging in Nederland is niet zo groot en de meeste mensen trekken zich weinig aan van het dierenleed om hen heen. Jouw bijdrage kan daarom een groot verschil maken voor de meest onderdrukte wezens op aarde.",
                  "The animal rights movement in the Netherlands is still relatively small, and most people pay little attention to the suffering of animals around them. Your contribution can make a real difference for some of the most oppressed beings on this planet.",
                )}
              </p>
            </div>
          </div>
        </section>
      </main>
    </Show>
  );
}
