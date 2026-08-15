import { useSearchParams } from "@solidjs/router";
import { createResource, createSignal, Show } from "solid-js";
import { Title } from "@solidjs/meta";
import { apiUrl } from "~/lib/api-url";
import {
  SignupInspectResponseSchema,
  type SignupInspectResponse,
} from "~/routes/api/auth/signup/inspect.schema";
import {
  SignupResponseSchema,
  type SignupRequest,
  type SignupResponse,
} from "~/routes/api/auth/signup.schema";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

type SignupError =
  | Extract<SignupInspectResponse, { error: string }>["error"]
  | Extract<SignupResponse, { error: string }>["error"];

function describeError(error: SignupError | undefined): string {
  switch (error) {
    case "already_used":
      return "This signup link has already been used.";
    case "invalid_token":
    case "invalid":
      return "This signup link is invalid or has expired. Message the bot again for a new one.";
    case "account_name_taken":
      return "That account name is already taken — please choose another.";
    case "validation":
      return "Please check the form and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function errorOf(result: SignupInspectResponse | undefined): SignupError | undefined {
  return result && "error" in result ? result.error : undefined;
}

export default function SignupPage() {
  const [searchParams] = useSearchParams();
  const token = () => firstParam(searchParams.token);

  const [inspection] = createResource(token, async (tokenValue): Promise<SignupInspectResponse> => {
    if (!tokenValue) {
      return { error: "invalid" };
    }
    const response = await fetch(
      apiUrl(`/api/auth/signup/inspect?token=${encodeURIComponent(tokenValue)}`),
    );
    const parsed = SignupInspectResponseSchema.safeParse(await response.json().catch(() => null));
    return parsed.success ? parsed.data : { error: "invalid" };
  });

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
      const request: SignupRequest = {
        token: token(),
        accountName: accountName(),
        email: email(),
        displayName: displayName(),
        affiliationsNote: affiliationsNote().trim() || null,
      };
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const parsed = SignupResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success || "error" in parsed.data) {
        setSubmitError(
          describeError(parsed.success && "error" in parsed.data ? parsed.data.error : undefined),
        );
        return;
      }
      setSuccess(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main class="mx-auto max-w-md px-6 py-12">
      <Title>Set up your account — Vegan Activists NL</Title>
      <Show when={!inspection.loading} fallback={<p class="text-zinc-600">Checking your link…</p>}>
        <Show
          when={inspection() && !("error" in inspection()!)}
          fallback={<p class="text-red-700">{describeError(errorOf(inspection()))}</p>}
        >
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
