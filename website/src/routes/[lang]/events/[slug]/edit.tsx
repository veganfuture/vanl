import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, Show } from "solid-js";
import {
  EventForm,
  eventFormErrorMessages,
  eventFormValuesFromEvent,
  toEventRequestBody,
  type EventFormValues,
} from "~/components/EventForm";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch, describeApiError } from "~/lib/api-fetch";
import { resolveLang } from "~/lib/i18n";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { GetEventBySlugResponseSchema } from "~/routes/api/events/by-slug/[slug].schema";
import { EventRequestSchema } from "~/routes/api/events/event.schema";
import { UpdateEventResponseSchema } from "~/routes/api/events/[id].schema";
import { GetPlaceResponseSchema } from "~/routes/api/places/[id].schema";

export default function EditEventPage() {
  const params = useParams<{ lang: string; slug: string }>();
  const lang = () => resolveLang(params.lang);
  const t = (nl: string, en: string) => (lang() === "nl" ? nl : en);

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
      return {
        ok: false as const,
        message: t(
          "Er is iets misgegaan. Probeer het opnieuw.",
          "Something went wrong. Please try again.",
        ),
      };
    }
    const result = await apiFetch(`/api/events/${currentEvent.id}`, {
      method: "PATCH",
      request: EventRequestSchema,
      body: toEventRequestBody(values),
      response: UpdateEventResponseSchema,
    });
    return result.match(
      (updated) => {
        window.location.href = `/${lang()}/events/${updated.slug}`;
        return { ok: true as const };
      },
      (error) => ({
        ok: false as const,
        message: describeApiError(error, eventFormErrorMessages(lang())),
      }),
    );
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Evenement bewerken", "Edit event")} — Vegan Activists NL</Title>
      <h1 class="mb-6 text-2xl font-semibold">{t("Evenement bewerken", "Edit event")}</h1>

      <Show
        when={!event.loading && !me.loading && !placeLabel.loading}
        fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}
      >
        <Show
          when={event()}
          fallback={
            <p class="text-zinc-600">{t("Evenement niet gevonden.", "Event not found.")}</p>
          }
        >
          {(currentEvent) => (
            <Show
              when={canEdit()}
              fallback={
                <p class="text-zinc-600">
                  {t(
                    "Je hebt geen toestemming om dit evenement te bewerken.",
                    "You don't have permission to edit this event.",
                  )}
                </p>
              }
            >
              <EventForm
                lang={lang()}
                initial={eventFormValuesFromEvent(currentEvent(), placeLabel() ?? "")}
                submitLabel={t("Wijzigingen opslaan", "Save changes")}
                submittingLabel={t("Bezig met opslaan…", "Saving…")}
                onSubmit={onSubmit}
              />
            </Show>
          )}
        </Show>
      </Show>
    </main>
  );
}
