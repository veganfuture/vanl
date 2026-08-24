import { Title } from "@solidjs/meta";
import { createResource, Show } from "solid-js";
import {
  OrganizationForm,
  organizationFormErrorMessages,
  emptyOrganizationFormValues,
  toOrganizationRequestBody,
  type OrganizationFormValues,
} from "~/components/OrganizationForm";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch, describeApiError } from "~/lib/api-fetch";
import { useLang } from "~/lib/i18n";
import { uploadImage } from "~/lib/upload-image";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { OrganizationRequestSchema } from "~/routes/api/organizations/organization.schema";
import { CreateOrganizationResponseSchema } from "~/routes/api/organizations/index.schema";

export default function NewOrganizationPage() {
  const { lang, t } = useLang();

  const [me] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  async function onSubmit(values: OrganizationFormValues, logoFile: File | null) {
    const result = await apiFetch("/api/organizations", {
      request: OrganizationRequestSchema,
      body: toOrganizationRequestBody(values),
      response: CreateOrganizationResponseSchema,
    });
    return result.match(
      async (created) => {
        // The logo upload needs the org's id, so it can only happen after
        // creation succeeds - if it fails, land on the edit page (rather
        // than the detail page) so retrying is one click away instead of a
        // dead end.
        const uploaded = logoFile
          ? await uploadImage(`/api/organizations/${created.id}/logo`, logoFile)
          : true;
        window.location.href = uploaded
          ? `/${lang()}/organizations/${created.slug}`
          : `/${lang()}/organizations/${created.slug}/edit`;
        return { ok: true as const };
      },
      (error) =>
        Promise.resolve({
          ok: false as const,
          message: describeApiError(error, organizationFormErrorMessages(lang())),
        }),
    );
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Organisatie aanmaken", "Create organization")} — Vegan Activists NL</Title>
      <h1 class="mb-6 text-2xl font-semibold">
        {t("Organisatie aanmaken", "Create organization")}
      </h1>

      <Show when={!me.loading} fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}>
        <Show
          when={me()}
          fallback={
            <p class="text-zinc-600">
              {t("Je moet ", "You need to ")}
              <a href={`/${lang()}/login`} class="underline">
                {t("inloggen", "log in")}
              </a>
              {t(" om een organisatie aan te maken.", " to create an organization.")}
            </p>
          }
        >
          <p class="mb-4 text-sm text-zinc-600">
            {t(
              "Je wordt automatisch de beheerder van deze organisatie.",
              "You'll automatically become this organization's admin.",
            )}
          </p>
          <OrganizationForm
            lang={lang()}
            initial={emptyOrganizationFormValues()}
            submitLabel={t("Organisatie aanmaken", "Create organization")}
            submittingLabel={t("Bezig met aanmaken…", "Creating…")}
            onSubmit={onSubmit}
          />
        </Show>
      </Show>
    </main>
  );
}
