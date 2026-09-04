import type { ActingUser } from "./acting_user";
import type { OrgRole } from "./roles";
import type { UserId } from "./user_id";

/** Shared by organization_service.test.ts and event_service.test.ts - was independently duplicated in both before. */
export function actingAs(
  userId: UserId,
  isSiteAdmin = false,
  orgRoles: Record<string, OrgRole> = {},
): ActingUser {
  return { id: userId, isSiteAdmin, orgRoles: new Map(Object.entries(orgRoles)) };
}
