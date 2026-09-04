import { z } from "zod";
import { ORG_ROLES } from "~/domain/auth/roles";
import type {
  Organization,
  OrganizationMembershipDetail,
} from "~/domain/organizations/organization";

/**
 * Shared response shape for every organizations route. Split out (like
 * every other *.schema.ts in this app) so pages can import it without
 * pulling the route handlers' server-only dependency chain into the client
 * bundle - see src/routes/api/events/event.schema.ts for the same pattern.
 */
export const OrganizationJsonSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  descriptionNl: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  logoFullImageId: z.string().nullable(),
  logoThumbnailImageId: z.string().nullable(),
  status: z.enum(["active", "deleted"]),
  /** Server-computed via canManageOrg (organization_service.ts) - org_admin/site_admin gate for profile-editing and member-management actions. */
  canManage: z.boolean(),
  /** Server-computed via isOrgMember (organization_service.ts) - any role/site_admin, the looser "belongs to this org at all" check used to decide whether to show management links in the first place. */
  isMember: z.boolean(),
});
export type OrganizationJson = z.infer<typeof OrganizationJsonSchema>;

/**
 * canManage/isMember are passed in rather than computed here (which would
 * require importing organization_service.ts, pulling its postgres/
 * server-only dependency chain into the client bundle - this file is
 * imported directly by client pages, e.g. organizations/[slug]/edit.tsx).
 * Callers compute them server-side via canManageOrg/isOrgMember(orgId,
 * actingUser) and pass the plain booleans through.
 */
export function toOrganizationJson(
  org: Organization,
  canManage: boolean,
  isMember: boolean,
): OrganizationJson {
  return {
    id: org.id.value,
    name: org.name,
    slug: org.slug,
    descriptionNl: org.descriptionNl,
    descriptionEn: org.descriptionEn,
    websiteUrl: org.websiteUrl,
    logoFullImageId: org.logoFullImageId,
    logoThumbnailImageId: org.logoThumbnailImageId,
    status: org.status,
    canManage,
    isMember,
  };
}

/** Request body shared by create (POST) and update (PATCH). */
export const OrganizationRequestSchema = z.object({
  name: z.string(),
  descriptionNl: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  websiteUrl: z.string().nullable(),
});
export type OrganizationRequest = z.infer<typeof OrganizationRequestSchema>;

export const MembershipJsonSchema = z.object({
  userId: z.string(),
  accountName: z.string(),
  displayName: z.string(),
  role: z.enum(ORG_ROLES),
});
export type MembershipJson = z.infer<typeof MembershipJsonSchema>;

export function toMembershipJson(membership: OrganizationMembershipDetail): MembershipJson {
  return {
    userId: membership.userId.value,
    accountName: membership.accountName,
    displayName: membership.displayName,
    role: membership.role,
  };
}

/** POST /api/organizations/[id]/members body - resolves the target by account name, same as login. */
export const AddMemberRequestSchema = z.object({
  accountName: z.string(),
  role: z.enum(ORG_ROLES),
});
export type AddMemberRequest = z.infer<typeof AddMemberRequestSchema>;

/** PATCH /api/organizations/[id]/members/[userId] body. */
export const UpdateMemberRoleRequestSchema = z.object({
  role: z.enum(ORG_ROLES),
});
export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>;
