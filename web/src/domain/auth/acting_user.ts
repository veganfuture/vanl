import { authService } from "~/domain/auth/auth_service";
import type { User } from "~/domain/auth/user";
import type { UserId } from "~/domain/auth/user_id";
import { organizationRepository } from "~/domain/organizations/organization_repository";
import type { OrgRole } from "./roles";

/**
 * Who's making the request: their id, whether they can moderate any event
 * (site_admin), and their role in every org they belong to (keyed by org id
 * as a plain string, not OrganizationId - Map/lookup equality needs the raw
 * value, not object identity). A cross-domain concept (both EventService and
 * OrganizationService authorize against it), but role data belongs in
 * domain/auth regardless of who consumes it.
 */
export type ActingUser = {
  readonly id: UserId;
  readonly isSiteAdmin: boolean;
  readonly orgRoles: ReadonlyMap<string, OrgRole>;
};

/**
 * Resolves an already-authenticated user to the shape EventService/
 * OrganizationService's authorization checks need. Both underlying calls
 * have a never-erroring signature (DB failures are already logged and
 * collapsed to a safe default inside AuthService/OrganizationRepository) - a
 * failed org membership lookup fails closed to "no org roles", same
 * reasoning as isSiteAdmin's existing "DB error -> false". Split out from
 * resolveActingUser so callers that already have a User in hand (e.g.
 * /api/auth/me, which needs it for accountName/displayName too) don't
 * re-derive isSiteAdmin their own way - see that route for the other caller.
 */
export async function resolveActingUserForUser(user: User): Promise<ActingUser> {
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

/**
 * Resolves a request straight to an ActingUser, or null if not logged in.
 * Takes the whole Request (not just the cookie header) so every route
 * handler can call resolveActingUser(event.request) instead of each one
 * repeating event.request.headers.get("cookie") itself.
 */
export async function resolveActingUser(request: Request): Promise<ActingUser | null> {
  const sessionResult = await authService.getSessionUser(request.headers.get("cookie"));
  const user = sessionResult.match(
    (u) => u,
    () => null,
  );
  if (!user) {
    return null;
  }
  return resolveActingUserForUser(user);
}
