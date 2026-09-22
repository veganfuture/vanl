import { Title } from "@solidjs/meta";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { useLang } from "~/lib/i18n";

/** Read by src/middleware.ts to decide this page is safe to cache publicly for anonymous visitors. */
export const route = { info: { cachePolicy: "public" } };

export default function SignupHelpPage() {
  const { lang, t } = useLang();

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Zo maak je een account", "How to sign up")} — Vegan Activists NL</Title>
      <h1 class="mb-4 text-2xl font-semibold">{t("Zo maak je een account", "How to sign up")}</h1>
      <p class="text-zinc-700">
        {t(
          "Neem contact op met een beheerder van een van de VeganActivists.nl Signal-groepen. Die kan je verder helpen met het aanmaken van een account.",
          "Contact an admin of one of the VeganActivists.nl Signal groups. They'll give you further instructions on how to create an account.",
        )}
      </p>
    </main>
  );
}
