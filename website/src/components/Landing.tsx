import type { Locale } from "~/lib/i18n";
import type { GroupInfo } from "~/lib/groups";
import { GroupsAccordion } from "./GroupsAccordion";

export type LandingProps = {
  lang: Locale;
  groups: GroupInfo[];
};

export function Landing(props: LandingProps) {
  const t = (nl: string, en: string) => (props.lang === "nl" ? nl : en);

  return (
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
        <GroupsAccordion groups={props.groups} lang={props.lang} />

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
            <h4 class="font-semibold">{t("Waarom Signal?", "Why Signal?")}</h4>
            <p class="text-sm text-zinc-600">
              {t(
                "Signal is open‑source, onafhankelijk en end‑to‑end versleuteld. Je telefoonnummer is onzichtbaar voor leden.",
                "Signal is open-source, independent and end-to-end encrypted. Your phone number is invisible to members.",
              )}
            </p>
          </div>
          <div>
            <h4 class="font-semibold">{t("Toelating", "Admission")}</h4>
            <p class="text-sm text-zinc-600">
              {t(
                "Nieuwe leden worden kort welkom geheten. Houd het respectvol en on-topic.",
                "New members get a short welcome. Keep it respectful and on-topic.",
              )}
            </p>
          </div>
          <div>
            <h4 class="font-semibold">{t("Veiligheid", "Safety")}</h4>
            <p class="text-sm text-zinc-600">
              {t(
                "Deel geen privégegevens zonder toestemming. Bij twijfel: vraag een mod.",
                "Don’t share private info without consent. When in doubt, ask a mod.",
              )}
            </p>
          </div>
        </div>
      </section>

      <footer class="mx-auto w-full max-w-6xl px-6 py-10 text-sm text-zinc-600">
        <div class="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <p>
            {t(
              "Vrij te gebruiken. Geen rechten voorbehouden. Met liefde van Vegan Future 💚",
              "Free to use. No rights reserved. With love from Vegan Future 💚",
            )}
          </p>
        </div>
      </footer>
    </main>
  );
}
