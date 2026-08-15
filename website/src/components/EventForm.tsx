import { createSignal, For, Show } from "solid-js";
import { apiFetch, type ErrorMessagesFor } from "~/lib/api-fetch";
import type { EventJson } from "~/routes/api/events/event.schema";
import type { PdokSuggestResponse } from "~/routes/api/events/pdok-suggest.schema";
import { PdokSuggestResponseSchema } from "~/routes/api/events/pdok-suggest.schema";
import type { SearchPlacesResponse } from "~/routes/api/places/search.schema";
import { SearchPlacesResponseSchema } from "~/routes/api/places/search.schema";

export type EventFormError =
  "unauthorized" | "not_found" | "forbidden" | "validation" | "internal_error";

export const EVENT_FORM_ERROR_MESSAGES: ErrorMessagesFor<{ error: EventFormError }> = {
  unauthorized: { message: "You need to log in to do that.", isWarn: true },
  not_found: { message: "That event no longer exists.", isWarn: true },
  forbidden: { message: "You don't have permission to do that.", isWarn: true },
  validation: { message: "Please check the form and try again.", isWarn: false },
  internal_error: { message: "Something went wrong. Please try again.", isWarn: false },
};

type LocationKind = EventJson["locationKind"];

const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  precise_address: "Precise address",
  meeting_point_city_only: "Meeting point (city shown, exact spot shared with attendees)",
};

export type EventFormValues = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  locationKind: LocationKind;
  placeId: string;
  placeLabel: string;
  locationDescription: string;
  pdokAddressId: string | null;
  addressLabel: string;
  mapUrl: string;
  contactInfo: string;
  registrationInstructions: string;
  externalEventUrl: string;
  registrationUrl: string;
};

export function emptyEventFormValues(): EventFormValues {
  return {
    title: "",
    description: "",
    startAt: "",
    endAt: "",
    locationKind: "precise_address",
    placeId: "",
    placeLabel: "",
    locationDescription: "",
    pdokAddressId: null,
    addressLabel: "",
    mapUrl: "",
    contactInfo: "",
    registrationInstructions: "",
    externalEventUrl: "",
    registrationUrl: "",
  };
}

/** Converts a `<input type="datetime-local">` value (no timezone) to a full ISO instant. */
function localDateTimeToIso(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Converts a stored ISO instant back to the value a datetime-local input expects. */
function isoToLocalDateTime(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function eventFormValuesFromEvent(event: EventJson, placeLabel: string): EventFormValues {
  const addressLabel = event.locationStreet
    ? `${event.locationStreet} ${event.locationHouseNumber ?? ""}, ${event.locationPostcode ?? ""}`.trim()
    : "";
  return {
    title: event.title,
    description: event.description,
    startAt: isoToLocalDateTime(event.startAt),
    endAt: isoToLocalDateTime(event.endAt),
    locationKind: event.locationKind,
    placeId: event.placeId,
    placeLabel,
    locationDescription: event.locationDescription,
    pdokAddressId: event.locationPdokId,
    addressLabel,
    mapUrl: event.mapUrl ?? "",
    contactInfo: event.contactInfo ?? "",
    registrationInstructions: event.registrationInstructions ?? "",
    externalEventUrl: event.externalEventUrl ?? "",
    registrationUrl: event.registrationUrl ?? "",
  };
}

function debounced<T>(fn: (arg: T) => void, delayMs: number): (arg: T) => void {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (arg: T) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(arg), delayMs);
  };
}

