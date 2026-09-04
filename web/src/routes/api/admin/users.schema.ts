import { z } from "zod";
import { ORG_ROLES } from "~/domain/auth/roles";
import type { AdminUserSummary } from "~/domain/auth/admin_users";

/**
 * Split out (like every other *.schema.ts in this app) so the admin/users
 * page can import it without pulling admin_users.ts's server-only
 * dependency chain into the client bundle - only `import type
 * AdminUserSummary` below, erased at build time, no runtime import.
 */
export const AdminUserOrgMembershipJsonSchema = z.object({
  orgId: z.string(),
  orgName: z.string(),
  role: z.enum(ORG_ROLES),
});

export const AdminUserJsonSchema = z.object({
  id: z.string(),
  accountName: z.string(),
  lastLoginAt: z.string().nullable(),
  organizations: z.array(AdminUserOrgMembershipJsonSchema),
});
export type AdminUserJson = z.infer<typeof AdminUserJsonSchema>;

export function toAdminUserJson(summary: AdminUserSummary): AdminUserJson {
  return {
    id: summary.id.value,
    accountName: summary.accountName.value,
    lastLoginAt: summary.lastLoginAt?.toISOString() ?? null,
    organizations: summary.organizations,
  };
}

export const ListAdminUsersResponseSchema = z.union([
  z.object({ users: z.array(AdminUserJsonSchema) }),
  z.object({ error: z.enum(["unauthorized", "forbidden"]) }),
]);
export type ListAdminUsersResponse = z.infer<typeof ListAdminUsersResponseSchema>;
