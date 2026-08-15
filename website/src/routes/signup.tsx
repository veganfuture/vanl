import { useSearchParams } from "@solidjs/router";
import { createResource, createSignal, Show } from "solid-js";
import { Title } from "@solidjs/meta";
import { apiFetch, describeApiError, type ErrorMessagesFor } from "~/lib/api-fetch";
import {
  SignupInspectResponseSchema,
  type SignupInspectResponse,
} from "~/routes/api/auth/signup/inspect.schema";
import {
  SignupRequestSchema,
  SignupResponseSchema,
  type SignupResponse,
} from "~/routes/api/auth/signup.schema";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const SIGNUP_ERROR_MESSAGES: ErrorMessagesFor<SignupInspectResponse | SignupResponse> = {
  invalid: {
    message: "This signup link is invalid or has expired. Message the bot again for a new one.",
    isWarn: true,
  },
  invalid_token: {
    message: "This signup link is invalid or has expired. Message the bot again for a new one.",
    isWarn: true,
  },
  already_used: { message: "This signup link has already been used.", isWarn: true },
  account_name_taken: {
    message: "That account name is already taken — please choose another.",
    isWarn: true,
  },
  validation: { message: "Please check the form and try again.", isWarn: false },
  internal_error: { message: "Something went wrong. Please try again.", isWarn: false },
};

export default function SignupPage() {
  const [searchParams] = useSearchParams();
  const token = () => firstParam(searchParams.token);

  const [inspectionError] = createResource(
    token,
    async (tokenValue): Promise<string | undefined> => {
      if (!tokenValue) {
        return describeApiError({ error: "invalid" as const }, SIGNUP_ERROR_MESSAGES);
      }
      const result = await apiFetch(
        `/api/auth/signup/inspect?token=${encodeURIComponent(tokenValue)}`,
        { response: SignupInspectResponseSchema },
      );
      return result.match(
        (data) => ("error" in data ? describeApiError(data, SIGNUP_ERROR_MESSAGES) : undefined),
        (fetchError) => describeApiError(fetchError, SIGNUP_ERROR_MESSAGES),
      );
    },
  );

  const [accountName, setAccountName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [affiliationsNote, setAffiliationsNote] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [submitError, setSubmitError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal(false);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await apiFetch("/api/auth/signup", {
        request: SignupRequestSchema,
        body: {
          token: token(),
          accountName: accountName(),
          email: email(),
          displayName: displayName(),
          affiliationsNote: affiliationsNote().trim() || null,
        },
        response: SignupResponseSchema,
      });
      result.match(
        (data) => {
          if ("error" in data) {
            setSubmitError(describeApiError(data, SIGNUP_ERROR_MESSAGES));
            return;
          }
          setSuccess(true);
        },
        (fetchError) => setSubmitError(describeApiError(fetchError, SIGNUP_ERROR_MESSAGES)),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main class="mx-auto max-w-md px-6 py-12">
      <Title>Set up your account — Vegan Activists NL</Title>
      <Show
        when={!inspectionError.loading}
        fallback={<p class="text-zinc-600">Checking your link…</p>}
      >
        <Show when={!inspectionError()} fallback={<p class="text-red-700">{inspectionError()}</p>}>
          <Show
            when={!success()}
            fallback={
              <p class="text-emerald-700">
                Account created! You can now{" "}
                <a href="/login" class="underline">
                  log in
                </a>
                .
              </p>
            }
          >
            <h1 class="mb-4 text-2xl font-semibold">Set up your account</h1>
            <form class="space-y-4" onSubmit={onSubmit}>
              <label class="block">
                <span class="block text-sm font-medium">Account name</span>
                <input
                  class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                  required
                  minlength={3}
                  maxlength={32}
                  value={accountName()}
                  onInput={(event) => setAccountName(event.currentTarget.value)}
                />
              </label>
              <label class="block">
                <span class="block text-sm font-medium">Email</span>
                <input
                  type="email"
                  class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                  required
                  value={email()}
                  onInput={(event) => setEmail(event.currentTarget.value)}
                />
              </label>
              <label class="block">
                <span class="block text-sm font-medium">Display name</span>
                <input
                  class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                  required
                  value={displayName()}
                  onInput={(event) => setDisplayName(event.currentTarget.value)}
                />
              </label>
              <label class="block">
                <span class="block text-sm font-medium">Affiliations (private, not published)</span>
                <textarea
                  class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                  value={affiliationsNote()}
                  onInput={(event) => setAffiliationsNote(event.currentTarget.value)}
                />
              </label>
              <Show when={submitError()}>
                {(message) => <p class="text-red-700">{message()}</p>}
              </Show>
              <button
                type="submit"
                disabled={submitting()}
                class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting() ? "Creating…" : "Create account"}
              </button>
            </form>
          </Show>
        </Show>
      </Show>
    </main>
  );
}
