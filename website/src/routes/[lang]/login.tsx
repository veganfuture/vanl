import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch, describeApiError, type ErrorMessagesFor } from "~/lib/api-fetch";
import { resolveLang } from "~/lib/i18n";
import { REMEMBERED_ACCOUNT_COOKIE_NAME } from "~/domain/auth/cookies";
import {
  LoginStartRequestSchema,
  LoginStartResponseSchema,
  type LoginStartResponse,
} from "~/routes/api/auth/login/start.schema";
import {
  LoginVerifyRequestSchema,
  LoginVerifyResponseSchema,
  type LoginVerifyResponse,
} from "~/routes/api/auth/login/verify.schema";

type Step = "account" | "code";

export default function LoginPage() {
  const params = useParams<{ lang: string }>();
  const lang = () => resolveLang(params.lang);
  const t = (nl: string, en: string) => (lang() === "nl" ? nl : en);

  const LOGIN_ERROR_MESSAGES: ErrorMessagesFor<LoginStartResponse | LoginVerifyResponse> = {
    account_not_found: {
      message: t("Geen account gevonden met die naam.", "No account found with that name."),
      isWarn: true,
    },
    no_active_challenge: {
      message: t(
        "Je code is verlopen — vraag een nieuwe aan.",
        "Your code expired — request a new one.",
      ),
      isWarn: true,
    },
    wrong_code: {
      message: t("Die code is onjuist. Probeer het opnieuw.", "That code is incorrect. Try again."),
      isWarn: true,
    },
    attempts_exhausted: {
      message: t(
        "Te veel foute pogingen — vraag een nieuwe code aan.",
        "Too many incorrect attempts — request a new code.",
      ),
      isWarn: true,
    },
    validation: {
      message: t(
        "Controleer het formulier en probeer het opnieuw.",
        "Please check the form and try again.",
      ),
      isWarn: false,
    },
    internal_error: {
      message: t(
        "Er is iets misgegaan. Probeer het opnieuw.",
        "Something went wrong. Please try again.",
      ),
      isWarn: false,
    },
  };

  const [step, setStep] = createSignal<Step>("account");
  const [accountName, setAccountName] = createSignal("");
  const [code, setCode] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [submitting, setSubmitting] = createSignal(false);

  onMount(() => {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${REMEMBERED_ACCOUNT_COOKIE_NAME}=([^;]*)`),
    );
    if (match) {
      setAccountName(decodeURIComponent(match[1]));
    }
  });

  async function onStartSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch("/api/auth/login/start", {
        request: LoginStartRequestSchema,
        body: { accountName: accountName() },
        response: LoginStartResponseSchema,
      });
      result.match(
        () => setStep("code"),
        (error) => setError(describeApiError(error, LOGIN_ERROR_MESSAGES)),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onCodeSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch("/api/auth/login/verify", {
        request: LoginVerifyRequestSchema,
        body: { accountName: accountName(), code: code() },
        response: LoginVerifyResponseSchema,
      });
      result.match(
        () => {
          window.location.href = `/${lang()}`;
        },
        (error) => setError(describeApiError(error, LOGIN_ERROR_MESSAGES)),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main class="mx-auto max-w-md px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Inloggen", "Log in")} — Vegan Activists NL</Title>
      <h1 class="mb-4 text-2xl font-semibold">{t("Inloggen", "Log in")}</h1>

      <Show when={step() === "account"}>
        <form class="space-y-4" onSubmit={onStartSubmit}>
          <label class="block">
            <span class="block text-sm font-medium">{t("Accountnaam", "Account name")}</span>
            <input
              class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              required
              value={accountName()}
              onInput={(event) => setAccountName(event.currentTarget.value)}
            />
          </label>
          <Show when={error()}>{(message) => <p class="text-red-700">{message()}</p>}</Show>
          <button
            type="submit"
            disabled={submitting()}
            class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting()
              ? t("Bezig met verzenden…", "Sending…")
              : t("Inlogcode versturen", "Send login code")}
          </button>
        </form>
      </Show>

      <Show when={step() === "code"}>
        <form class="space-y-4" onSubmit={onCodeSubmit}>
          <p class="text-sm text-zinc-600">
            {t(
              "We hebben je een 6-cijferige code gestuurd via Signal.",
              "We sent a 6-digit code to you on Signal.",
            )}
          </p>
          <label class="block">
            <span class="block text-sm font-medium">{t("Code", "Code")}</span>
            <input
              class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              required
              maxlength={6}
              inputmode="numeric"
              value={code()}
              onInput={(event) => setCode(event.currentTarget.value)}
            />
          </label>
          <Show when={error()}>{(message) => <p class="text-red-700">{message()}</p>}</Show>
          <button
            type="submit"
            disabled={submitting()}
            class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting() ? t("Bezig met verifiëren…", "Verifying…") : t("Inloggen", "Log in")}
          </button>
        </form>
      </Show>
    </main>
  );
}
