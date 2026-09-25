import { Title } from "@solidjs/meta";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import {
  EventForm,
  eventFormErrorMessages,
  eventFormValuesFromEvent,
  emptyEventFormValues,
  isoToLocalTime,
  toEventRequestBody,
  type EventFormValues,
} from "~/components/EventForm";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch, describeApiError } from "~/lib/api-fetch";
import { apiUrl } from "~/lib/api-url";
import { imageUrl } from "~/lib/image-url";
import { pickLocalized, useLang } from "~/lib/i18n";
import { formatEventDate } from "~/lib/format-date";
import { useMe } from "~/lib/queries";
import type { Sha256 } from "~/lib/sha256";
import { uploadImage } from "~/lib/upload-image";
import type { EventJson } from "~/routes/api/events/event.schema";
import { EventRequestSchema } from "~/routes/api/events/event.schema";
import {
  CreateEventResponseSchema,
  ListEventsResponseSchema,
} from "~/routes/api/events/index.schema";
import { GetPlaceResponseSchema } from "~/routes/api/places/[id].schema";
import { MyOrganizationsResponseSchema } from "~/routes/api/organizations/mine.schema";

/** What events/new.tsx's prefill picker hands to EventForm once a source event (and its place label + flyer bytes) has finished resolving. */
type PrefillData = {
  values: EventFormValues;
  prefillStartTime: string | null;
  prefillEndTime: string | null;
  flyerFile: File | null;
  currentFlyerImageId: string | null;
};

async function fetchPlaceLabel(source: EventJson): Promise<string> {
  if (source.locationKind !== "meeting_point_city_only" || !source.placeId) {
    return "";
  }
  const result = await apiFetch(`/api/places/${source.placeId}`, {
    response: GetPlaceResponseSchema,
  });
  return result.match(
    (data) => data.place.name,
    () => "",
  );
}

async function fetchFlyerFile(source: EventJson): Promise<File | null> {
  if (!source.flyerFullImageId) {
    return null;
  }
  try {
    const response = await fetch(apiUrl(imageUrl(source.flyerFullImageId as Sha256)));
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    return new File([blob], "flyer", { type: blob.type });
  } catch {
    return null;
  }
}

async function loadPrefillData(source: EventJson): Promise<PrefillData> {
  const placeLabel = await fetchPlaceLabel(source);
  const flyerFile = await fetchFlyerFile(source);

  const values = eventFormValuesFromEvent(source, placeLabel);
  const prefillStartTime = source.startTimeKnown ? isoToLocalTime(source.startAt) : null;
  const prefillEndTime = source.endTimeKnown ? isoToLocalTime(source.endAt) : null;
  // The whole point of prefilling is to make a *new* event from an old one's
  // template - reusing the same date (as opposed to just the time-of-day)
  // would too easily lead to accidentally duplicating a past event's date.
  values.startAt = "";
  values.endAt = "";

  return {
    values,
    prefillStartTime,
    prefillEndTime,
    flyerFile,
    currentFlyerImageId: source.flyerThumbnailImageId,
  };
}

