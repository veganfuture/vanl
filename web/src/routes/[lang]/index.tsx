import { Link, Meta, Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { Show } from "solid-js";
import { GroupsAccordion } from "~/components/GroupsAccordion";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { NotFound } from "~/components/NotFound";
import { GROUPS } from "~/lib/groups";
import { useLang } from "~/lib/i18n";
import { BASE_URL } from "~/lib/metadata";

export default function LandingPage() {
  const params = useParams<{ lang: string }>();
  const isValidLang = () => params.lang === "nl" || params.lang === "en";
  const { lang, t } = useLang();

  return (
    // [lang] matches any single path segment, so a stale/garbage value here
    // (e.g. someone hitting the old unprefixed /events or /login) must not
    // silently render the landing page - fall through to a real 404 instead.
    <Show when={isValidLang()} fallback={<NotFound />}>
      <LocaleCookieSync lang={lang()} />
      <Title>VeganActivists.nl</Title>
      <Meta property="og:locale" content={lang() === "nl" ? "nl_NL" : "en_US"} />
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
