import { Title } from "@solidjs/meta";
import { createResource, Show } from "solid-js";
import {
  EventForm,
  eventFormErrorMessages,
  emptyEventFormValues,
  toEventRequestBody,
  type EventFormValues,
} from "~/components/EventForm";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch, describeApiError } from "~/lib/api-fetch";
import { useLang } from "~/lib/i18n";
import { uploadImage } from "~/lib/upload-image";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { EventRequestSchema } from "~/routes/api/events/event.schema";
import { CreateEventResponseSchema } from "~/routes/api/events/index.schema";
import { MyOrganizationsResponseSchema } from "~/routes/api/organizations/mine.schema";

export default function NewEventPage() {
  const { lang, t } = useLang();

  const [me] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  const [myOrgs] = createResource(async () => {
    const result = await apiFetch("/api/organizations/mine", {
      response: MyOrganizationsResponseSchema,
    });
    return result.match(
      (data) => data.organizations,
      () => [],
    );
  });

  async function onSubmit(values: EventFormValues, flyerFile: File | null) {
    const result = await apiFetch("/api/events", {
      request: EventRequestSchema,
      body: toEventRequestBody(values),
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
          ? `/${lang()}/events/${created.slug}`
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
      <Title>{t("Evenement aanmaken", "Create event")} — Vegan Activists NL</Title>
      <h1 class="mb-6 text-2xl font-semibold">{t("Evenement aanmaken", "Create event")}</h1>

      <Show when={!me.loading} fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}>
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
          <EventForm
            lang={lang()}
            initial={emptyEventFormValues()}
            submitLabel={t("Evenement aanmaken", "Create event")}
            submittingLabel={t("Bezig met aanmaken…", "Creating…")}
            requireFutureStart
            orgs={myOrgs()?.map((org) => ({ id: org.id, name: org.name }))}
            onSubmit={onSubmit}
          />
        </Show>
      </Show>
    </main>
  );
}
