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
  organizations: AdminUserOrgMembership[];
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
      organizations: orgsByUser.get(user.id.value) ?? [],
    }));
  });
}
