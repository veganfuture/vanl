import { createSignal, For, Show } from "solid-js";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  validateEvent,
  type ValidatableEvent,
  EVENT_TITLE_MAX_LENGTH,
  EVENT_DESCRIPTION_MAX_LENGTH,
  EVENT_LOCATION_DESCRIPTION_MAX_LENGTH,
  EVENT_URL_MAX_LENGTH,
} from "~/lib/event_validation";
import { apiFetch, type ErrorMessagesFor } from "~/lib/api-fetch";
import { ImagePickerField } from "./ImagePickerField";
import { makeT, type Locale } from "~/lib/i18n";
import type { EventJson } from "~/routes/api/events/event.schema";
import type { PdokSuggestResponse } from "~/routes/api/events/pdok-suggest.schema";
import { PdokSuggestResponseSchema } from "~/routes/api/events/pdok-suggest.schema";
import type { SearchPlacesResponse } from "~/routes/api/places/search.schema";
import { SearchPlacesResponseSchema } from "~/routes/api/places/search.schema";
import type { Uuid } from "~/lib/uuid";

export type EventFormError =
  "unauthorized" | "not_found" | "forbidden" | "validation" | "internal_error";

export function eventFormErrorMessages(lang: Locale): ErrorMessagesFor<{ error: EventFormError }> {
  const t = makeT(lang);
  return {
    unauthorized: {
      message: t("Je moet inloggen om dat te doen.", "You need to log in to do that."),
      isWarn: true,
    },
    not_found: {
      message: t("Dat evenement bestaat niet meer.", "That event no longer exists."),
      isWarn: true,
    },
    forbidden: {
      message: t(
        "Je hebt geen toestemming om dat te doen.",
        "You don't have permission to do that.",
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
}

type LocationKind = EventJson["locationKind"];

export type EventFormValues = {
  titleNl: string;
  titleEn: string;
  descriptionNl: string;
  descriptionEn: string;
  /** A "yyyy-MM-dd'T'HH:mm" datetime-local value when startTimeKnown, otherwise a bare "yyyy-MM-dd" date. */
  startAt: string;
  /** Unchecked "Time unknown" (the common case) - when false, startAt is date-only and its time is never sent as a real time. */
  startTimeKnown: boolean;
  /** Same shape/meaning as startAt, gated by endTimeKnown - see toEventRequestBody for the exclusive-end-date conversion applied when endTimeKnown is false. */
  endAt: string;
  endTimeKnown: boolean;
  locationKind: LocationKind;
  placeId: string;
  placeLabel: string;
  locationDescription: string;
  pdokAddressId: string | null;
  addressLabel: string;
  mapUrl: string;
  externalEventUrl: string;
  registrationUrl: string;
  /** Publish on behalf of this org instead of as yourself. Null publishes as yourself. */
  orgId: string | null;
};

export function emptyEventFormValues(): EventFormValues {
  return {
    titleNl: "",
    titleEn: "",
    descriptionNl: "",
    descriptionEn: "",
    startAt: "",
    startTimeKnown: true,
    endAt: "",
    endTimeKnown: true,
    locationKind: "precise_address",
    placeId: "",
    placeLabel: "",
    locationDescription: "",
    pdokAddressId: null,
    addressLabel: "",
    mapUrl: "",
    externalEventUrl: "",
    registrationUrl: "",
    orgId: null,
  };
}

// Every date/time in this form is entered and displayed as Dutch wall-clock
// time (Europe/Amsterdam), regardless of the visitor's own device/browser
// timezone - a `<input type="datetime-local">` value has no timezone of its
// own, so treating it as the *browser's* local time (as a bare `new
// Date(value)` would) silently gives the wrong instant for anyone not
// currently in the Netherlands. date-fns-tz handles the IANA-timezone-aware
// conversion (Amsterdam's UTC offset isn't fixed - CET/CEST - and there's a
// genuinely ambiguous hour each October when clocks go back).
const AMSTERDAM_TZ = "Europe/Amsterdam";

/** Converts a `<input type="datetime-local">` value, read as Amsterdam wall-clock time, to a full UTC ISO instant. */
function localDateTimeToIso(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = fromZonedTime(value, AMSTERDAM_TZ);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Converts a stored UTC ISO instant back to the value a datetime-local input expects, in Amsterdam wall-clock time. */
function isoToLocalDateTime(iso: string | null): string {
  if (!iso) {
    return "";
  }
  return formatInTimeZone(new Date(iso), AMSTERDAM_TZ, "yyyy-MM-dd'T'HH:mm");
}

/** Converts a `<input type="date">` value, read as an Amsterdam calendar date, to a full UTC ISO instant at Amsterdam midnight. */
function localDateToIso(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = fromZonedTime(`${value}T00:00`, AMSTERDAM_TZ);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Converts a stored UTC ISO instant back to the value a date input expects, in Amsterdam wall-clock time. */
function isoToLocalDate(iso: string | null): string {
  if (!iso) {
    return "";
  }
  return formatInTimeZone(new Date(iso), AMSTERDAM_TZ, "yyyy-MM-dd");
}

/** Pure calendar-day arithmetic on a bare "yyyy-MM-dd" string - no timezone involved, so DST can't shift it by a day. */
function shiftDateOnly(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Switches a form field's raw string between the datetime-local and
 * date-only shapes when its "time unknown" checkbox is toggled, preserving
 * whatever date was already entered instead of clearing the field.
 */
function convertTimeKnownValue(current: string, timeKnown: boolean): string {
  if (!timeKnown) {
    return current.slice(0, 10);
  }
  return current.length > 10 ? current : current ? `${current}T00:00` : "";
}

function toDate(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

export function eventFormValuesFromEvent(event: EventJson, placeLabel: string): EventFormValues {
  const addressLabel = event.locationStreet
    ? `${event.locationStreet} ${event.locationHouseNumber ?? ""}, ${event.locationPostcode ?? ""}`.trim()
    : "";
  return {
    titleNl: event.titleNl ?? "",
    titleEn: event.titleEn ?? "",
    descriptionNl: event.descriptionNl ?? "",
    descriptionEn: event.descriptionEn ?? "",
    startAt: event.startTimeKnown
      ? isoToLocalDateTime(event.startAt)
      : isoToLocalDate(event.startAt),
    startTimeKnown: event.startTimeKnown,
    // Storage keeps a date-only end exclusive (the day after the last day,
    // per RFC 5545) - shown to the admin as the inclusive "last day" they'd
    // expect, so subtract 1 day here (undone by +1 in toEventRequestBody).
    endAt: event.endTimeKnown
      ? isoToLocalDateTime(event.endAt)
      : event.endAt
        ? shiftDateOnly(isoToLocalDate(event.endAt), -1)
        : "",
    endTimeKnown: event.endTimeKnown,
    locationKind: event.locationKind,
    placeId: event.placeId,
    placeLabel,
    locationDescription: event.locationDescription,
    pdokAddressId: event.locationPdokId,
    addressLabel,
    mapUrl: event.mapUrl ?? "",
    externalEventUrl: event.externalEventUrl ?? "",
    registrationUrl: event.registrationUrl ?? "",
    orgId: event.publisherOrgId,
  };
}

function toValidatableEvent(values: EventFormValues): ValidatableEvent {
  return {
    titleNl: values.titleNl.trim() || null,
    titleEn: values.titleEn.trim() || null,
    descriptionNl: values.descriptionNl.trim() || null,
    descriptionEn: values.descriptionEn.trim() || null,
    startAt: toDate(
      values.startTimeKnown ? localDateTimeToIso(values.startAt) : localDateToIso(values.startAt),
    ),
    startTimeKnown: values.startTimeKnown,
    endAt: toDate(
      values.endTimeKnown
        ? localDateTimeToIso(values.endAt)
        : localDateToIso(values.endAt ? shiftDateOnly(values.endAt, 1) : ""),
    ),
    endTimeKnown: values.endTimeKnown,
    locationKind: values.locationKind,
    // Client-side hint only, re-validated server-side (EventRequestSchema) - see toEventRequestBody.
    placeId: values.locationKind === "precise_address" ? null : (values.placeId as Uuid) || null,
    locationDescription: values.locationDescription.trim(),
    pdokAddressId: values.pdokAddressId,
    mapUrl: values.mapUrl.trim() || null,
    externalEventUrl: values.externalEventUrl.trim() || null,
    registrationUrl: values.registrationUrl.trim() || null,
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
  lang: Locale;
  initial: EventFormValues;
  submitLabel: string;
  submittingLabel: string;
  /** New events can't start in the past - editing an existing (possibly already-past) event isn't restricted. */
  requireFutureStart?: boolean;
  /** Orgs the caller can publish as, in addition to themselves - empty (or omitted) hides the selector entirely and behaves exactly as before. */
  orgs?: Array<{ id: string; name: string }>;
  /** The event's current flyer, shown until a new file is picked - undefined/null on the create form (no event yet). */
  currentFlyerImageId?: string | null;
  /** Shows "Save as draft" / "Publish" buttons instead of the single submitLabel button - only meaningful while an event is still a draft, since it can never go back once published. */
  allowDraft?: boolean;
  onSubmit: (
    values: EventFormValues,
    flyerFile: File | null,
    status: "draft" | "visible" | null,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const t = (nl: string, en: string) => (props.lang === "nl" ? nl : en);
  const locationKindLabels = (): Record<LocationKind, string> => ({
    precise_address: t("Exact adres", "Precise address"),
    meeting_point_city_only: t(
      "Verzamelpunt (stad zichtbaar, exacte plek alleen gedeeld met deelnemers)",
      "Meeting point (city shown, exact spot shared with attendees)",
    ),
  });

  const [values, setValues] = createSignal(props.initial);
  const [flyerFile, setFlyerFile] = createSignal<File | null>(null);
  const [submitting, setSubmitting] = createSignal(false);
  const [submittingStatus, setSubmittingStatus] = createSignal<"draft" | "visible" | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [validationMessages, setValidationMessages] = createSignal<string[]>([]);

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

  async function onSubmit(status: "draft" | "visible" | null) {
    setError(null);
    setValidationMessages([]);

    const validation = validateEvent(toValidatableEvent(values()), {
      lang: props.lang,
      requireFutureStart: !!props.requireFutureStart,
    });
    if (validation.isErr()) {
      setValidationMessages(validation.error);
      return;
    }

    setSubmitting(true);
    setSubmittingStatus(status);
    try {
      const outcome = await props.onSubmit(values(), flyerFile(), status);
      if (!outcome.ok) {
        setError(outcome.message);
      }
    } finally {
      setSubmitting(false);
      setSubmittingStatus(null);
    }
  }

  return (
    <form class="space-y-4" onSubmit={(e) => e.preventDefault()}>
      <Show when={(props.orgs?.length ?? 0) > 0}>
        <label class="block">
          <span class="block text-sm font-medium">{t("Publiceren als", "Publish as")}</span>
          <select
            class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            value={values().orgId ?? ""}
            onChange={(e) => setValues({ ...values(), orgId: e.currentTarget.value || null })}
          >
            <option value="">{t("Mezelf", "Myself")}</option>
            <For each={props.orgs}>{(org) => <option value={org.id}>{org.name}</option>}</For>
          </select>
        </label>
      </Show>

      <ImagePickerField
        lang={props.lang}
        label={t("Flyer (optioneel)", "Flyer (optional)")}
        currentImageId={props.currentFlyerImageId}
        onChange={setFlyerFile}
      />

      <p class="text-xs text-zinc-500">
        {t(
          "Vul titel en beschrijving samen in het Nederlands, Engels, of beide in.",
          "Fill in title and description together, in Dutch, English, or both.",
        )}
      </p>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="block text-sm font-medium">🇳🇱 Titel</span>
          <input
            class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            value={values().titleNl}
            maxlength={EVENT_TITLE_MAX_LENGTH}
            onInput={(e) => setValues({ ...values(), titleNl: e.currentTarget.value })}
          />
        </label>
        <label class="block">
          <span class="block text-sm font-medium">🇬🇧 Title</span>
          <input
            class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            value={values().titleEn}
            maxlength={EVENT_TITLE_MAX_LENGTH}
            onInput={(e) => setValues({ ...values(), titleEn: e.currentTarget.value })}
          />
        </label>
      </div>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label class="block">
          <span class="block text-sm font-medium">🇳🇱 Beschrijving</span>
          <textarea
            class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            rows={4}
            value={values().descriptionNl}
            maxlength={EVENT_DESCRIPTION_MAX_LENGTH}
            onInput={(e) => setValues({ ...values(), descriptionNl: e.currentTarget.value })}
          />
        </label>
        <label class="block">
          <span class="block text-sm font-medium">🇬🇧 Description</span>
          <textarea
            class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            rows={4}
            value={values().descriptionEn}
            maxlength={EVENT_DESCRIPTION_MAX_LENGTH}
            onInput={(e) => setValues({ ...values(), descriptionEn: e.currentTarget.value })}
          />
        </label>
      </div>

      <p class="text-xs text-zinc-500">
        {t(
          "Tijden hieronder zijn in Nederlandse tijd (Europe/Amsterdam), ongeacht je eigen tijdzone.",
          "Times below are in Dutch time (Europe/Amsterdam), regardless of your own timezone.",
        )}
      </p>

      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label class="block">
            <span class="block text-sm font-medium">
              {t("Begint om", "Starts at")}{" "}
              <span class="font-normal text-zinc-400">{t("(NL tijd)", "(NL time)")}</span>
            </span>
            <input
              type={values().startTimeKnown ? "datetime-local" : "date"}
              class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              required
              min={
                props.requireFutureStart
                  ? values().startTimeKnown
                    ? isoToLocalDateTime(new Date().toISOString())
                    : isoToLocalDate(new Date().toISOString())
                  : undefined
              }
              value={values().startAt}
              onInput={(e) => setValues({ ...values(), startAt: e.currentTarget.value })}
            />
          </label>
          <label class="mt-1 flex items-center gap-1.5 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={!values().startTimeKnown}
              onChange={(e) => {
                const startTimeKnown = !e.currentTarget.checked;
                setValues({
                  ...values(),
                  startTimeKnown,
                  startAt: convertTimeKnownValue(values().startAt, startTimeKnown),
                });
              }}
            />
            {t("Tijd onbekend", "Time unknown")}
          </label>
        </div>
        <div>
          <label class="block">
            <span class="block text-sm font-medium">
              {t("Eindigt om (optioneel)", "Ends at (optional)")}{" "}
              <span class="font-normal text-zinc-400">{t("(NL tijd)", "(NL time)")}</span>
            </span>
            <input
              type={values().endTimeKnown ? "datetime-local" : "date"}
              class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
              value={values().endAt}
              onInput={(e) => setValues({ ...values(), endAt: e.currentTarget.value })}
            />
          </label>
          <label class="mt-1 flex items-center gap-1.5 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={!values().endTimeKnown}
              onChange={(e) => {
                const endTimeKnown = !e.currentTarget.checked;
                setValues({
                  ...values(),
                  endTimeKnown,
                  endAt: convertTimeKnownValue(values().endAt, endTimeKnown),
                });
              }}
            />
            {t("Tijd onbekend", "Time unknown")}
          </label>
        </div>
      </div>

      <label class="block">
        <span class="block text-sm font-medium">{t("Soort locatie", "Location kind")}</span>
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
          <For each={Object.entries(locationKindLabels())}>
            {([kind, label]) => <option value={kind}>{label}</option>}
          </For>
        </select>
      </label>

      <Show
        when={values().locationKind === "precise_address"}
        fallback={
          <>
            <div class="relative block">
              <span class="block text-sm font-medium">
                {t("Stad / woonplaats", "City / woonplaats")}
              </span>
              <input
                class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                required
                autocomplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                placeholder={t(
                  "Begin met typen van een Nederlandse stad of plaats…",
                  "Start typing a Dutch city or town…",
                )}
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
              <span class="block text-sm font-medium">
                {t("Locatiebeschrijving", "Location description")}
              </span>
              <input
                class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                required
                autocomplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                placeholder={t(
                  "bijv. Museumplein, of 'voor het gemeentehuis'",
                  "e.g. Museumplein, or 'in front of the town hall'",
                )}
                value={values().locationDescription}
                maxlength={EVENT_LOCATION_DESCRIPTION_MAX_LENGTH}
                onInput={(e) =>
                  setValues({ ...values(), locationDescription: e.currentTarget.value })
                }
              />
            </label>
          </>
        }
      >
        <div class="relative block">
          <span class="block text-sm font-medium">{t("Adres", "Address")}</span>
          <input
            class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
            required
            autocomplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            placeholder={t(
              "Begin met typen van een straatadres…",
              "Start typing a street address…",
            )}
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
            {t(
              "Zoek en kies hier je adres — dit is de enige manier om de locatie voor een evenement met exact adres in te stellen, en PDOK moet bereikbaar zijn om op te slaan.",
              "Search and pick your address here — this is the only way to set the location for a precise-address event, and it needs PDOK to be reachable to save.",
            )}
          </p>
        </div>
      </Show>

      <label class="block">
        <span class="block text-sm font-medium">
          {t("Kaart-URL (optioneel)", "Map URL (optional)")}
        </span>
        <input
          type="url"
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          value={values().mapUrl}
          maxlength={EVENT_URL_MAX_LENGTH}
          onInput={(e) => setValues({ ...values(), mapUrl: e.currentTarget.value })}
        />
      </label>

      <label class="block">
        <span class="block text-sm font-medium">
          {t("Externe evenement-URL (optioneel)", "External event URL (optional)")}
        </span>
        <input
          type="url"
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          value={values().externalEventUrl}
          maxlength={EVENT_URL_MAX_LENGTH}
          onInput={(e) => setValues({ ...values(), externalEventUrl: e.currentTarget.value })}
        />
      </label>

      <label class="block">
        <span class="block text-sm font-medium">
          {t("Aanmeld-URL (optioneel)", "Registration URL (optional)")}
        </span>
        <input
          type="url"
          class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
          value={values().registrationUrl}
          maxlength={EVENT_URL_MAX_LENGTH}
          onInput={(e) => setValues({ ...values(), registrationUrl: e.currentTarget.value })}
        />
      </label>

      <Show when={validationMessages().length > 0}>
        <ul class="list-inside list-disc space-y-1 text-red-700">
          <For each={validationMessages()}>{(message) => <li>{message}</li>}</For>
        </ul>
      </Show>

      <Show when={error()}>{(message) => <p class="text-red-700">{message()}</p>}</Show>

      <Show
        when={props.allowDraft}
        fallback={
          <button
            type="button"
            disabled={submitting()}
            onClick={() => onSubmit(null)}
            class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting() ? props.submittingLabel : props.submitLabel}
          </button>
        }
      >
        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={submitting()}
            onClick={() => onSubmit("draft")}
            class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {submittingStatus() === "draft"
              ? t("Concept opslaan…", "Saving draft…")
              : t("Opslaan als concept", "Save as draft")}
          </button>
          <button
            type="button"
            disabled={submitting()}
            onClick={() => onSubmit("visible")}
            class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {submittingStatus() === "visible"
              ? t("Publiceren…", "Publishing…")
              : t("Publiceren", "Publish")}
          </button>
        </div>
      </Show>
    </form>
  );
}

export function toEventRequestBody(values: EventFormValues, status?: "draft" | "visible") {
  return {
    titleNl: values.titleNl.trim() || null,
    titleEn: values.titleEn.trim() || null,
    descriptionNl: values.descriptionNl.trim() || null,
    descriptionEn: values.descriptionEn.trim() || null,
    startAt:
      (values.startTimeKnown
        ? localDateTimeToIso(values.startAt)
        : localDateToIso(values.startAt)) ?? "",
    startTimeKnown: values.startTimeKnown,
    // See eventFormValuesFromEvent - storage keeps a date-only end exclusive
    // (the day after the admin's chosen "last day"), so add 1 day back here.
    endAt: values.endTimeKnown
      ? localDateTimeToIso(values.endAt)
      : localDateToIso(values.endAt ? shiftDateOnly(values.endAt, 1) : ""),
    endTimeKnown: values.endTimeKnown,
    locationKind: values.locationKind,
    // The server resolves placeId from the PDOK lookup for precise_address -
    // it's never taken from client state for that kind.
    placeId: values.locationKind === "precise_address" ? null : values.placeId || null,
    locationDescription: values.locationDescription.trim(),
    pdokAddressId: values.pdokAddressId,
    mapUrl: values.mapUrl.trim() || null,
    externalEventUrl: values.externalEventUrl.trim() || null,
    registrationUrl: values.registrationUrl.trim() || null,
    orgId: values.orgId,
    status,
  };
}