export function EventForm(props: {
  initial: EventFormValues;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (values: EventFormValues) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const [values, setValues] = createSignal(props.initial);
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const [placeResults, setPlaceResults] = createSignal<SearchPlacesResponse["places"]>([]);
  const [placeQuery, setPlaceQuery] = createSignal(props.initial.placeLabel);
  const searchPlaces = debounced(async (query: string) => {
    if (query.trim().length < 2) {
      setPlaceResults([]);
      return;
    }
    const result = await apiFetch(`/api/places/search?q=${encodeURIComponent(query)}`, {
      response: SearchPlacesResponseSchema,
    });
    result.match(
      (data) => setPlaceResults(data.places),
      () => setPlaceResults([]),
    );
  }, 250);

  const [addressResults, setAddressResults] = createSignal<PdokSuggestResponse["suggestions"]>([]);
  const [addressQuery, setAddressQuery] = createSignal(props.initial.addressLabel);
  const searchAddresses = debounced(async (query: string) => {
    if (query.trim().length < 2) {
      setAddressResults([]);
      return;
    }
    const result = await apiFetch(`/api/events/pdok-suggest?q=${encodeURIComponent(query)}`, {
      response: PdokSuggestResponseSchema,
    });
    result.match(
      (data) => setAddressResults(data.suggestions),
      () => setAddressResults([]),
    );
  }, 250);

  async function onSubmit(submitEvent: SubmitEvent) {
    submitEvent.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await props.onSubmit(values());
      if (!outcome.ok) {
        setError(outcome.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form class="space-y-4" onSubmit={onSubmit}>
      <label class="block">
        <span class="block text-sm font-medium">Title</span>
        <input
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          required
          value={values().title}
          onInput={(e) => setValues({ ...values(), title: e.currentTarget.value })}
        />
      </label>

      <label class="block">
        <span class="block text-sm font-medium">Description</span>
        <textarea
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          required
          rows={4}
          value={values().description}
          onInput={(e) => setValues({ ...values(), description: e.currentTarget.value })}
        />
      </label>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="block text-sm font-medium">Starts at</span>
          <input
            type="datetime-local"
            class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            required
            value={values().startAt}
            onInput={(e) => setValues({ ...values(), startAt: e.currentTarget.value })}
          />
        </label>
        <label class="block">
          <span class="block text-sm font-medium">Ends at (optional)</span>
          <input
            type="datetime-local"
            class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            value={values().endAt}
            onInput={(e) => setValues({ ...values(), endAt: e.currentTarget.value })}
          />
        </label>
      </div>

      <label class="block">
        <span class="block text-sm font-medium">Location kind</span>
        <select
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          value={values().locationKind}
          onChange={(e) => {
            setPlaceQuery("");
            setAddressQuery("");
            setValues({
              ...values(),
              locationKind: e.currentTarget.value as LocationKind,
              placeId: "",
              placeLabel: "",
              pdokAddressId: null,
              locationDescription: "",
            });
          }}
        >
          <For each={Object.entries(LOCATION_KIND_LABELS)}>
            {([kind, label]) => <option value={kind}>{label}</option>}
          </For>
        </select>
      </label>

      <Show
        when={values().locationKind === "precise_address"}
        fallback={
          <>
            <div class="relative block">
              <span class="block text-sm font-medium">City / woonplaats</span>
              <input
                class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                required
                autocomplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                placeholder="Start typing a Dutch city or town…"
                value={placeQuery()}
                onInput={(e) => {
                  const query = e.currentTarget.value;
                  setPlaceQuery(query);
                  setValues({ ...values(), placeId: "", placeLabel: "" });
                  searchPlaces(query);
                }}
              />
              <Show when={placeResults().length > 0 && !values().placeId}>
                <ul class="absolute z-10 mt-1 w-full rounded border border-zinc-300 bg-white shadow-lg">
                  <For each={placeResults()}>
                    {(place) => (
                      <li>
                        <button
                          type="button"
                          class="block w-full px-3 py-2 text-left hover:bg-zinc-100"
                          onClick={() => {
                            setValues({ ...values(), placeId: place.id, placeLabel: place.name });
                            setPlaceQuery(place.name);
                            setPlaceResults([]);
                          }}
                        >
                          {place.name} <span class="text-zinc-500">({place.municipalityName})</span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>

            <label class="block">
              <span class="block text-sm font-medium">Location description</span>
              <input
                class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                required
                placeholder="e.g. Museumplein, or 'in front of the town hall'"
                value={values().locationDescription}
                onInput={(e) =>
                  setValues({ ...values(), locationDescription: e.currentTarget.value })
                }
              />
            </label>
          </>
        }
      >
        <div class="relative block">
          <span class="block text-sm font-medium">Address</span>
          <input
            class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            required
            autocomplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            placeholder="Start typing a street address…"
            value={addressQuery()}
            onInput={(e) => {
              const query = e.currentTarget.value;
              setAddressQuery(query);
              setValues({ ...values(), pdokAddressId: null, locationDescription: "" });
              searchAddresses(query);
            }}
          />
          <Show when={addressResults().length > 0 && !values().pdokAddressId}>
            <ul class="absolute z-10 mt-1 w-full rounded border border-zinc-300 bg-white shadow-lg">
              <For each={addressResults()}>
                {(suggestion) => (
                  <li>
                    <button
                      type="button"
                      class="block w-full px-3 py-2 text-left hover:bg-zinc-100"
                      onClick={() => {
                        setValues({
                          ...values(),
                          pdokAddressId: suggestion.pdokId,
                          locationDescription: suggestion.label,
                        });
                        setAddressQuery(suggestion.label);
                        setAddressResults([]);
                      }}
                    >
                      {suggestion.label}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <p class="mt-1 text-xs text-zinc-500">
            Search and pick your address here — this is the only way to set the location for a
            precise-address event, and it needs PDOK to be reachable to save.
          </p>
        </div>
      </Show>

      <label class="block">
        <span class="block text-sm font-medium">Map URL (optional)</span>
        <input
          type="url"
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          value={values().mapUrl}
          onInput={(e) => setValues({ ...values(), mapUrl: e.currentTarget.value })}
        />
      </label>

      <label class="block">
        <span class="block text-sm font-medium">Contact info (optional)</span>
        <input
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          value={values().contactInfo}
          onInput={(e) => setValues({ ...values(), contactInfo: e.currentTarget.value })}
        />
      </label>

      <label class="block">
        <span class="block text-sm font-medium">Registration instructions (optional)</span>
        <textarea
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          rows={2}
          value={values().registrationInstructions}
          onInput={(e) =>
            setValues({ ...values(), registrationInstructions: e.currentTarget.value })
          }
        />
      </label>

      <label class="block">
        <span class="block text-sm font-medium">External event URL (optional)</span>
        <input
          type="url"
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          value={values().externalEventUrl}
          onInput={(e) => setValues({ ...values(), externalEventUrl: e.currentTarget.value })}
        />
      </label>

      <label class="block">
        <span class="block text-sm font-medium">Registration URL (optional)</span>
        <input
          type="url"
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          value={values().registrationUrl}
          onInput={(e) => setValues({ ...values(), registrationUrl: e.currentTarget.value })}
        />
      </label>

      <Show when={error()}>{(message) => <p class="text-red-700">{message()}</p>}</Show>

      <button
        type="submit"
        disabled={
          submitting() ||
          (values().locationKind === "precise_address"
            ? !values().pdokAddressId
            : !values().placeId)
        }
        class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {submitting() ? props.submittingLabel : props.submitLabel}
      </button>
    </form>
  );
}

export function toEventRequestBody(values: EventFormValues) {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    startAt: localDateTimeToIso(values.startAt) ?? "",
    endAt: localDateTimeToIso(values.endAt),
    locationKind: values.locationKind,
    // The server resolves placeId from the PDOK lookup for precise_address -
    // it's never taken from client state for that kind.
    placeId: values.locationKind === "precise_address" ? null : values.placeId || null,
    locationDescription: values.locationDescription.trim(),
    pdokAddressId: values.pdokAddressId,
    mapUrl: values.mapUrl.trim() || null,
    contactInfo: values.contactInfo.trim() || null,
    registrationInstructions: values.registrationInstructions.trim() || null,
    externalEventUrl: values.externalEventUrl.trim() || null,
    registrationUrl: values.registrationUrl.trim() || null,
  };
}
