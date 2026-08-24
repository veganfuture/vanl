import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, Show } from "solid-js";
import {
  OrganizationForm,
  organizationFormErrorMessages,
  organizationFormValuesFromOrg,
  toOrganizationRequestBody,
  type OrganizationFormValues,
} from "~/components/OrganizationForm";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch, describeApiError } from "~/lib/api-fetch";
import { useLang } from "~/lib/i18n";
import { uploadImage } from "~/lib/upload-image";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { GetOrganizationBySlugResponseSchema } from "~/routes/api/organizations/by-slug/[slug].schema";
import { MyOrganizationsResponseSchema } from "~/routes/api/organizations/mine.schema";
import { OrganizationRequestSchema } from "~/routes/api/organizations/organization.schema";
import { UpdateOrganizationResponseSchema } from "~/routes/api/organizations/[id].schema";

export default function EditOrganizationPage() {
  const params = useParams<{ slug: string }>();
  const { lang, t } = useLang();

  const [org] = createResource(
    () => params.slug ?? "",
    async (slug) => {
      const result = await apiFetch(`/api/organizations/by-slug/${encodeURIComponent(slug)}`, {
        response: GetOrganizationBySlugResponseSchema,
      });
      return result.match(
        (data) => data.organization,
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

  const [myOrgs] = createResource(async () => {
    const result = await apiFetch("/api/organizations/mine", {
      response: MyOrganizationsResponseSchema,
    });
    return result.match(
      (data) => data.organizations,
      () => [],
    );
  });

  // Client-side gate only - the server (OrganizationService.requireOrgAdmin)
  // is the real authorization boundary. listMyOrganizations only returns
  // orgs actingUser belongs to at all (either role), so this over-shows the
  // form to org_editors too; they'll correctly get "forbidden" on save.
  const canEdit = () => {
    const currentUser = me();
    const currentOrg = org();
    if (!currentUser || !currentOrg) return false;
    if (currentUser.isSiteAdmin) return true;
    return (myOrgs() ?? []).some((myOrg) => myOrg.id === currentOrg.id);
  };

  async function onSubmit(values: OrganizationFormValues, logoFile: File | null) {
    const currentOrg = org();
    if (!currentOrg) {
      return {
        ok: false as const,
        message: t(
          "Er is iets misgegaan. Probeer het opnieuw.",
          "Something went wrong. Please try again.",
        ),
      };
    }
    const result = await apiFetch(`/api/organizations/${currentOrg.id}`, {
      method: "PATCH",
      request: OrganizationRequestSchema,
      body: toOrganizationRequestBody(values),
      response: UpdateOrganizationResponseSchema,
    });
    return result.match(
      async (updated) => {
        // PATCH is safe to retry (unlike the create flow's POST), so on a
        // failed logo upload just report it instead of navigating away -
        // the rest of the changes are already saved.
        if (logoFile && !(await uploadImage(`/api/organizations/${updated.id}/logo`, logoFile))) {
          return {
            ok: false as const,
            message: t(
              "Wijzigingen opgeslagen, maar het logo kon niet worden geüpload. Probeer het opnieuw.",
              "Changes saved, but the logo failed to upload. Please try again.",
            ),
          };
        }
        window.location.href = `/${lang()}/organizations/${updated.slug}`;
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
      <Title>{t("Organisatie bewerken", "Edit organization")} — Vegan Activists NL</Title>
      <h1 class="mb-6 text-2xl font-semibold">{t("Organisatie bewerken", "Edit organization")}</h1>

      <Show
        when={!org.loading && !me.loading && !myOrgs.loading}
        fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}
      >
        <Show
          when={org()}
          fallback={
            <p class="text-zinc-600">
              {t("Organisatie niet gevonden.", "Organization not found.")}
            </p>
          }
        >
          {(currentOrg) => (
            <Show
              when={canEdit()}
              fallback={
                <p class="text-zinc-600">
                  {t(
                    "Je hebt geen toestemming om deze organisatie te bewerken.",
                    "You don't have permission to edit this organization.",
                  )}
                </p>
              }
            >
              <OrganizationForm
                lang={lang()}
                initial={organizationFormValuesFromOrg(currentOrg())}
                submitLabel={t("Wijzigingen opslaan", "Save changes")}
                submittingLabel={t("Bezig met opslaan…", "Saving…")}
                currentLogoImageId={currentOrg().logoThumbnailImageId}
                onSubmit={onSubmit}
              />
            </Show>
          )}
        </Show>
      </Show>
    </main>
  );
}
