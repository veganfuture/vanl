import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, createSignal, For, Show } from "solid-js";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch, describeApiError, type ErrorMessagesFor } from "~/lib/api-fetch";
import { makeT, useLang, type Locale } from "~/lib/i18n";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import { GetOrganizationBySlugResponseSchema } from "~/routes/api/organizations/by-slug/[slug].schema";
import {
  AddMemberRequestSchema,
  UpdateMemberRoleRequestSchema,
} from "~/routes/api/organizations/organization.schema";
import {
  AddMemberResponseSchema,
  ListMembersResponseSchema,
} from "~/routes/api/organizations/[id]/members.schema";
import {
  RemoveMemberResponseSchema,
  UpdateMemberRoleResponseSchema,
} from "~/routes/api/organizations/[id]/members/[userId].schema";

type MembershipAction =
  | "unauthorized"
  | "org_not_found"
  | "account_not_found"
  | "already_member"
  | "member_not_found"
  | "forbidden"
  | "sole_admin"
  | "validation"
  | "internal_error";

function membershipActionErrorMessages(
  lang: Locale,
): ErrorMessagesFor<{ error: MembershipAction }> {
  const t = makeT(lang);
  return {
    unauthorized: {
      message: t("Je moet inloggen om dat te doen.", "You need to log in to do that."),
      isWarn: true,
    },
    org_not_found: {
      message: t("Deze organisatie bestaat niet meer.", "That organization no longer exists."),
      isWarn: true,
    },
    account_not_found: {
      message: t(
        "Geen account gevonden met die gebruikersnaam.",
        "No account found with that account name.",
      ),
      isWarn: true,
    },
    already_member: {
      message: t("Deze gebruiker is al lid.", "That user is already a member."),
      isWarn: true,
    },
    member_not_found: {
      message: t("Dit lid bestaat niet (meer).", "That member no longer exists."),
      isWarn: true,
    },
    forbidden: {
      message: t(
        "Je hebt geen toestemming om dat te doen.",
        "You don't have permission to do that.",
      ),
      isWarn: true,
    },
    sole_admin: {
      message: t(
        "Dit is de enige beheerder - benoem eerst iemand anders tot beheerder.",
        "This is the sole admin - promote someone else to admin first.",
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

export default function OrganizationMembersPage() {
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

  const [members, { refetch: refetchMembers }] = createResource(
    () => org()?.id,
    async (orgId) => {
      const result = await apiFetch(`/api/organizations/${orgId}/members`, {
        response: ListMembersResponseSchema,
      });
      return result.match(
        (data) => data.members,
        () => [],
      );
    },
  );

  const myRole = () => members()?.find((m) => m.userId === me()?.id)?.role ?? null;
  const canManage = () => !!me()?.isSiteAdmin || myRole() === "org_admin";

  const [actionError, setActionError] = createSignal<string | null>(null);
  const [accountName, setAccountName] = createSignal("");
  const [newRole, setNewRole] = createSignal<"org_editor" | "org_admin">("org_editor");
  const [adding, setAdding] = createSignal(false);

  async function onAddMember(submitEvent: SubmitEvent) {
    submitEvent.preventDefault();
    const currentOrg = org();
    if (!currentOrg) return;
    setActionError(null);
    setAdding(true);
    try {
      const result = await apiFetch(`/api/organizations/${currentOrg.id}/members`, {
        request: AddMemberRequestSchema,
        body: { accountName: accountName().trim(), role: newRole() },
        response: AddMemberResponseSchema,
      });
      result.match(
        () => {
          setAccountName("");
          refetchMembers();
        },
        (error) => setActionError(describeApiError(error, membershipActionErrorMessages(lang()))),
      );
    } finally {
      setAdding(false);
    }
  }

  async function onChangeRole(userId: string, role: "org_editor" | "org_admin") {
    const currentOrg = org();
    if (!currentOrg) return;
    setActionError(null);
    const result = await apiFetch(`/api/organizations/${currentOrg.id}/members/${userId}`, {
      method: "PATCH",
      request: UpdateMemberRoleRequestSchema,
      body: { role },
      response: UpdateMemberRoleResponseSchema,
    });
    result.match(
      () => refetchMembers(),
      (error) => setActionError(describeApiError(error, membershipActionErrorMessages(lang()))),
    );
  }

  async function onRemove(userId: string) {
    const currentOrg = org();
    if (!currentOrg) return;
    if (!window.confirm(t("Dit lid verwijderen?", "Remove this member?"))) return;
    setActionError(null);
    const result = await apiFetch(`/api/organizations/${currentOrg.id}/members/${userId}`, {
      method: "DELETE",
      response: RemoveMemberResponseSchema,
    });
    result.match(
      () => refetchMembers(),
      (error) => setActionError(describeApiError(error, membershipActionErrorMessages(lang()))),
    );
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Show
        when={!org.loading && !me.loading && !members.loading}
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
            <>
              <Title>
                {t("Leden van", "Members of")} {currentOrg().name} — Vegan Activists NL
              </Title>
              <h1 class="mb-6 text-2xl font-semibold">
                {t("Leden van", "Members of")} {currentOrg().name}
              </h1>

              <Show when={actionError()}>
                {(message) => <p class="mb-4 text-red-700">{message()}</p>}
              </Show>

              <ul class="mb-8 space-y-2">
                <For each={members()}>
                  {(member) => (
                    <li class="flex items-center justify-between rounded-lg border border-zinc-200 p-3">
                      <div>
                        <p class="font-medium">{member.displayName}</p>
                        <p class="text-sm text-zinc-500">@{member.accountName}</p>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-sm text-zinc-600">
                          {member.role === "org_admin"
                            ? t("Beheerder", "Admin")
                            : t("Redacteur", "Editor")}
                        </span>
                        <Show when={canManage()}>
                          <Show
                            when={member.role === "org_admin"}
                            fallback={
                              <button
                                type="button"
                                class="rounded border border-zinc-300 px-2 py-1 text-xs font-semibold transition hover:bg-zinc-50"
                                onClick={() => onChangeRole(member.userId, "org_admin")}
                              >
                                {t("Promoveren", "Promote")}
                              </button>
                            }
                          >
                            <button
                              type="button"
                              class="rounded border border-zinc-300 px-2 py-1 text-xs font-semibold transition hover:bg-zinc-50"
                              onClick={() => onChangeRole(member.userId, "org_editor")}
                            >
                              {t("Degraderen", "Demote")}
                            </button>
                          </Show>
                          <button
                            type="button"
                            class="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                            onClick={() => onRemove(member.userId)}
                          >
                            {t("Verwijderen", "Remove")}
                          </button>
                        </Show>
                      </div>
                    </li>
                  )}
                </For>
              </ul>

              <Show when={canManage()}>
                <h2 class="mb-4 text-lg font-semibold">{t("Lid toevoegen", "Add a member")}</h2>
                <form class="flex flex-wrap items-end gap-3" onSubmit={onAddMember}>
                  <label class="block">
                    <span class="block text-sm font-medium">
                      {t("Gebruikersnaam", "Account name")}
                    </span>
                    <input
                      class="mt-1 block rounded border border-zinc-300 px-3 py-2"
                      required
                      value={accountName()}
                      onInput={(e) => setAccountName(e.currentTarget.value)}
                    />
                  </label>
                  <label class="block">
                    <span class="block text-sm font-medium">{t("Rol", "Role")}</span>
                    <select
                      class="mt-1 block rounded border border-zinc-300 px-3 py-2"
                      value={newRole()}
                      onChange={(e) =>
                        setNewRole(e.currentTarget.value as "org_editor" | "org_admin")
                      }
                    >
                      <option value="org_editor">{t("Redacteur", "Editor")}</option>
                      <option value="org_admin">{t("Beheerder", "Admin")}</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={adding()}
                    class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {adding() ? t("Bezig…", "Adding…") : t("Toevoegen", "Add")}
                  </button>
                </form>
              </Show>
            </>
          )}
        </Show>
      </Show>
    </main>
  );
}