export default function NewEventPage() {
  const { lang, t } = useLang();

  const me = useMe();

  const [myOrgs] = createResource(async () => {
    const result = await apiFetch("/api/organizations/mine", {
      response: MyOrganizationsResponseSchema,
    });
    return result.match(
      (data) => data.organizations,
      () => [],
    );
  });

  // Powers the "prefill from an earlier event" picker below - fetched once
  // up front so picking an event doesn't need its own network round trip
  // (only its place label and flyer bytes do, in loadPrefillData).
  const [myEvents] = createResource(async () => {
    const result = await apiFetch("/api/events/mine", { response: ListEventsResponseSchema });
    return result.match(
      (data) => data.events,
      () => [],
    );
  });

  const [prefillSourceId, setPrefillSourceId] = createSignal("");
  const [prefill] = createResource(
    () => prefillSourceId() || null,
    async (sourceId) => {
      const source = myEvents()?.find((event) => event.id === sourceId);
      return source ? loadPrefillData(source) : null;
    },
  );

  // Drives which EventForm instance is mounted: "blank" for the untouched
  // create form, or "prefill:<id>" once that source's place label and flyer
  // bytes have finished loading. Used as a <Show keyed> key below so
  // picking a different source event remounts EventForm with fresh initial
  // values - it only reads props.initial once, on mount.
  const formKey = createMemo(() => {
    const sourceId = prefillSourceId();
    if (!sourceId) return "blank";
    return prefill.loading ? null : `prefill:${sourceId}`;
  });

  async function onSubmit(
    values: EventFormValues,
    flyerFile: File | null,
    status: "draft" | "visible" | null,
  ) {
    const result = await apiFetch("/api/events", {
      request: EventRequestSchema,
      body: toEventRequestBody(values, status ?? "visible"),
      response: CreateEventResponseSchema,
    });
    return result.match(
      async (created) => {
        // The flyer upload needs the event's id, so it can only happen
        // after creation succeeds - if it fails, land on the edit page
        // (rather than the detail page) so retrying is one click away
        // instead of a dead end.
        const uploaded = flyerFile
          ? await uploadImage(`/api/events/${created.id}/flyer`, flyerFile)
          : true;
        window.location.href = uploaded
          ? `/${lang()}/events/${created.slug}?toast=event_published`
          : `/${lang()}/events/${created.slug}/edit`;
        return { ok: true as const };
      },
      (error) =>
        Promise.resolve({
          ok: false as const,
          message: describeApiError(error, eventFormErrorMessages(lang())),
        }),
    );
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Maak evenement", "Create event")} — Vegan Activists NL</Title>
      <h1 class="mb-6 text-2xl font-semibold">{t("Maak evenement", "Create event")}</h1>

      <Show
        when={me() !== undefined}
        fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}
      >
        <Show
          when={me()}
          fallback={
            <p class="text-zinc-600">
              {t("Je moet ", "You need to ")}
              <a href={`/${lang()}/login`} class="underline">
                {t("inloggen", "log in")}
              </a>
              {t(" om een evenement aan te maken.", " to create an event.")}
            </p>
          }
        >
          <Show when={(myEvents()?.length ?? 0) > 0}>
            <label class="mb-6 block rounded-lg border border-zinc-200 p-4">
              <span class="block text-sm font-medium">
                {t(
                  "Vullen met een eerder evenement (optioneel)",
                  "Prefill from an earlier event (optional)",
                )}
              </span>
              <select
                class="mt-1 block w-full rounded border border-zinc-300 px-3 py-2"
                value={prefillSourceId()}
                onChange={(e) => setPrefillSourceId(e.currentTarget.value)}
              >
                <option value="">{t("— Leeg formulier —", "— Blank form —")}</option>
                <For each={myEvents()}>
                  {(event) => (
                    <option value={event.id}>
                      {pickLocalized(event.titleNl, event.titleEn, lang())} —{" "}
                      {formatEventDate(event.startAt, lang(), event.startTimeKnown)}
                    </option>
                  )}
                </For>
              </select>
              <p class="mt-1 text-xs text-zinc-500">
                {t(
                  "Vult tijden, locatie en overige velden in - de datum vul je zelf opnieuw in.",
                  "Fills in times, location, and other fields - you pick the date yourself.",
                )}
              </p>
            </label>
          </Show>

          <Show
            when={formKey()}
            keyed
            fallback={<p class="text-zinc-600">{t("Evenement laden…", "Loading event…")}</p>}
          >
            {(key) => {
              const data = key === "blank" ? null : prefill();
              return (
                <EventForm
                  lang={lang()}
                  initial={data?.values ?? emptyEventFormValues()}
                  prefillStartTime={data?.prefillStartTime}
                  prefillEndTime={data?.prefillEndTime}
                  initialFlyerFile={data?.flyerFile}
                  currentFlyerImageId={data?.currentFlyerImageId}
                  submitLabel={t("Maak evenement", "Create event")}
                  submittingLabel={t("Bezig met maken…", "Creating…")}
                  requireFutureStart
                  allowDraft
                  orgs={myOrgs()?.map((org) => ({ id: org.id, name: org.name }))}
                  onSubmit={onSubmit}
                />
              );
            }}
          </Show>
        </Show>
      </Show>
    </main>
  );
}
