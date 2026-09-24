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
import { useLang } from "~/lib/i18n";

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
  // Fallback for a race the inspect-time already_registered check below
  // can't fully close (e.g. two concurrent signups for the same Signal
  // account) — same underlying cause, just caught later. No account name to
  // show here, so point back at the bot instead.
  already_registered: {
    message:
      "This Signal account already has an account. Message the bot again to get a reminder of your account name.",
    isWarn: true,
  },
  validation: { message: "Please check the form and try again.", isWarn: false },
  internal_error: { message: "Something went wrong. Please try again.", isWarn: false },
};

type InspectionState =
  | { kind: "ready" }
  | { kind: "already_registered"; accountName: string }
  | { kind: "error"; message: string };

export default function SignupPage() {
  const [searchParams] = useSearchParams();
  const token = () => firstParam(searchParams.token);

  const [inspection] = createResource(token, async (tokenValue): Promise<InspectionState> => {
    if (!tokenValue) {
      return {
        kind: "error",
        message: describeApiError({ error: "invalid" as const }, SIGNUP_ERROR_MESSAGES),
      };
    }
    const result = await apiFetch(
      `/api/auth/signup/inspect?token=${encodeURIComponent(tokenValue)}`,
      { response: SignupInspectResponseSchema },
    );
    return result.match(
      (state): InspectionState =>
        state.status === "already_registered"
          ? { kind: "already_registered", accountName: state.accountName }
          : { kind: "ready" },
      (error): InspectionState => ({
        kind: "error",
        message: describeApiError(error, SIGNUP_ERROR_MESSAGES),
      }),
    );
  });
  const inspectionErrorMessage = () => {
    const state = inspection();
    return state?.kind === "error" ? state.message : undefined;
  };
  const alreadyRegisteredAccountName = () => {
    const state = inspection();
    return state?.kind === "already_registered" ? state.accountName : undefined;
  };

  const { lang } = useLang();
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
        () => setSuccess(true),
        (error) => setSubmitError(describeApiError(error, SIGNUP_ERROR_MESSAGES)),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main class="mx-auto max-w-md px-6 py-12">
      <Title>Set up your account — Vegan Activists NL</Title>
      <Show when={!inspection.loading} fallback={<p class="text-zinc-600">Checking your link…</p>}>
        <Show
          when={!inspectionErrorMessage()}
          fallback={<p class="text-red-700">{inspectionErrorMessage()}</p>}
        >
          <Show
            when={!alreadyRegisteredAccountName()}
            fallback={
              <p class="text-zinc-700">
                You already have an account — your account name is{" "}
                <strong class="font-semibold">{alreadyRegisteredAccountName()}</strong>. You can{" "}
                <a href={`/${lang()}/login`} class="underline">
                  log in
                </a>{" "}
                with it.
              </p>
            }
          >
            <Show
              when={!success()}
              fallback={
                <p class="text-emerald-700">
                  Account created! You can now{" "}
                  <a href={`/${lang()}/login`} class="underline">
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
                  <span class="block text-sm font-medium">
                    Affiliations (private, not published)
                  </span>
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
      </Show>
    </main>
  );
}
