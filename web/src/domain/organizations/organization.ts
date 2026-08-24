import type { UserId } from "../auth/user_id";
import type { OrganizationId } from "./organization_id";

export type OrganizationStatus = "active" | "deleted";

export type OrgRole = "org_editor" | "org_admin";

export type Organization = {
  id: OrganizationId;
  name: string;
  slug: string;
  description: string | null;
  websiteUrl: string | null;
  /** sha256 of each resized variant - see src/domain/images/image_processing.ts. */
  logoFullImageId: string | null;
  logoThumbnailImageId: string | null;
  status: OrganizationStatus;
  createdAt: Date;
  updatedAt: Date;
};

/** A row of the org_id/user_id/role join table - `orgId` stays a plain string, same reasoning as Event.placeId (a foreign key on a row shape, not itself the subject of authorization logic). */
export type OrganizationMembership = {
  orgId: string;
  userId: UserId;
  role: OrgRole;
  createdAt: Date;
};

/** A membership joined with the member's account info - for the membership-management UI, which needs to display who's who. */
export type OrganizationMembershipDetail = OrganizationMembership & {
  accountName: string;
  displayName: string;
};
