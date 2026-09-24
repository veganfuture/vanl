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
      <p class="mb-6 text-zinc-700">
        {t(
          "Neem contact op met een beheerder van een van de VeganActivists.nl Signal-groepen. Die kan je verder helpen met het maken van een account.",
          "Contact an admin of one of the VeganActivists.nl Signal groups. They'll give you further instructions on how to create an account.",
        )}
      </p>

      <div>
        <h2 class="mb-2 font-medium">{t("Zo vind je een beheerder", "How to find an admin")}</h2>
        <ol class="list-decimal space-y-1 pl-5 text-sm text-zinc-600">
          <li>
            {t(
              "Open de groep in Signal en tik bovenin op de naam van de groep om de groepsinfo te openen.",
              "Open the group in Signal and tap the group's name at the top of the chat to open the group info.",
            )}
          </li>
          <li>
            {t(
              "Tik op 'Leden' (of het aantal leden) om de ledenlijst te zien.",
              "Tap 'Members' (or the member count) to see the list of members.",
            )}
          </li>
          <li>
            {t(
              "Zoek naar de personen met het label 'Beheerder' - stuur een van hen een bericht.",
              "Look for the people labeled 'Admin' - send one of them a message.",
            )}
          </li>
        </ol>
      </div>
    </main>
  );
}
