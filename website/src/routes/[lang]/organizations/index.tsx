import { Title } from "@solidjs/meta";
import { createResource, For, Show } from "solid-js";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch } from "~/lib/api-fetch";
import { useLang } from "~/lib/i18n";
import { ListOrganizationsResponseSchema } from "~/routes/api/organizations/index.schema";

export default function OrganizationsListPage() {
  const { lang, t } = useLang();

  const [organizations] = createResource(async () => {
    const result = await apiFetch("/api/organizations", {
      response: ListOrganizationsResponseSchema,
    });
    return result.match(
      (data) => data.organizations,
      () => [],
    );
  });

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Organisaties", "Organizations")} — Vegan Activists NL</Title>
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{t("Organisaties", "Organizations")}</h1>
        <a
          href={`/${lang()}/organizations/new`}
          class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          {t("Organisatie aanmaken", "Create organization")}
        </a>
      </div>

      <Show
        when={!organizations.loading}
        fallback={<p class="text-zinc-600">{t("Organisaties laden…", "Loading organizations…")}</p>}
      >
        <Show
          when={organizations() && organizations()!.length > 0}
          fallback={
            <p class="text-zinc-600">{t("Nog geen organisaties.", "No organizations yet.")}</p>
          }
        >
          <ul class="space-y-4">
            <For each={organizations()}>
              {(org) => (
                <li class="rounded-lg border border-zinc-200 p-4">
                  <a
                    href={`/${lang()}/organizations/${org.slug}`}
                    class="text-lg font-semibold hover:underline"
                  >
                    {org.name}
                  </a>
                  <Show when={org.description}>
                    <p class="text-sm text-zinc-600">{org.description}</p>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </main>
  );
}
