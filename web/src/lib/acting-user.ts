import { authService } from "~/domain/auth/auth_service";
import type { UserId } from "~/domain/auth/user_id";
import { organizationRepository } from "~/domain/organizations/organization_repository";
import type { OrgRole } from "~/domain/organizations/organization";

/**
 * Who's making the request: their id, whether they can moderate any event
 * (site_admin), and their role in every org they belong to (keyed by org id
 * as a plain string, not OrganizationId - Map/lookup equality needs the raw
 * value, not object identity). A cross-domain concept (both EventService and
 * OrganizationService authorize against it), so it lives here rather than in
 * either domain module.
 */
export type ActingUser = {
  readonly id: UserId;
  readonly isSiteAdmin: boolean;
  readonly orgRoles: ReadonlyMap<string, OrgRole>;
};

/**
 * Resolves the session cookie to the shape EventService/OrganizationService's
 * authorization checks need. All three underlying calls have a
 * never-erroring signature (DB failures are already logged and collapsed to
 * a safe default inside AuthService/OrganizationRepository) - a failed org
 * membership lookup fails closed to "no org roles", same reasoning as
 * isSiteAdmin's existing "DB error -> false".
 */
export async function resolveActingUser(cookieHeader: string | null): Promise<ActingUser | null> {
  const sessionResult = await authService.getSessionUser(cookieHeader);
  const user = sessionResult.match(
    (u) => u,
    () => null,
  );
  if (!user) {
    return null;
  }

  const adminResult = await authService.isSiteAdmin(user.id);
  const isSiteAdmin = adminResult.match(
    (v) => v,
    () => false,
  );

  const membershipsResult = await organizationRepository.listMembershipsForUser(user.id);
  const memberships = membershipsResult.match(
    (m) => m,
    () => [],
  );
  const orgRoles = new Map(memberships.map((m) => [m.orgId, m.role]));

  return { id: user.id, isSiteAdmin, orgRoles };
}
