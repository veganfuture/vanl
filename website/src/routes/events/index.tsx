import { Title } from "@solidjs/meta";
import { createResource, For, Show } from "solid-js";
import { apiFetch } from "~/lib/api-fetch";
import { ListEventsResponseSchema } from "~/routes/api/events/index.schema";

const LOCATION_KIND_LABELS: Record<string, string> = {
  precise_address: "Precise address",
  city_only: "City only",
  meeting_point_city_only: "Meeting point",
  location_tbd: "Location TBD",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function EventsListPage() {
  const [events] = createResource(async () => {
    const result = await apiFetch("/api/events", { response: ListEventsResponseSchema });
    return result.match(
      (data) => data.events,
      () => [],
    );
  });

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <Title>Events — Vegan Activists NL</Title>
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-semibold">Events</h1>
        <a
          href="/events/new"
          class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          Create event
        </a>
      </div>

      <Show when={!events.loading} fallback={<p class="text-zinc-600">Loading events…</p>}>
        <Show
          when={events() && events()!.length > 0}
          fallback={<p class="text-zinc-600">No events yet.</p>}
        >
          <ul class="space-y-4">
            <For each={events()}>
              {(event) => (
                <li class="rounded-lg border border-zinc-200 p-4">
                  <a href={`/events/${event.slug}`} class="text-lg font-semibold hover:underline">
                    {event.title}
                  </a>
                  <p class="text-sm text-zinc-600">{formatDate(event.startAt)}</p>
                  <p class="text-sm text-zinc-600">
                    {LOCATION_KIND_LABELS[event.locationKind]} — {event.locationDescription}
                  </p>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </main>
  );
}
