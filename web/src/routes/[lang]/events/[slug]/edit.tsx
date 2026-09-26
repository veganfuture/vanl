import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, createSignal, For, Show } from "solid-js";
import {
  EventForm,
  eventFormErrorMessages,
  eventFormValuesFromEvent,
  toEventRequestBody,
  type EventFormValues,
} from "~/components/EventForm";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch, describeApiError, type ErrorMessagesFor } from "~/lib/api-fetch";
import { makeT, useLang, type Locale } from "~/lib/i18n";
import { useMe } from "~/lib/queries";
import { uploadImage } from "~/lib/upload-image";
import { GetEventBySlugResponseSchema } from "~/routes/api/events/by-slug/[slug].schema";
import { EventRequestSchema } from "~/routes/api/events/event.schema";
import { UpdateEventResponseSchema } from "~/routes/api/events/[id].schema";
import {
  SetEventOrgRequestSchema,
  EventOrgResponseSchema,
} from "~/routes/api/events/[id]/org.schema";
import { GetPlaceResponseSchema } from "~/routes/api/places/[id].schema";
import { ListOrganizationsResponseSchema } from "~/routes/api/organizations/index.schema";
import { MyOrganizationsResponseSchema } from "~/routes/api/organizations/mine.schema";

type OrgLinkError =
  | "unauthorized"
  | "not_found"
  | "org_not_found"
  | "forbidden"
  | "already_in_org"
  | "not_in_org"
  | "validation"
  | "internal_error";

function orgLinkErrorMessages(lang: Locale): ErrorMessagesFor<{ error: OrgLinkError }> {
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
    org_not_found: {
      message: t("Deze organisatie bestaat niet meer.", "That organization no longer exists."),
      isWarn: true,
    },
    forbidden: {
      message: t(
        "Je hebt geen toestemming om dat te doen.",
        "You don't have permission to do that.",
      ),
      isWarn: true,
    },
    already_in_org: {
      message: t(
        "Dit evenement hoort al bij deze organisatie.",
        "This event already belongs to that organization.",
      ),
      isWarn: true,
    },
    not_in_org: {
      message: t(
        "Dit evenement hoort niet bij een organisatie.",
        "This event doesn't belong to an organization.",
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

export default function EditEventPage() {
  const params = useParams<{ slug: string }>();
  const { lang, t } = useLang();

  const [event, { refetch: refetchEvent }] = createResource(
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

  const me = useMe();

  // site_admin may attach an event to any org, so it needs the full listing -
  // everyone else can only ever attach to an org they belong to (org_editor
  // or org_admin - see event_service.ts's canLinkEventToOrg), same set as
  // "mine".
  const [orgOptions] = createResource(
    () => (me() === undefined ? undefined : (me()?.isSiteAdmin ?? false)),
    async (isSiteAdmin) => {
      const result = isSiteAdmin
        ? await apiFetch("/api/organizations", { response: ListOrganizationsResponseSchema })
        : await apiFetch("/api/organizations/mine", { response: MyOrganizationsResponseSchema });
      return result.match(
        (data) => data.organizations,
        () => [],
      );
    },
  );

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

  const canEdit = () => event()?.canEdit ?? false;

  const [selectedOrgId, setSelectedOrgId] = createSignal("");
  const [orgLinkError, setOrgLinkError] = createSignal<string | null>(null);
  const [orgLinkBusy, setOrgLinkBusy] = createSignal(false);

  async function onAddToOrg() {
    const currentEvent = event();
    if (!currentEvent || !selectedOrgId()) return;
    setOrgLinkError(null);
    setOrgLinkBusy(true);
    try {
      const result = await apiFetch(`/api/events/${currentEvent.id}/org`, {
        method: "POST",
        request: SetEventOrgRequestSchema,
        body: { orgId: selectedOrgId() },
        response: EventOrgResponseSchema,
      });
      result.match(
        () => {
          setSelectedOrgId("");
          refetchEvent();
        },
        (error) => setOrgLinkError(describeApiError(error, orgLinkErrorMessages(lang()))),
      );
    } finally {
      setOrgLinkBusy(false);
    }
  }

  async function onRemoveFromOrg() {
    const currentEvent = event();
    if (!currentEvent) return;
    if (
      !window.confirm(
        t(
          "Dit evenement uit de organisatie verwijderen?",
          "Remove this event from the organization?",
        ),
      )
    ) {
      return;
    }
    setOrgLinkError(null);
    setOrgLinkBusy(true);
    try {
      const result = await apiFetch(`/api/events/${currentEvent.id}/org`, {
        method: "DELETE",
        response: EventOrgResponseSchema,
      });
      result.match(
        () => refetchEvent(),
        (error) => setOrgLinkError(describeApiError(error, orgLinkErrorMessages(lang()))),
      );
    } finally {
      setOrgLinkBusy(false);
    }
  }

  async function onSubmit(valuesList: EventFormValues[], flyerFile: File | null) {
    const [values] = valuesList;
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
        window.location.href = `/${lang()}/events/${updated.slug}?toast=event_published`;
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
        when={!event.loading && !placeLabel.loading}
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

              <Show when={currentEvent().canManageOrgLink}>
                <section class="mt-8 border-t border-zinc-200 pt-6">
                  <h2 class="mb-3 text-lg font-semibold">{t("Organisatie", "Organization")}</h2>

                  <Show when={orgLinkError()}>
                    {(message) => <p class="mb-3 text-red-700">{message()}</p>}
                  </Show>

                  <Show
                    when={currentEvent().publisherOrgId}
                    fallback={
                      <div class="flex flex-wrap items-end gap-3">
                        <label class="block">
                          <span class="block text-sm font-medium">
                            {t("Toevoegen aan organisatie", "Add to organization")}
                          </span>
                          <select
                            class="mt-1 block rounded border border-zinc-300 px-3 py-2"
                            value={selectedOrgId()}
                            onChange={(e) => setSelectedOrgId(e.currentTarget.value)}
                          >
                            <option value="">
                              {t("Kies een organisatie…", "Choose an organization…")}
                            </option>
                            <For each={orgOptions()}>
                              {(org) => <option value={org.id}>{org.name}</option>}
                            </For>
                          </select>
                        </label>
                        <button
                          type="button"
                          disabled={orgLinkBusy() || !selectedOrgId()}
                          onClick={onAddToOrg}
                          class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {t("Toevoegen", "Add")}
                        </button>
                      </div>
                    }
                  >
                    {(orgId) => (
                      <div class="flex items-center justify-between rounded-lg border border-zinc-200 p-3">
                        <p>
                          {t("Hoort bij", "Belongs to")}{" "}
                          <span class="font-medium">
                            {orgOptions()?.find((org) => org.id === orgId())?.name ?? orgId()}
                          </span>
                        </p>
                        <button
                          type="button"
                          disabled={orgLinkBusy()}
                          onClick={onRemoveFromOrg}
                          class="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                        >
                          {t("Verwijderen uit organisatie", "Remove from organization")}
                        </button>
                      </div>
                    )}
                  </Show>
                </section>
              </Show>
            </Show>
          )}
        </Show>
      </Show>
    </main>
  );
}
