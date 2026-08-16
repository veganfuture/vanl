import { Title } from "@solidjs/meta";
import { createResource, For, Show } from "solid-js";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch } from "~/lib/api-fetch";
import { useLang } from "~/lib/i18n";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { MyOrganizationsResponseSchema } from "~/routes/api/organizations/mine.schema";

export default function MyOrganizationsPage() {
  const { lang, t } = useLang();

  const [me] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  const [organizations] = createResource(me, async (currentUser) => {
    if (!currentUser) {
      return [];
    }
    const result = await apiFetch("/api/organizations/mine", {
      response: MyOrganizationsResponseSchema,
    });
    return result.match(
      (data) => data.organizations,
      () => [],
    );
  });

  return (
    <main class="mx-auto max-w-3xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Mijn organisaties", "My organizations")} — Vegan Activists NL</Title>
      <div class="mb-6 flex items-center justify-between">
        <h1 class="text-2xl font-semibold">{t("Mijn organisaties", "My organizations")}</h1>
        <a
          href={`/${lang()}/organizations/new`}
          class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          {t("Organisatie aanmaken", "Create organization")}
        </a>
      </div>

      <Show when={!me.loading} fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}>
        <Show
          when={me()}
          fallback={
            <p class="text-zinc-600">
              {t("Je moet ", "You need to ")}
              <a href={`/${lang()}/login`} class="underline">
                {t("inloggen", "log in")}
              </a>
              {t(" om je organisaties te zien.", " to see your organizations.")}
            </p>
          }
        >
          <Show
            when={!organizations.loading}
            fallback={
              <p class="text-zinc-600">{t("Organisaties laden…", "Loading organizations…")}</p>
            }
          >
            <Show
              when={organizations() && organizations()!.length > 0}
              fallback={
                <p class="text-zinc-600">
                  {t(
                    "Je bent nog geen lid van een organisatie.",
                    "You're not a member of any organization yet.",
                  )}
                </p>
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
        </Show>
      </Show>
    </main>
  );
}
