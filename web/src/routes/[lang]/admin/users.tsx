import { Title } from "@solidjs/meta";
import { createResource, For, Show } from "solid-js";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch } from "~/lib/api-fetch";
import { useLang } from "~/lib/i18n";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { ListAdminUsersResponseSchema } from "~/routes/api/admin/users.schema";

export default function AdminUsersPage() {
  const { lang, t } = useLang();

  const roleLabels: Record<string, string> = {
    org_admin: t("Beheerder", "Admin"),
    org_editor: t("Redacteur", "Editor"),
  };

  function formatDate(iso: string | null): string {
    if (!iso) {
      return t("Nooit", "Never");
    }
    return new Date(iso).toLocaleString(lang() === "nl" ? "nl-NL" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  const [me] = createResource(async () => {
    const result = await apiFetch("/api/auth/me", { response: MeResponseSchema });
    return result.match(
      (data) => data.user,
      () => null,
    );
  });

  const [users] = createResource(me, async (currentUser) => {
    if (!currentUser?.isSiteAdmin) {
      return [];
    }
    const result = await apiFetch("/api/admin/users", { response: ListAdminUsersResponseSchema });
    return result.match(
      (data) => ("users" in data ? data.users : []),
      () => [],
    );
  });

  return (
    <main class="mx-auto max-w-4xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Title>{t("Gebruikers", "Users")} — Vegan Activists NL</Title>
      <h1 class="mb-6 text-2xl font-semibold">{t("Gebruikers", "Users")}</h1>

      <Show when={!me.loading} fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}>
        <Show
          when={me()}
          fallback={
            <p class="text-zinc-600">
              {t("Je moet ", "You need to ")}
              <a href={`/${lang()}/login`} class="underline">
                {t("inloggen", "log in")}
              </a>
              {t(" om deze pagina te zien.", " to see this page.")}
            </p>
          }
        >
          <Show
            when={me()?.isSiteAdmin}
            fallback={
              <p class="text-zinc-600">
                {t(
                  "Je hebt geen toestemming om deze pagina te bekijken.",
                  "You don't have permission to view this page.",
                )}
              </p>
            }
          >
            <Show
              when={!users.loading}
              fallback={<p class="text-zinc-600">{t("Gebruikers laden…", "Loading users…")}</p>}
            >
              <div class="overflow-x-auto rounded-lg border border-zinc-200">
                <table class="w-full text-left text-sm">
                  <thead class="border-b border-zinc-200 bg-zinc-50">
                    <tr>
                      <th class="px-4 py-2 font-semibold">{t("Gebruikersnaam", "Account name")}</th>
                      <th class="px-4 py-2 font-semibold">{t("Laatst ingelogd", "Last login")}</th>
                      <th class="px-4 py-2 font-semibold">{t("Organisaties", "Organizations")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={users()}>
                      {(user) => (
                        <tr class="border-b border-zinc-100 last:border-0">
                          <td class="px-4 py-2">@{user.accountName}</td>
                          <td class="px-4 py-2">{formatDate(user.lastLoginAt)}</td>
                          <td class="px-4 py-2">
                            <Show
                              when={user.organizations.length > 0}
                              fallback={<span class="text-zinc-400">—</span>}
                            >
                              <ul class="space-y-0.5">
                                <For each={user.organizations}>
                                  {(membership) => (
                                    <li>
                                      {membership.orgName}{" "}
                                      <span class="text-zinc-500">
                                        ({roleLabels[membership.role] ?? membership.role})
                                      </span>
                                    </li>
                                  )}
                                </For>
                              </ul>
                            </Show>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>
    </main>
  );
}
