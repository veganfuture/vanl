import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import { apiFetch, isApiFetchError } from "~/lib/api-fetch";
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

type LoginError =
  | Extract<LoginStartResponse, { error: string }>["error"]
  | Extract<LoginVerifyResponse, { error: string }>["error"];

function describeError(error: LoginError | undefined): string {
  switch (error) {
    case "account_not_found":
      return "No account found with that name.";
    case "no_active_challenge":
      return "Your code expired — request a new one.";
    case "wrong_code":
      return "That code is incorrect. Try again.";
    case "attempts_exhausted":
      return "Too many incorrect attempts — request a new code.";
    case "validation":
      return "Please check the form and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export default function LoginPage() {
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
      if (isApiFetchError(result) || "error" in result) {
        setError(describeError(isApiFetchError(result) ? undefined : result.error));
        return;
      }
      setStep("code");
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
      if (isApiFetchError(result) || "error" in result) {
        setError(describeError(isApiFetchError(result) ? undefined : result.error));
        return;
      }
      window.location.href = "/";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main class="mx-auto max-w-md px-6 py-12">
      <Title>Log in — Vegan Activists NL</Title>
      <h1 class="mb-4 text-2xl font-semibold">Log in</h1>

      <Show when={step() === "account"}>
        <form class="space-y-4" onSubmit={onStartSubmit}>
          <label class="block">
            <span class="block text-sm font-medium">Account name</span>
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
            {submitting() ? "Sending…" : "Send login code"}
          </button>
        </form>
      </Show>

      <Show when={step() === "code"}>
        <form class="space-y-4" onSubmit={onCodeSubmit}>
          <p class="text-sm text-zinc-600">We sent a 6-digit code to you on Signal.</p>
          <label class="block">
            <span class="block text-sm font-medium">Code</span>
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
            {submitting() ? "Verifying…" : "Log in"}
          </button>
        </form>
      </Show>
    </main>
  );
}
