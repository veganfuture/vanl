import { useParams } from "@solidjs/router";
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
import { resolveLang } from "~/lib/i18n";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { EventRequestSchema } from "~/routes/api/events/event.schema";
import { CreateEventResponseSchema } from "~/routes/api/events/index.schema";

export default function NewEventPage() {
  const params = useParams<{ lang: string }>();
  const lang = () => resolveLang(params.lang);
  const t = (nl: string, en: string) => (lang() === "nl" ? nl : en);

  const [me] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  async function onSubmit(values: EventFormValues) {
    const result = await apiFetch("/api/events", {
      request: EventRequestSchema,
      body: toEventRequestBody(values),
      response: CreateEventResponseSchema,
    });
    return result.match(
      (created) => {
        window.location.href = `/${lang()}/events/${created.slug}`;
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
            onSubmit={onSubmit}
          />
        </Show>
      </Show>
    </main>
  );
}
