import { authService } from "~/domain/auth/auth_service";
import type { ActingUser } from "~/domain/events/event_service";

/**
 * Resolves the session cookie to the shape EventService's authorization
 * checks need. Both underlying calls have a never-erroring signature (DB
 * failures are already logged and collapsed to a safe default inside
 * AuthService), so there's nothing left to propagate here.
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

  return { id: user.id, isSiteAdmin };
}
