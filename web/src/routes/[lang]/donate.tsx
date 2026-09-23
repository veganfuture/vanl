import { Title } from "@solidjs/meta";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { useLang } from "~/lib/i18n";

/** Read by src/middleware.ts to decide this page is safe to cache publicly for anonymous visitors. */
export const route = { info: { cachePolicy: "public" } };

export default function DonatePage() {
  const { lang, t } = useLang();

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Doneer", "Donate")} — Vegan Activists NL</Title>
      <h1 class="mb-4 text-2xl font-semibold">
        {t("Steun VeganActivists.nl", "Support VeganActivists.nl")} ❤️
      </h1>
      <p class="mb-6 text-zinc-700">
        {t(
          "VeganActivists.nl wordt gratis aangeboden, maar is niet gratis om te draaien. We maken kosten voor de server waar de site op draait, voor het domein, en voor de tools die we gebruiken om alles soepel te laten werken. Als je ons werk waardeert, helpt elke bijdrage om deze site in de lucht te houden.",
          "VeganActivists.nl is free to use, but it isn't free to run. We have costs for the server that hosts the site, for the domain, and for the tooling we rely on to keep everything running smoothly. If you value what we're doing, any contribution helps keep this site online.",
        )}
      </p>

      <div class="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p class="mb-4 text-sm text-zinc-700">
          {t(
            "Je kunt geld overmaken via bunq.me:",
            "You can send money via bunq.me:",
          )}
        </p>
        <a
          href="https://bunq.me/veganfuture"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-block rounded-full bg-red-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-red-700"
        >
          ❤️ {t("Doneer via bunq.me/veganfuture", "Donate via bunq.me/veganfuture")}
        </a>
      </div>

      <p class="mt-6 text-sm text-zinc-600">
        {t(
          "Bedankt voor je steun - iedere bijdrage maakt verschil!",
          "Thank you for your support - every contribution makes a difference!",
        )}
      </p>
    </main>
  );
}
