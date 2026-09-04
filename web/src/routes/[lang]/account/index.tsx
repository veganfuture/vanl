import { Title } from "@solidjs/meta";
import { createResource, createSignal, Show } from "solid-js";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch, describeApiError, type ErrorMessagesFor } from "~/lib/api-fetch";
import { useLang } from "~/lib/i18n";
import {
  GetAccountResponseSchema,
  UpdateAccountRequestSchema,
  UpdateAccountResponseSchema,
  type UpdateAccountResponse,
} from "~/routes/api/account/index.schema";

export default function AccountPage() {
  const { lang, t } = useLang();

  const ACCOUNT_ERROR_MESSAGES: ErrorMessagesFor<UpdateAccountResponse> = {
    unauthorized: {
      message: t("Je moet ingelogd zijn om dit te doen.", "You need to be logged in to do this."),
      isWarn: true,
    },
    validation: {
      message: t(
        "Controleer het formulier en probeer het opnieuw.",
        "Please check the form and try again.",
      ),
      isWarn: true,
    },
    internal_error: {
      message: t(
        "Er is iets misgegaan. Probeer het opnieuw.",
        "Something went wrong. Please try again.",
      ),
      isWarn: false,
    },
  };

  const [account, { mutate: setAccount }] = createResource(async () => {
    const result = await apiFetch("/api/account", { response: GetAccountResponseSchema });
    return result.match(
      (data) => ("account" in data ? data.account : null),
      () => null,
    );
  });

  const [email, setEmail] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [affiliationsNote, setAffiliationsNote] = createSignal("");
  const [initialized, setInitialized] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [saved, setSaved] = createSignal(false);

  function syncFormFromAccount() {
    const current = account();
    if (!current || initialized()) {
      return;
    }
    setEmail(current.email);
    setDisplayName(current.displayName);
    setAffiliationsNote(current.affiliationsNote ?? "");
    setInitialized(true);
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(lang() === "nl" ? "nl-NL" : "en-GB", {
      dateStyle: "long",
    });
  }

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await apiFetch("/api/account", {
        method: "PATCH",
        request: UpdateAccountRequestSchema,
        body: {
          email: email(),
          displayName: displayName(),
          affiliationsNote: affiliationsNote().trim() || null,
        },
        response: UpdateAccountResponseSchema,
      });
      result.match(
        (data) => {
          if ("account" in data) {
            setAccount(data.account);
            setSaved(true);
          }
        },
        (apiError) => setError(describeApiError(apiError, ACCOUNT_ERROR_MESSAGES)),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Account", "Account")} — Vegan Activists NL</Title>
      <h1 class="mb-6 text-2xl font-semibold">{t("Account", "Account")}</h1>

      <Show
        when={!account.loading}
        fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}
      >
        <Show
          when={account()}
          fallback={
            <p class="text-zinc-600">
              {t("Je moet ", "You need to ")}
              <a href={`/${lang()}/login`} class="underline">
                {t("inloggen", "log in")}
              </a>
              {t(" om je account te bekijken.", " to view your account.")}
            </p>
          }
        >
          {(currentAccount) => {
            syncFormFromAccount();
            return (
              <div class="space-y-8">
                <dl class="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
                  <dt class="text-zinc-600">{t("Accountnaam", "Account name")}</dt>
                  <dd class="font-medium">{currentAccount().accountName}</dd>
                  <dt class="text-zinc-600">{t("Lid sinds", "Member since")}</dt>
                  <dd class="font-medium">{formatDate(currentAccount().createdAt)}</dd>
                </dl>

                <form class="space-y-4" onSubmit={onSubmit}>
                  <label class="block">
                    <span class="block text-sm font-medium">
                      {t("Weergavenaam", "Display name")}
                    </span>
                    <input
                      class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                      required
                      value={displayName()}
                      onInput={(event) => setDisplayName(event.currentTarget.value)}
                    />
                  </label>
                  <label class="block">
                    <span class="block text-sm font-medium">
                      {t("E-mailadres", "Email address")}
                    </span>
                    <input
                      type="email"
                      class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                      required
                      value={email()}
                      onInput={(event) => setEmail(event.currentTarget.value)}
                    />
                  </label>
                  <label class="block">
                    <span class="block text-sm font-medium">
                      {t("Affiliaties (optioneel)", "Affiliations (optional)")}
                    </span>
                    <textarea
                      class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                      rows={3}
                      value={affiliationsNote()}
                      onInput={(event) => setAffiliationsNote(event.currentTarget.value)}
                    />
                  </label>

                  <Show when={error()}>{(message) => <p class="text-red-700">{message()}</p>}</Show>
                  <Show when={saved() && !error()}>
                    <p class="text-emerald-700">{t("Wijzigingen opgeslagen.", "Changes saved.")}</p>
                  </Show>

                  <button
                    type="submit"
                    disabled={saving()}
                    class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving()
                      ? t("Bezig met opslaan…", "Saving…")
                      : t("Wijzigingen opslaan", "Save changes")}
                  </button>
                </form>
              </div>
            );
          }}
        </Show>
      </Show>
    </main>
  );
}
