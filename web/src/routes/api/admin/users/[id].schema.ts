import { z } from "zod";
import type { AdminUserDetail } from "~/domain/auth/admin_users";
import { AdminUserOrgMembershipJsonSchema } from "../users.schema";

/**
 * Split out (like every other *.schema.ts in this app) so the admin user
 * detail page can import it without pulling admin_users.ts's server-only
 * dependency chain into the client bundle.
 */
export const AdminUserDetailJsonSchema = z.object({
  id: z.string(),
  accountName: z.string(),
  email: z.string(),
  displayName: z.string(),
  affiliationsNote: z.string().nullable(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  disabledAt: z.string().nullable(),
  organizations: z.array(AdminUserOrgMembershipJsonSchema),
});
export type AdminUserDetailJson = z.infer<typeof AdminUserDetailJsonSchema>;

export function toAdminUserDetailJson(detail: AdminUserDetail): AdminUserDetailJson {
  return {
    id: detail.id.value,
    accountName: detail.accountName.value,
    email: detail.email,
    displayName: detail.displayName,
    affiliationsNote: detail.affiliationsNote,
    createdAt: detail.createdAt.toISOString(),
    lastLoginAt: detail.lastLoginAt?.toISOString() ?? null,
    disabledAt: detail.disabledAt?.toISOString() ?? null,
    organizations: detail.organizations,
  };
}

export const GetAdminUserDetailResponseSchema = z.union([
  z.object({ user: AdminUserDetailJsonSchema }),
  z.object({ error: z.enum(["unauthorized", "forbidden", "not_found"]) }),
]);
export type GetAdminUserDetailResponse = z.infer<typeof GetAdminUserDetailResponseSchema>;

/** PATCH /api/admin/users/[id] body. */
export const SetUserDisabledRequestSchema = z.object({ disabled: z.boolean() });
export type SetUserDisabledRequest = z.infer<typeof SetUserDisabledRequestSchema>;

export const SetUserDisabledResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({
    error: z.enum([
      "unauthorized",
      "forbidden",
      "cannot_disable_self",
      "not_found",
      "validation",
      "internal_error",
    ]),
  }),
]);
export type SetUserDisabledResponse = z.infer<typeof SetUserDisabledResponseSchema>;
