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
import { useLang } from "~/lib/i18n";
import { uploadImage } from "~/lib/upload-image";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { GetEventBySlugResponseSchema } from "~/routes/api/events/by-slug/[slug].schema";
import { EventRequestSchema } from "~/routes/api/events/event.schema";
import { UpdateEventResponseSchema } from "~/routes/api/events/[id].schema";
import { GetPlaceResponseSchema } from "~/routes/api/places/[id].schema";
import { MyOrganizationsResponseSchema } from "~/routes/api/organizations/mine.schema";

export default function EditEventPage() {
  const params = useParams<{ slug: string }>();
  const { lang, t } = useLang();

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

  const [myOrgs] = createResource(async () => {
    const result = await apiFetch("/api/organizations/mine", {
      response: MyOrganizationsResponseSchema,
    });
    return result.match(
      (data) => data.organizations,
      () => [],
    );
  });

  /**
   * Client-side gate for showing the form at all - the server
   * (EventService.loadForModification) is the real authorization boundary,
   * so this is deliberately a bit permissive: any member of the publishing
   * org sees the form (matches org_admin's actual permissions exactly;
   * org_editor sees it too even for events they didn't personally create,
   * where the server will correctly reject the save with "forbidden").
   */
  const canEdit = () => {
    const currentUser = me();
    const currentEvent = event();
    if (!currentUser || !currentEvent) return false;
    if (currentUser.isSiteAdmin) return true;
    if (currentEvent.publisherUserId && currentUser.id === currentEvent.publisherUserId)
      return true;
    if (currentEvent.publisherOrgId) {
      return (myOrgs() ?? []).some((org) => org.id === currentEvent.publisherOrgId);
    }
    return false;
  };

  async function onSubmit(values: EventFormValues, flyerFile: File | null) {
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
      async (updated) => {
        // PATCH is safe to retry (unlike the create flow's POST), so on a
        // failed flyer upload just report it instead of navigating away -
        // the rest of the changes are already saved.
        if (flyerFile && !(await uploadImage(`/api/events/${updated.id}/flyer`, flyerFile))) {
          return {
            ok: false as const,
            message: t(
              "Wijzigingen opgeslagen, maar de flyer kon niet worden geüpload. Probeer het opnieuw.",
              "Changes saved, but the flyer failed to upload. Please try again.",
            ),
          };
        }
        window.location.href = `/${lang()}/events/${updated.slug}`;
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
      <Title>{t("Evenement bewerken", "Edit event")} — Vegan Activists NL</Title>
      <h1 class="mb-6 text-2xl font-semibold">{t("Evenement bewerken", "Edit event")}</h1>

      <Show
        when={!event.loading && !me.loading && !placeLabel.loading && !myOrgs.loading}
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
                currentFlyerImageId={currentEvent().flyerThumbnailImageId}
                onSubmit={onSubmit}
              />
            </Show>
          )}
        </Show>
      </Show>
    </main>
  );
}
