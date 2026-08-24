import { z } from "zod";
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
  description: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  logoFullImageId: z.string().nullable(),
  logoThumbnailImageId: z.string().nullable(),
  status: z.enum(["active", "deleted"]),
});
export type OrganizationJson = z.infer<typeof OrganizationJsonSchema>;

export function toOrganizationJson(org: Organization): OrganizationJson {
  return {
    id: org.id.value,
    name: org.name,
    slug: org.slug,
    description: org.description,
    websiteUrl: org.websiteUrl,
    logoFullImageId: org.logoFullImageId,
    logoThumbnailImageId: org.logoThumbnailImageId,
    status: org.status,
  };
}

/** Request body shared by create (POST) and update (PATCH). */
export const OrganizationRequestSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  websiteUrl: z.string().nullable(),
});
export type OrganizationRequest = z.infer<typeof OrganizationRequestSchema>;

export const MembershipJsonSchema = z.object({
  userId: z.string(),
  accountName: z.string(),
  displayName: z.string(),
  role: z.enum(["org_editor", "org_admin"]),
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
  role: z.enum(["org_editor", "org_admin"]),
});
export type AddMemberRequest = z.infer<typeof AddMemberRequestSchema>;

/** PATCH /api/organizations/[id]/members/[userId] body. */
export const UpdateMemberRoleRequestSchema = z.object({
  role: z.enum(["org_editor", "org_admin"]),
});
export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>;
