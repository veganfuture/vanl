import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, createSignal, Show } from "solid-js";
import { BuildingIcon, CalendarIcon, MapPinIcon } from "~/components/icons";
import { LinkifiedText } from "~/components/LinkifiedText";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { Toast } from "~/components/Toast";
import { apiFetch, describeApiError, type ErrorMessagesFor } from "~/lib/api-fetch";
import { formatEventDate } from "~/lib/format-date";
import { pickLocalized, useLang } from "~/lib/i18n";
import { imageUrl } from "~/lib/image-url";
import type { Sha256 } from "~/lib/sha256";
import { useQueryToast } from "~/lib/toast";
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

/** Read by src/middleware.ts to decide this page is safe to cache publicly for anonymous visitors. */
export const route = { info: { cachePolicy: "public" } };

export default function EventDetailPage() {
  const params = useParams<{ slug: string }>();
  const { lang, t } = useLang();
  const [toastMessage, dismissToast] = useQueryToast(lang);

  const deleteErrorMessages = (): ErrorMessagesFor<DeleteEventResponse> => ({
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
        "Er is iets misgegaan. Probeer het opnieuw.",
        "Something went wrong. Please try again.",
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
  });

  const statusErrorMessages = (): ErrorMessagesFor<SetEventStatusResponse> => ({
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
  });

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

  const canModerate = () => event()?.canEdit ?? false;

  async function onDelete() {
    const currentEvent = event();
    if (!currentEvent) return;
    const title = pickLocalized(currentEvent.titleNl, currentEvent.titleEn, lang());
    if (
      !window.confirm(
        t(
          `"${title}" verwijderen? Dit kan niet ongedaan worden gemaakt.`,
          `Delete "${title}"? This can't be undone.`,
        ),
      )
    ) {
      return;
    }
    setActionError(null);
    const result = await apiFetch(`/api/events/${currentEvent.id}`, {
      method: "DELETE",
      response: DeleteEventResponseSchema,
    });
    result.match(
      () => {
        window.location.href = `/${lang()}/events`;
      },
      (error) => setActionError(describeApiError(error, deleteErrorMessages())),
    );
  }

  async function onSetStatus(status: "hidden" | "visible" | "cancelled") {
    const currentEvent = event();
    if (!currentEvent) return;
    const title = pickLocalized(currentEvent.titleNl, currentEvent.titleEn, lang());

    let statusReason: string | null = null;
    if (status === "hidden" || status === "cancelled") {
      const promptMessage =
        status === "cancelled"
          ? t(`Reden voor annuleren van "${title}":`, `Reason for cancelling "${title}":`)
          : t(`Reden voor verbergen van "${title}":`, `Reason for hiding "${title}":`);
      const input = window.prompt(promptMessage);
      if (input === null) return;
      statusReason = input.trim();
      if (!statusReason) {
        setActionError(t("Een reden is verplicht.", "A reason is required."));
        return;
      }
    }

    if (
      status === "cancelled" &&
      !window.confirm(t(`"${title}" annuleren?`, `Cancel "${title}"?`))
    ) {
      return;
    }
    setActionError(null);
    const result = await apiFetch(`/api/events/${currentEvent.id}/status`, {
      request: SetEventStatusRequestSchema,
      body: {
        status,
        statusReason,
      },
      response: SetEventStatusResponseSchema,
    });
    result.match(
      () => setRefreshKey((k) => k + 1),
      (error) => setActionError(describeApiError(error, statusErrorMessages())),
    );
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Show when={toastMessage()}>
        {(message) => <Toast message={message()} onDismiss={dismissToast} />}
      </Show>
      <Show when={!event.loading} fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}>
        <Show
          when={event()}
          fallback={
            <p class="text-zinc-600">{t("Evenement niet gevonden.", "Event not found.")}</p>
          }
        >
          {(currentEvent) => {
            // ARC ("animalrightscalendar.com") events mirror ARC's own listing
            // exactly, so a "More info" link back to ARC would just be a
            // duplicate of what this page already shows - it's suppressed for
            // regular visitors. Site admins still see where the event came
            // from (and can still reach the original), since that's useful
            // for moderation even though it'd be redundant for everyone else.
            const isArcImport = () =>
              (currentEvent().externalSourceName ?? "")
                .toLowerCase()
                .includes("animalrightscalendar");
            const sourceLabel = () => {
              const ev = currentEvent();
              if (ev.source === "external_import") {
                return isArcImport()
                  ? "Animal Rights Calendar (animalrightscalendar.com)"
                  : (ev.externalSourceName ?? t("Externe kalender", "External calendar"));
              }
              if (ev.source === "signal_import") {
                return t("Signal-import", "Signal import");
              }
              return null;
            };
            const mapEmbedSrc = () => {
              const ev = currentEvent();
              if (ev.locationLat != null && ev.locationLng != null) {
                return `https://www.google.com/maps?q=${ev.locationLat},${ev.locationLng}&z=15&output=embed`;
              }
              const parts = [
                ev.locationDescription,
                ev.locationStreet,
                ev.locationHouseNumber,
                ev.locationPostcode,
              ].filter((part): part is string => Boolean(part));
              return parts.length > 0
                ? `https://www.google.com/maps?q=${encodeURIComponent(parts.join(" "))}&output=embed`
                : null;
            };

            return (
              <>
                <Title>
                  {pickLocalized(currentEvent().titleNl, currentEvent().titleEn, lang())} — Vegan
                  Activists NL
                </Title>

                <div class="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <Show when={currentEvent().flyerPreviewImageId}>
                    {(id) => (
                      <img
                        // A JSON-API string here, not a domain Sha256 - the server already vetted it.
                        src={imageUrl(id() as Sha256)}
                        alt=""
                        class="max-h-96 w-full object-cover"
                      />
                    )}
                  </Show>

                  <div class="p-6 sm:p-8">
                    <div class="mb-4 flex items-start justify-between gap-3">
                      <h1 class="text-2xl font-semibold text-zinc-900">
                        {pickLocalized(currentEvent().titleNl, currentEvent().titleEn, lang())}
                      </h1>
                      <Show when={currentEvent().status !== "visible"}>
                        <span class="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                          {currentEvent().status === "cancelled"
                            ? t("Geannuleerd", "Cancelled")
                            : currentEvent().status === "draft"
                              ? t("Concept", "Draft")
                              : t("Verborgen", "Hidden")}
                          {currentEvent().statusReason ? ` — ${currentEvent().statusReason}` : ""}
                        </span>
                      </Show>
                    </div>

                    <div class="mb-6 flex flex-col gap-2 text-zinc-700">
                      <div class="flex items-center gap-2">
                        <CalendarIcon class="h-5 w-5 shrink-0 text-emerald-500" />
                        <span>
                          {formatEventDate(
                            currentEvent().startAt,
                            lang(),
                            currentEvent().startTimeKnown,
                          )}
                        </span>
                      </div>
                      <div class="flex items-start gap-2">
                        <MapPinIcon class="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                        <span>
                          {currentEvent().locationDescription}
                          <Show when={currentEvent().locationStreet}>
                            <>
                              <br />
                              {currentEvent().locationStreet} {currentEvent().locationHouseNumber},{" "}
                              {currentEvent().locationPostcode}
                            </>
                          </Show>
                          {/* The embedded map below already shows exactly
                              where this is - only offer an outbound link
                              when there's no embed to look at instead. */}
                          <Show when={currentEvent().mapUrl && !mapEmbedSrc()}>
                            {" "}
                            <a
                              href={currentEvent().mapUrl!}
                              class="text-emerald-700 underline hover:text-emerald-800"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("Bekijk op kaart", "View on map")}
                            </a>
                          </Show>
                        </span>
                      </div>
                      <Show when={currentEvent().organizerName}>
                        <div class="flex items-center gap-2">
                          <BuildingIcon class="h-5 w-5 shrink-0 text-emerald-500" />
                          <span>
                            {t("Georganiseerd door", "Organized by")} {currentEvent().organizerName}
                          </span>
                        </div>
                      </Show>
                    </div>

                    <Show when={mapEmbedSrc()}>
                      {(src) => (
                        <div class="mb-6 overflow-hidden rounded-xl border border-zinc-200">
                          <iframe
                            title={t("Kaart", "Map")}
                            src={src()}
                            class="h-64 w-full"
                            style={{ border: "0" }}
                            loading="lazy"
                            referrerpolicy="no-referrer-when-downgrade"
                          />
                        </div>
                      )}
                    </Show>

                    <p class="mb-6 whitespace-pre-wrap text-zinc-800">
                      <LinkifiedText
                        text={pickLocalized(
                          currentEvent().descriptionNl,
                          currentEvent().descriptionEn,
                          lang(),
                        )}
                      />
                    </p>

                    <div class="flex flex-wrap gap-3">
                      <Show when={currentEvent().registrationUrl}>
                        <a
                          href={currentEvent().registrationUrl!}
                          class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("Aanmelden", "Register")}
                        </a>
                      </Show>
                      <Show when={currentEvent().externalEventUrl && !isArcImport()}>
                        <a
                          href={currentEvent().externalEventUrl!}
                          class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold transition hover:bg-zinc-50"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("Meer info", "More info")}
                        </a>
                      </Show>
                    </div>

                    <Show when={currentEvent().viewerIsSiteAdmin && sourceLabel()}>
                      {(label) => (
                        <div class="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                          <span>
                            {t("Alleen zichtbaar voor beheerders — bron:", "Admin-only — source:")}{" "}
                            <strong>{label()}</strong>
                          </span>
                          <Show when={currentEvent().externalEventUrl}>
                            <a
                              href={currentEvent().externalEventUrl!}
                              class="underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t("Origineel bekijken", "View original")}
                            </a>
                          </Show>
                        </div>
                      )}
                    </Show>

                    <Show when={actionError()}>
                      {(message) => <p class="mt-4 text-red-700">{message()}</p>}
                    </Show>

                    <Show when={canModerate()}>
                      <div class="mt-8 flex flex-wrap gap-3 border-t border-zinc-200 pt-6">
                        <a
                          href={`/${lang()}/events/${currentEvent().slug}/edit`}
                          class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold transition hover:bg-zinc-50"
                        >
                          {t("Bewerken", "Edit")}
                        </a>
                        <Show
                          when={currentEvent().status === "visible"}
                          fallback={
                            <button
                              type="button"
                              class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold transition hover:bg-zinc-50"
                              onClick={() => onSetStatus("visible")}
                            >
                              {currentEvent().status === "draft"
                                ? t("Publiceren", "Publish")
                                : t("Tonen", "Show")}
                            </button>
                          }
                        >
                          <button
                            type="button"
                            class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold transition hover:bg-zinc-50"
                            onClick={() => onSetStatus("hidden")}
                          >
                            {t("Verbergen", "Hide")}
                          </button>
                        </Show>
                        <Show when={currentEvent().status !== "cancelled"}>
                          <button
                            type="button"
                            class="rounded-lg border border-zinc-300 px-4 py-2 font-semibold transition hover:bg-zinc-50"
                            onClick={() => onSetStatus("cancelled")}
                          >
                            {t("Evenement annuleren", "Cancel event")}
                          </button>
                        </Show>
                        <button
                          type="button"
                          class="rounded-lg border border-red-300 px-4 py-2 font-semibold text-red-700 transition hover:bg-red-50"
                          onClick={onDelete}
                        >
                          {t("Verwijderen", "Delete")}
                        </button>
                      </div>
                    </Show>
                  </div>
                </div>
              </>
            );
          }}
        </Show>
      </Show>
    </main>
  );
}
