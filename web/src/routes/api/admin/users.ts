import type { APIEvent } from "@solidjs/start/server";
import { listAdminUserSummaries } from "~/domain/auth/admin_users";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { toAdminUserJson } from "./users.schema";
import type { ListAdminUsersResponse } from "./users.schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
};

export async function GET(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies ListAdminUsersResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const result = await listAdminUserSummaries(actingUser);
  return result.match(
    (users) =>
      Response.json({ users: users.map(toAdminUserJson) } satisfies ListAdminUsersResponse),
    (error) =>
      Response.json({ error } satisfies ListAdminUsersResponse, { status: ERROR_STATUS[error] }),
  );
}
