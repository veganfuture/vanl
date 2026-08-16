import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, createSignal, Show } from "solid-js";
import { LinkifiedText } from "~/components/LinkifiedText";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch, describeApiError, type ErrorMessagesFor } from "~/lib/api-fetch";
import { pickLocalized, useLang } from "~/lib/i18n";
import { imageUrl } from "~/lib/image-url";
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

export default function EventDetailPage() {
  const params = useParams<{ slug: string }>();
  const { lang, t } = useLang();

  const locationKindLabels: Record<string, string> = {
    precise_address: t("Exact adres", "Precise address"),
    meeting_point_city_only: t("Verzamelpunt", "Meeting point"),
  };

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

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(lang() === "nl" ? "nl-NL" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

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
        cancelReason:
          status === "cancelled" ? t("Geannuleerd door moderator", "Cancelled by moderator") : null,
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
      <Show when={!event.loading} fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}>
        <Show
          when={event()}
          fallback={
            <p class="text-zinc-600">{t("Evenement niet gevonden.", "Event not found.")}</p>
          }
        >
          {(currentEvent) => (
            <>
              <Title>
                {pickLocalized(currentEvent().titleNl, currentEvent().titleEn, lang())} — Vegan
                Activists NL
              </Title>
              <h1 class="mb-2 text-2xl font-semibold">
                {pickLocalized(currentEvent().titleNl, currentEvent().titleEn, lang())}
              </h1>
              <Show when={currentEvent().flyerPreviewImageId}>
                {(id) => (
                  <img
                    src={imageUrl(id())}
                    alt=""
                    class="mb-4 w-full max-w-md rounded-lg border border-zinc-200"
                  />
                )}
              </Show>
              <Show when={currentEvent().status !== "visible"}>
                <p class="mb-4 inline-block rounded bg-amber-100 px-2 py-1 text-sm text-amber-800">
                  {currentEvent().status === "cancelled"
                    ? t("Geannuleerd", "Cancelled")
                    : t("Verborgen", "Hidden")}
                  {currentEvent().cancelReason ? ` — ${currentEvent().cancelReason}` : ""}
                </p>
              </Show>
              <p class="mb-1 text-zinc-600">{formatDate(currentEvent().startAt)}</p>
              <p class="mb-4 text-zinc-600">
                {locationKindLabels[currentEvent().locationKind]} —{" "}
                {currentEvent().locationDescription}
                <Show when={currentEvent().locationStreet}>
                  <>
                    <br />
                    {currentEvent().locationStreet} {currentEvent().locationHouseNumber},{" "}
                    {currentEvent().locationPostcode}
                  </>
                </Show>
              </p>
              <Show when={currentEvent().organizerName}>
                <p class="mb-4 text-zinc-600">
                  {t("Georganiseerd door", "Organized by")} {currentEvent().organizerName}
                </p>
              </Show>
              <p class="mb-6 whitespace-pre-wrap">
                <LinkifiedText
                  text={pickLocalized(
                    currentEvent().descriptionNl,
                    currentEvent().descriptionEn,
                    lang(),
                  )}
                />
              </p>

              <Show when={currentEvent().mapUrl}>
                <p class="mb-2">
                  <a
                    href={currentEvent().mapUrl!}
                    class="underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("Bekijk op kaart", "View on map")}
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
                    {t("Aanmelden", "Register")}
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
                    {t("Meer info", "More info")}
                  </a>
                </p>
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
                        {t("Tonen", "Show")}
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
            </>
          )}
        </Show>
      </Show>
    </main>
  );
}
