import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, createSignal, Show } from "solid-js";
import { apiFetch, describeApiError, type ErrorMessagesFor } from "~/lib/api-fetch";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { GetEventBySlugResponseSchema } from "~/routes/api/events/by-slug/[slug].schema";
import {
  DeleteEventResponseSchema,
  type DeleteEventResponse,
} from "~/routes/api/events/[id].schema";
import {
  SetEventStatusRequestSchema,
  SetEventStatusResponseSchema,
  type SetEventStatusResponse,
} from "~/routes/api/events/[id]/status.schema";

const LOCATION_KIND_LABELS: Record<string, string> = {
  precise_address: "Precise address",
  meeting_point_city_only: "Meeting point",
};

const DELETE_ERROR_MESSAGES: ErrorMessagesFor<DeleteEventResponse> = {
  unauthorized: { message: "You need to log in to do that.", isWarn: true },
  not_found: { message: "That event no longer exists.", isWarn: true },
  forbidden: { message: "You don't have permission to do that.", isWarn: true },
  validation: { message: "Something went wrong. Please try again.", isWarn: false },
  internal_error: { message: "Something went wrong. Please try again.", isWarn: false },
};

const STATUS_ERROR_MESSAGES: ErrorMessagesFor<SetEventStatusResponse> = {
  unauthorized: { message: "You need to log in to do that.", isWarn: true },
  not_found: { message: "That event no longer exists.", isWarn: true },
  forbidden: { message: "You don't have permission to do that.", isWarn: true },
  validation: { message: "Please check the form and try again.", isWarn: false },
  internal_error: { message: "Something went wrong. Please try again.", isWarn: false },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function EventDetailPage() {
  const params = useParams();
  const [actionError, setActionError] = createSignal<string | null>(null);
  const [refreshKey, setRefreshKey] = createSignal(0);

  const [event] = createResource(
    () => [params.slug ?? "", refreshKey()] as const,
    async ([slug]) => {
      const result = await apiFetch(`/api/events/by-slug/${encodeURIComponent(slug)}`, {
        response: GetEventBySlugResponseSchema,
      });
      return result.match(
        (data) => data.event,
        () => null,
      );
    },
  );

  const [me] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  const canModerate = () => {
    const currentUser = me();
    const currentEvent = event();
    if (!currentUser || !currentEvent) return false;
    return currentUser.isSiteAdmin || currentUser.id === currentEvent.publisherUserId;
  };

  async function onDelete() {
    const currentEvent = event();
    if (!currentEvent) return;
    if (!window.confirm(`Delete "${currentEvent.title}"? This can't be undone.`)) {
      return;
    }
    setActionError(null);
    const result = await apiFetch(`/api/events/${currentEvent.id}`, {
      method: "DELETE",
      response: DeleteEventResponseSchema,
    });
    result.match(
      () => {
        window.location.href = "/events";
      },
      (error) => setActionError(describeApiError(error, DELETE_ERROR_MESSAGES)),
    );
  }

  async function onSetStatus(status: "hidden" | "visible" | "cancelled") {
    const currentEvent = event();
    if (!currentEvent) return;
    if (status === "cancelled" && !window.confirm(`Cancel "${currentEvent.title}"?`)) {
      return;
    }
    setActionError(null);
    const result = await apiFetch(`/api/events/${currentEvent.id}/status`, {
      request: SetEventStatusRequestSchema,
      body: { status, cancelReason: status === "cancelled" ? "Cancelled by moderator" : null },
      response: SetEventStatusResponseSchema,
    });
    result.match(
      () => setRefreshKey((k) => k + 1),
      (error) => setActionError(describeApiError(error, STATUS_ERROR_MESSAGES)),
    );
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <Show when={!event.loading} fallback={<p class="text-zinc-600">Loading…</p>}>
        <Show when={event()} fallback={<p class="text-zinc-600">Event not found.</p>}>
          {(currentEvent) => (
            <>
              <Title>{currentEvent().title} — Vegan Activists NL</Title>
              <h1 class="mb-2 text-2xl font-semibold">{currentEvent().title}</h1>
              <Show when={currentEvent().status !== "visible"}>
                <p class="mb-4 inline-block rounded bg-amber-100 px-2 py-1 text-sm text-amber-800">
                  {currentEvent().status === "cancelled" ? "Cancelled" : "Hidden"}
                  {currentEvent().cancelReason ? ` — ${currentEvent().cancelReason}` : ""}
                </p>
              </Show>
              <p class="mb-1 text-zinc-600">{formatDate(currentEvent().startAt)}</p>
              <p class="mb-4 text-zinc-600">
                {LOCATION_KIND_LABELS[currentEvent().locationKind]} —{" "}
                {currentEvent().locationDescription}
                <Show when={currentEvent().locationStreet}>
                  <>
                    <br />
                    {currentEvent().locationStreet} {currentEvent().locationHouseNumber},{" "}
                    {currentEvent().locationPostcode}
                  </>
                </Show>
              </p>
              <p class="mb-6 whitespace-pre-wrap">{currentEvent().description}</p>

              <Show when={currentEvent().mapUrl}>
                <p class="mb-2">
                  <a
                    href={currentEvent().mapUrl!}
                    class="underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on map
                  </a>
                </p>
              </Show>
              <Show when={currentEvent().registrationUrl}>
                <p class="mb-2">
                  <a
                    href={currentEvent().registrationUrl!}
                    class="underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Register
                  </a>
                </p>
              </Show>
              <Show when={currentEvent().externalEventUrl}>
                <p class="mb-2">
                  <a
                    href={currentEvent().externalEventUrl!}
                    class="underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    More info
                  </a>
                </p>
              </Show>
              <Show when={currentEvent().registrationInstructions}>
                <p class="mb-2 whitespace-pre-wrap">{currentEvent().registrationInstructions}</p>
              </Show>
              <Show when={currentEvent().contactInfo}>
                <p class="mb-2 text-sm text-zinc-600">Contact: {currentEvent().contactInfo}</p>
              </Show>

              <Show when={actionError()}>
                {(message) => <p class="mt-4 text-red-700">{message()}</p>}
              </Show>

              <Show when={canModerate()}>
                <div class="mt-8 flex flex-wrap gap-3 border-t border-zinc-200 pt-6">
                  <a
                    href={`/events/${currentEvent().slug}/edit`}
                    class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold transition hover:bg-zinc-50"
                  >
                    Edit
                  </a>
                  <Show
                    when={currentEvent().status === "visible"}
                    fallback={
                      <button
                        type="button"
                        class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold transition hover:bg-zinc-50"
                        onClick={() => onSetStatus("visible")}
                      >
                        Show
                      </button>
                    }
                  >
                    <button
                      type="button"
                      class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold transition hover:bg-zinc-50"
                      onClick={() => onSetStatus("hidden")}
                    >
                      Hide
                    </button>
                  </Show>
                  <Show when={currentEvent().status !== "cancelled"}>
                    <button
                      type="button"
                      class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold transition hover:bg-zinc-50"
                      onClick={() => onSetStatus("cancelled")}
                    >
                      Cancel event
                    </button>
                  </Show>
                  <button
                    type="button"
                    class="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700 transition hover:bg-red-50"
                    onClick={onDelete}
                  >
                    Delete
                  </button>
                </div>
              </Show>
            </>
          )}
        </Show>
      </Show>
    </main>
  );
}
