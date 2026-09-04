import { useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { LocaleCookieSync } from "~/components/LocaleCookieSync";
import { apiFetch, describeApiError, type ErrorMessagesFor } from "~/lib/api-fetch";
import { makeT, useLang, type Locale } from "~/lib/i18n";
import { MeResponseSchema } from "~/routes/api/auth/me.schema";
import {
  GetAdminUserDetailResponseSchema,
  SetUserDisabledRequestSchema,
  SetUserDisabledResponseSchema,
} from "~/routes/api/admin/users/[id].schema";
import { ListOrganizationsResponseSchema } from "~/routes/api/organizations/index.schema";
import {
  AddMemberRequestSchema,
  UpdateMemberRoleRequestSchema,
  type MembershipJson,
} from "~/routes/api/organizations/organization.schema";
import { AddMemberResponseSchema } from "~/routes/api/organizations/[id]/members.schema";
import {
  RemoveMemberResponseSchema,
  UpdateMemberRoleResponseSchema,
} from "~/routes/api/organizations/[id]/members/[userId].schema";

type ActionErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "cannot_disable_self"
  | "org_not_found"
  | "account_not_found"
  | "already_member"
  | "member_not_found"
  | "sole_admin"
  | "validation"
  | "internal_error";

function actionErrorMessages(lang: Locale): ErrorMessagesFor<{ error: ActionErrorCode }> {
  const t = makeT(lang);
  return {
    unauthorized: {
      message: t("Je moet inloggen om dat te doen.", "You need to log in to do that."),
      isWarn: true,
    },
    forbidden: {
      message: t(
        "Je hebt geen toestemming om dat te doen.",
        "You don't have permission to do that.",
      ),
      isWarn: true,
    },
    not_found: {
      message: t("Deze gebruiker bestaat niet (meer).", "This user no longer exists."),
      isWarn: true,
    },
    cannot_disable_self: {
      message: t(
        "Je kunt je eigen account niet uitschakelen.",
        "You can't disable your own account.",
      ),
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
      message: t("Dit lidmaatschap bestaat niet (meer).", "That membership no longer exists."),
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

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
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

  const [detail, { refetch: refetchDetail }] = createResource(
    () => (me()?.isSiteAdmin ? params.id : undefined),
    async (userId) => {
      const result = await apiFetch(`/api/admin/users/${userId}`, {
        response: GetAdminUserDetailResponseSchema,
      });
      return result.match(
        (data) => data.user,
        () => null,
      );
    },
  );

  const [organizations] = createResource(
    () => (me()?.isSiteAdmin ? true : undefined),
    async () => {
      const result = await apiFetch("/api/organizations", {
        response: ListOrganizationsResponseSchema,
      });
      return result.match(
        (data) => data.organizations,
        () => [],
      );
    },
  );

  const availableOrgs = createMemo(() => {
    const memberOrgIds = new Set(detail()?.organizations.map((m) => m.orgId) ?? []);
    return (organizations() ?? []).filter((org) => !memberOrgIds.has(org.id));
  });

  const [actionError, setActionError] = createSignal<string | null>(null);
  const [disabling, setDisabling] = createSignal(false);
  const [selectedOrgId, setSelectedOrgId] = createSignal("");
  const [newRole, setNewRole] = createSignal<MembershipJson["role"]>("org_editor");
  const [adding, setAdding] = createSignal(false);

  async function onToggleDisabled() {
    const user = detail();
    if (!user) return;
    const nextDisabled = !user.disabledAt;
    setActionError(null);
    setDisabling(true);
    try {
      const result = await apiFetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        request: SetUserDisabledRequestSchema,
        body: { disabled: nextDisabled },
        response: SetUserDisabledResponseSchema,
      });
      result.match(
        () => refetchDetail(),
        (error) => setActionError(describeApiError(error, actionErrorMessages(lang()))),
      );
    } finally {
      setDisabling(false);
    }
  }

  async function onAddMembership(submitEvent: SubmitEvent) {
    submitEvent.preventDefault();
    const user = detail();
    const orgId = selectedOrgId();
    if (!user || !orgId) return;
    setActionError(null);
    setAdding(true);
    try {
      const result = await apiFetch(`/api/organizations/${orgId}/members`, {
        request: AddMemberRequestSchema,
        body: { accountName: user.accountName, role: newRole() },
        response: AddMemberResponseSchema,
      });
      result.match(
        () => {
          setSelectedOrgId("");
          refetchDetail();
        },
        (error) => setActionError(describeApiError(error, actionErrorMessages(lang()))),
      );
    } finally {
      setAdding(false);
    }
  }

  async function onChangeRole(orgId: string, role: MembershipJson["role"]) {
    const user = detail();
    if (!user) return;
    setActionError(null);
    const result = await apiFetch(`/api/organizations/${orgId}/members/${user.id}`, {
      method: "PATCH",
      request: UpdateMemberRoleRequestSchema,
      body: { role },
      response: UpdateMemberRoleResponseSchema,
    });
    result.match(
      () => refetchDetail(),
      (error) => setActionError(describeApiError(error, actionErrorMessages(lang()))),
    );
  }

  async function onRemoveMembership(orgId: string) {
    const user = detail();
    if (!user) return;
    if (!window.confirm(t("Uit deze organisatie verwijderen?", "Remove from this organization?")))
      return;
    setActionError(null);
    const result = await apiFetch(`/api/organizations/${orgId}/members/${user.id}`, {
      method: "DELETE",
      response: RemoveMemberResponseSchema,
    });
    result.match(
      () => refetchDetail(),
      (error) => setActionError(describeApiError(error, actionErrorMessages(lang()))),
    );
  }

  return (
    <main class="mx-auto max-w-2xl px-6 py-12">
      <LocaleCookieSync lang={lang()} />
      <Show when={!me.loading} fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}>
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
            when={!detail.loading}
            fallback={<p class="text-zinc-600">{t("Laden…", "Loading…")}</p>}
          >
            <Show
              when={detail()}
              fallback={
                <p class="text-zinc-600">{t("Gebruiker niet gevonden.", "User not found.")}</p>
              }
            >
              {(user) => (
                <>
                  <Title>
                    @{user().accountName} — {t("Gebruikers", "Users")} — Vegan Activists NL
                  </Title>
                  <h1 class="mb-6 text-2xl font-semibold">@{user().accountName}</h1>

                  <Show when={actionError()}>
                    {(message) => <p class="mb-4 text-red-700">{message()}</p>}
                  </Show>

                  <dl class="mb-8 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt class="font-medium text-zinc-500">{t("Naam", "Display name")}</dt>
                    <dd>{user().displayName}</dd>
                    <dt class="font-medium text-zinc-500">{t("E-mail", "Email")}</dt>
                    <dd>{user().email}</dd>
                    <Show when={user().affiliationsNote}>
                      <dt class="font-medium text-zinc-500">{t("Aantekening", "Note")}</dt>
                      <dd>{user().affiliationsNote}</dd>
                    </Show>
                    <dt class="font-medium text-zinc-500">{t("Lid sinds", "Member since")}</dt>
                    <dd>{formatDate(user().createdAt)}</dd>
                    <dt class="font-medium text-zinc-500">{t("Laatst ingelogd", "Last login")}</dt>
                    <dd>{formatDate(user().lastLoginAt)}</dd>
                    <dt class="font-medium text-zinc-500">{t("Status", "Status")}</dt>
                    <dd>
                      <Show
                        when={user().disabledAt}
                        fallback={
                          <span class="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            {t("Actief", "Active")}
                          </span>
                        }
                      >
                        <span class="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                          {t("Uitgeschakeld", "Disabled")}
                        </span>
                      </Show>
                    </dd>
                  </dl>

                  <button
                    type="button"
                    disabled={disabling()}
                    onClick={onToggleDisabled}
                    class={`mb-10 rounded-lg px-4 py-2 font-semibold shadow-sm transition disabled:opacity-50 ${
                      user().disabledAt
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-red-600 text-white hover:bg-red-700"
                    }`}
                  >
                    {user().disabledAt
                      ? t("Account inschakelen", "Enable account")
                      : t("Account uitschakelen", "Disable account")}
                  </button>

                  <h2 class="mb-4 text-lg font-semibold">{t("Organisaties", "Organizations")}</h2>
                  <ul class="mb-8 space-y-2">
                    <For each={user().organizations}>
                      {(membership) => (
                        <li class="flex items-center justify-between rounded-lg border border-zinc-200 p-3">
                          <span class="font-medium">{membership.orgName}</span>
                          <div class="flex items-center gap-2">
                            <span class="text-sm text-zinc-600">
                              {roleLabels[membership.role] ?? membership.role}
                            </span>
                            <Show
                              when={membership.role === "org_admin"}
                              fallback={
                                <button
                                  type="button"
                                  class="rounded border border-zinc-300 px-2 py-1 text-xs font-semibold transition hover:bg-zinc-50"
                                  onClick={() => onChangeRole(membership.orgId, "org_admin")}
                                >
                                  {t("Promoveren", "Promote")}
                                </button>
                              }
                            >
                              <button
                                type="button"
                                class="rounded border border-zinc-300 px-2 py-1 text-xs font-semibold transition hover:bg-zinc-50"
                                onClick={() => onChangeRole(membership.orgId, "org_editor")}
                              >
                                {t("Degraderen", "Demote")}
                              </button>
                            </Show>
                            <button
                              type="button"
                              class="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                              onClick={() => onRemoveMembership(membership.orgId)}
                            >
                              {t("Verwijderen", "Remove")}
                            </button>
                          </div>
                        </li>
                      )}
                    </For>
                    <Show when={user().organizations.length === 0}>
                      <p class="text-zinc-500">
                        {t("Geen lidmaatschappen.", "No organization memberships.")}
                      </p>
                    </Show>
                  </ul>

                  <h2 class="mb-4 text-lg font-semibold">
                    {t("Toevoegen aan organisatie", "Add to an organization")}
                  </h2>
                  <form class="flex flex-wrap items-end gap-3" onSubmit={onAddMembership}>
                    <label class="block">
                      <span class="block text-sm font-medium">
                        {t("Organisatie", "Organization")}
                      </span>
                      <select
                        class="mt-1 block rounded border border-zinc-300 px-3 py-2"
                        required
                        value={selectedOrgId()}
                        onChange={(e) => setSelectedOrgId(e.currentTarget.value)}
                      >
                        <option value="" disabled>
                          {t("Kies een organisatie…", "Choose an organization…")}
                        </option>
                        <For each={availableOrgs()}>
                          {(org) => <option value={org.id}>{org.name}</option>}
                        </For>
                      </select>
                    </label>
                    <label class="block">
                      <span class="block text-sm font-medium">{t("Rol", "Role")}</span>
                      <select
                        class="mt-1 block rounded border border-zinc-300 px-3 py-2"
                        value={newRole()}
                        onChange={(e) =>
                          setNewRole(e.currentTarget.value as MembershipJson["role"])
                        }
                      >
                        <option value="org_editor">{t("Redacteur", "Editor")}</option>
                        <option value="org_admin">{t("Beheerder", "Admin")}</option>
                      </select>
                    </label>
                    <button
                      type="submit"
                      disabled={adding() || availableOrgs().length === 0}
                      class="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {adding() ? t("Bezig…", "Adding…") : t("Toevoegen", "Add")}
                    </button>
                  </form>
                </>
              )}
            </Show>
          </Show>
        </Show>
      </Show>
    </main>
  );
}
