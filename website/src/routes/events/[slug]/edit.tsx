import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, Show } from "solid-js";
import {
  EventForm,
  EVENT_FORM_ERROR_MESSAGES,
  eventFormValuesFromEvent,
  toEventRequestBody,
  type EventFormValues,
} from "~/components/EventForm";
import { Navbar } from "~/components/Navbar";
import { apiFetch, describeApiError } from "~/lib/api-fetch";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { GetEventBySlugResponseSchema } from "~/routes/api/events/by-slug/[slug].schema";
import { EventRequestSchema } from "~/routes/api/events/event.schema";
import { UpdateEventResponseSchema } from "~/routes/api/events/[id].schema";
import { GetPlaceResponseSchema } from "~/routes/api/places/[id].schema";

export default function EditEventPage() {
  const params = useParams();

  const [event] = createResource(
    () => params.slug ?? "",
    async (slug) => {
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

  const [placeLabel] = createResource(
    () => event()?.placeId,
    async (placeId) => {
      const result = await apiFetch(`/api/places/${placeId}`, { response: GetPlaceResponseSchema });
      return result.match(
        (data) => data.place.name,
        () => "",
      );
    },
  );

  const canEdit = () => {
    const currentUser = me();
    const currentEvent = event();
    if (!currentUser || !currentEvent) return false;
    return currentUser.isSiteAdmin || currentUser.id === currentEvent.publisherUserId;
  };

  async function onSubmit(values: EventFormValues) {
    const currentEvent = event();
    if (!currentEvent) {
      return { ok: false as const, message: "Something went wrong. Please try again." };
    }
    const result = await apiFetch(`/api/events/${currentEvent.id}`, {
      method: "PATCH",
      request: EventRequestSchema,
      body: toEventRequestBody(values),
      response: UpdateEventResponseSchema,
    });
    return result.match(
      (updated) => {
        window.location.href = `/events/${updated.slug}`;
        return { ok: true as const };
      },
      (error) => ({
        ok: false as const,
        message: describeApiError(error, EVENT_FORM_ERROR_MESSAGES),
      }),
    );
  }

  return (
    <>
      <Navbar />
      <main class="mx-auto max-w-2xl px-6 py-12">
        <Title>Edit event — Vegan Activists NL</Title>
        <h1 class="mb-6 text-2xl font-semibold">Edit event</h1>

        <Show
          when={!event.loading && !me.loading && !placeLabel.loading}
          fallback={<p class="text-zinc-600">Loading…</p>}
        >
          <Show when={event()} fallback={<p class="text-zinc-600">Event not found.</p>}>
            {(currentEvent) => (
              <Show
                when={canEdit()}
                fallback={
                  <p class="text-zinc-600">You don't have permission to edit this event.</p>
                }
              >
                <EventForm
                  initial={eventFormValuesFromEvent(currentEvent(), placeLabel() ?? "")}
                  submitLabel="Save changes"
                  submittingLabel="Saving…"
                  onSubmit={onSubmit}
                />
              </Show>
            )}
          </Show>
        </Show>
      </main>
    </>
  );
}
