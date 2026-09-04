import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { logger } from "~/lib/logger";
import { organizationRepository } from "~/domain/organizations/organization_repository";
import type { ActingUser } from "./acting_user";
import { authService } from "./auth_service";
import type { AccountName } from "./account_name";
import type { UserId } from "./user_id";
import type { OrgRole } from "./roles";

export type AdminUserOrgMembership = { orgId: string; orgName: string; role: OrgRole };

export type AdminUserSummary = {
  id: UserId;
  accountName: AccountName;
  lastLoginAt: Date | null;
  disabledAt: Date | null;
  organizations: AdminUserOrgMembership[];
};

export type AdminUserDetail = AdminUserSummary & {
  email: string;
  displayName: string;
  affiliationsNote: string | null;
  createdAt: Date;
};

/**
 * Cross-domain (auth + organizations), same reasoning as acting_user.ts:
 * goes through authService for auth-domain data, but reaches directly into
 * organizationRepository for org data rather than through
 * OrganizationService, matching resolveActingUserForUser's own shape.
 * site_admin only - every other caller gets "forbidden".
 */
export function listAdminUserSummaries(
  actingUser: ActingUser,
): ResultAsync<AdminUserSummary[], "forbidden"> {
  if (!actingUser.isSiteAdmin) {
    return errAsync("forbidden");
  }

  return ResultAsync.combine([
    authService.listAllUsers(),
    authService.listLastLoginByUser(),
    organizationRepository.listAllMembershipsWithOrgNames().orElse((dbError) => {
      logger.error({ err: dbError }, "failed to list all memberships with org names");
      return okAsync([]);
    }),
  ]).map(([users, lastLoginByUser, memberships]) => {
    const orgsByUser = new Map<string, AdminUserOrgMembership[]>();
    for (const m of memberships) {
      const list = orgsByUser.get(m.userId.value) ?? [];
      list.push({ orgId: m.orgId, orgName: m.orgName, role: m.role });
      orgsByUser.set(m.userId.value, list);
    }

    return users.map((user) => ({
      id: user.id,
      accountName: user.accountName,
      lastLoginAt: lastLoginByUser.get(user.id.value) ?? null,
      disabledAt: user.disabledAt,
      organizations: orgsByUser.get(user.id.value) ?? [],
    }));
  });
}

export type GetAdminUserDetailError = "forbidden" | "not_found";

/**
 * Reuses listAdminUserSummaries' two full-table queries (last login, all
 * memberships) rather than adding narrower single-user SQL - this is an
 * admin tool over a small user base, and it keeps one source of truth for
 * "how do we compute lastLoginAt / organizations for a user" instead of two.
 */
export function getAdminUserDetail(
  actingUser: ActingUser,
  userId: UserId,
): ResultAsync<AdminUserDetail, GetAdminUserDetailError> {
  if (!actingUser.isSiteAdmin) {
    return errAsync("forbidden");
  }

  return ResultAsync.combine([
    authService.findUserById(userId),
    authService.listLastLoginByUser(),
    organizationRepository.listAllMembershipsWithOrgNames().orElse((dbError) => {
      logger.error({ err: dbError }, "failed to list all memberships with org names");
      return okAsync([]);
    }),
  ]).andThen(([user, lastLoginByUser, memberships]) => {
    if (!user) {
      return errAsync<AdminUserDetail, GetAdminUserDetailError>("not_found");
    }
    const organizations = memberships
      .filter((m) => m.userId.equals(userId))
      .map((m) => ({ orgId: m.orgId, orgName: m.orgName, role: m.role }));

    return okAsync<AdminUserDetail, GetAdminUserDetailError>({
      id: user.id,
      accountName: user.accountName,
      email: user.email,
      displayName: user.displayName,
      affiliationsNote: user.affiliationsNote,
      createdAt: user.createdAt,
      lastLoginAt: lastLoginByUser.get(user.id.value) ?? null,
      disabledAt: user.disabledAt,
      organizations,
    });
  });
}

export type SetUserDisabledError =
  "forbidden" | "cannot_disable_self" | "not_found" | "internal_error";

/** site_admin only - a site admin can't disable their own account (would lock them out with no way back in). */
export function setUserDisabled(
  actingUser: ActingUser,
  userId: UserId,
  disabled: boolean,
): ResultAsync<void, SetUserDisabledError> {
  if (!actingUser.isSiteAdmin) {
    return errAsync("forbidden");
  }
  if (disabled && actingUser.id.equals(userId)) {
    return errAsync("cannot_disable_self");
  }

  return authService.findUserById(userId).andThen((user) => {
    if (!user) {
      return errAsync<void, SetUserDisabledError>("not_found");
    }
    return authService.setUserDisabled(userId, disabled).map(() => undefined);
  });
}
