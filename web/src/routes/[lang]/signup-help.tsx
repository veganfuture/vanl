import { Title } from "@solidjs/meta";
import { For } from "solid-js";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { useLang } from "~/lib/i18n";

type Step = { title: string; body: string };

export default function SignupHelpPage() {
  const { lang, t } = useLang();

  const steps = (): Step[] => [
    {
      title: t("Word lid van een Signal-groep", "Join a Signal group"),
      body: t(
        "VANL Bot zit in elke groep, dus het maakt niet uit welke groep je kiest. Nog in geen enkele groep? Ga eerst naar de homepage en sluit je aan bij een groep.",
        "VANL Bot is a member of every group, so it doesn't matter which one you pick. Not in a group yet? Head to the homepage and join one first.",
      ),
    },
    {
      title: t("Open de ledenlijst van de groep", "Open the group's member list"),
      body: t(
        "Tik in Signal op de naam van de groep bovenin het scherm om de groepsinfo te openen, en dan op 'Leden' (of het aantal leden) om de ledenlijst te zien.",
        "In Signal, tap the group's name at the top of the chat to open the group info, then tap 'Members' (or the member count) to see the list of members.",
      ),
    },
    {
      title: t("Zoek VANL Bot op", "Find VANL Bot"),
      body: t(
        "Tik in de ledenlijst op 'VANL Bot'. Dit opent een privéchat met de bot - niet de groepschat.",
        "Tap 'VANL Bot' in the member list. This opens a private chat with the bot - not the group chat.",
      ),
    },
    {
      title: t("Stuur 'signup' naar de bot", "Message the bot 'signup'"),
      body: t(
        "Stuur de bot rechtstreeks (dus niet in de groep) een bericht met daarin het woord 'signup'.",
        "Send the bot a direct message (not in the group) containing the word 'signup'.",
      ),
    },
    {
      title: t("Open de link die je terugkrijgt", "Open the link you get back"),
      body: t(
        "De bot antwoordt met een persoonlijke, eenmalig te gebruiken link. Die link brengt je terug naar deze site, waar je een accountnaam, e-mailadres en weergavenaam invult om je account aan te maken.",
        "The bot replies with a personal, single-use link. That link brings you back to this site, where you fill in an account name, email address, and display name to create your account.",
      ),
    },
    {
      title: t("Klaar - je kan nu inloggen", "Done - you can now log in"),
      body: t(
        "Vanaf nu kan je altijd inloggen met je accountnaam; je krijgt dan een inlogcode via Signal.",
        "From now on you can log in any time with your account name; you'll receive a login code via Signal.",
      ),
    },
  ];

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Zo maak je een account", "How to sign up")} — Vegan Activists NL</Title>
      <h1 class="mb-4 text-2xl font-semibold">{t("Zo maak je een account", "How to sign up")}</h1>
      <p class="mb-8 text-zinc-700">
        {t(
          "Om evenementen te maken of je aan te melden, of een organisatie te beheren, heb je een account nodig dat gekoppeld is aan je Signal-identiteit. Zo zet je die in een paar stappen op.",
          "To create or RSVP to events, or manage an organization, you'll need an account linked to your Signal identity. Here's how to set that up in a few steps.",
        )}
      </p>

      <ol class="space-y-6">
        <For each={steps()}>
          {(step, index) => (
            <li class="flex gap-4">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-semibold text-white">
                {index() + 1}
              </span>
              <div>
                <h2 class="font-medium">{step.title}</h2>
                <p class="text-sm text-zinc-600">{step.body}</p>
              </div>
            </li>
          )}
        </For>
      </ol>

      <p class="mt-8 text-sm text-zinc-600">
        {t(
          "De link van de bot werkt maar één keer en verloopt na een tijdje. Werkt je link niet meer? Stuur de bot gewoon opnieuw 'signup'.",
          "The bot's link only works once and expires after a while. If your link stops working, just message the bot 'signup' again.",
        )}
      </p>
    </main>
  );
}
