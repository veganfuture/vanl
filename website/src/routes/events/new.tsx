import { Title } from "@solidjs/meta";
import { createResource, Show } from "solid-js";
import {
  EventForm,
  EVENT_FORM_ERROR_MESSAGES,
  emptyEventFormValues,
  toEventRequestBody,
  type EventFormValues,
} from "~/components/EventForm";
import { apiFetch, describeApiError } from "~/lib/api-fetch";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { EventRequestSchema } from "~/routes/api/events/event.schema";
import { CreateEventResponseSchema } from "~/routes/api/events/index.schema";

export default function NewEventPage() {
  const [me] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  async function onSubmit(values: EventFormValues) {
    const result = await apiFetch("/api/events", {
      request: EventRequestSchema,
      body: toEventRequestBody(values),
      response: CreateEventResponseSchema,
    });
    return result.match(
      (created) => {
        window.location.href = `/events/${created.slug}`;
        return { ok: true as const };
      },
      (error) => ({
        ok: false as const,
        message: describeApiError(error, EVENT_FORM_ERROR_MESSAGES),
      }),
    );
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <Title>Create event — Vegan Activists NL</Title>
      <h1 class="mb-6 text-2xl font-semibold">Create event</h1>

      <Show when={!me.loading} fallback={<p class="text-zinc-600">Loading…</p>}>
        <Show
          when={me()}
          fallback={
            <p class="text-zinc-600">
              You need to{" "}
              <a href="/login" class="underline">
                log in
              </a>{" "}
              to create an event.
            </p>
          }
        >
          <EventForm
            initial={emptyEventFormValues()}
            submitLabel="Create event"
            submittingLabel="Creating…"
            onSubmit={onSubmit}
          />
        </Show>
      </Show>
    </main>
  );
}
