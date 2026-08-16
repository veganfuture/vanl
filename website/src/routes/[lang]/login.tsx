import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch, describeApiError, type ErrorMessagesFor } from "~/lib/api-fetch";
import { useLang } from "~/lib/i18n";
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
  const { lang, t } = useLang();

  const LOGIN_ERROR_MESSAGES: ErrorMessagesFor<LoginStartResponse | LoginVerifyResponse> = {
    account_not_found: {
      message: t("Geen account gevonden met die naam.", "No account found with that name."),
      isWarn: true,
    },
    no_active_challenge: {
      message: t(
        "Je code is verlopen. Vraag een nieuwe aan.",
        "Your code expired. Request a new one.",
      ),
      isWarn: true,
    },
    wrong_code: {
      message: t("Die code is onjuist. Probeer het opnieuw.", "That code is incorrect. Try again."),
      isWarn: true,
    },
    attempts_exhausted: {
      message: t(
        "Te veel foute pogingen. Vraag om een nieuwe code.",
        "Too many incorrect attempts. Request a new code.",
      ),
      isWarn: true,
    },
    rate_limited: {
      message: t(
        "Te veel codes aangevraagd. Probeer het over een paar uur opnieuw.",
        "Too many codes requested. Please try again in a few hours.",
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
  const [resending, setResending] = createSignal(false);
  const [resendMessage, setResendMessage] = createSignal<string | null>(null);
  // Once a resend hits the rate limit, the button stops working for the
  // rest of this page session rather than letting the user hammer it -
  // there's no point re-attempting until the 12h window rolls forward.
  const [rateLimited, setRateLimited] = createSignal(false);

  onMount(() => {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${REMEMBERED_ACCOUNT_COOKIE_NAME}=([^;]*)`),
    );
    if (match) {
      setAccountName(decodeURIComponent(match[1]));
    }
  });

  async function sendCode(): Promise<{ ok: true } | { ok: false; message: string }> {
    const result = await apiFetch("/api/auth/login/start", {
      request: LoginStartRequestSchema,
      body: { accountName: accountName() },
      response: LoginStartResponseSchema,
    });
    return result.match(
      () => ({ ok: true as const }),
      (apiError) => {
        if ("error" in apiError && apiError.error === "rate_limited") {
          setRateLimited(true);
        }
        return { ok: false as const, message: describeApiError(apiError, LOGIN_ERROR_MESSAGES) };
      },
    );
  }

  async function onStartSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await sendCode();
      if (outcome.ok) {
        setStep("code");
      } else {
        setError(outcome.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setResending(true);
    setError(null);
    setResendMessage(null);
    try {
      const outcome = await sendCode();
      if (outcome.ok) {
        setResendMessage(t("Nieuwe code verstuurd.", "New code sent."));
      } else {
        setError(outcome.message);
      }
    } finally {
      setResending(false);
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
          <Show when={!error() && resendMessage()}>
            {(message) => <p class="text-emerald-700">{message()}</p>}
          </Show>
          <button
            type="submit"
            disabled={submitting()}
            class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting() ? t("Bezig met verifiëren…", "Verifying…") : t("Inloggen", "Log in")}
          </button>
          <button
            type="button"
            disabled={resending() || rateLimited()}
            onClick={onResend}
            class="block text-sm text-zinc-600 underline disabled:cursor-not-allowed disabled:text-zinc-400 disabled:no-underline"
          >
            {resending()
              ? t("Bezig met versturen…", "Sending…")
              : t("Geen code ontvangen? Stuur opnieuw", "Didn't get a code? Resend")}
          </button>
        </form>
      </Show>
    </main>
  );
}
