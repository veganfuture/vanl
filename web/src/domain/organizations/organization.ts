import type { UserId } from "../auth/user_id";
import type { OrgRole } from "../auth/roles";
import type { Sha256 } from "~/lib/sha256";
import type { OrganizationId } from "./organization_id";

export type OrganizationStatus = "active" | "deleted";

export type { OrgRole };

export type Organization = {
  id: OrganizationId;
  name: string;
  slug: string;
  descriptionNl: string | null;
  descriptionEn: string | null;
  websiteUrl: string | null;
  /** sha256 of each resized variant - see src/domain/images/image_processing.ts. */
  logoFullImageId: Sha256 | null;
  logoThumbnailImageId: Sha256 | null;
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
