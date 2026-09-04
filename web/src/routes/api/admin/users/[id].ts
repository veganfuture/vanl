import type { APIEvent } from "@solidjs/start/server";
import { getAdminUserDetail, setUserDisabled } from "~/domain/auth/admin_users";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { UserId } from "~/domain/auth/user_id";
import { parseJsonBody } from "~/lib/http";
import {
  SetUserDisabledRequestSchema,
  toAdminUserDetailJson,
  type GetAdminUserDetailResponse,
  type SetUserDisabledResponse,
} from "./[id].schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  cannot_disable_self: 409,
  not_found: 404,
  validation: 400,
  internal_error: 500,
};

export async function GET(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies GetAdminUserDetailResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const userIdResult = UserId.from_string(event.params.id);
  if (userIdResult.isErr()) {
    return Response.json({ error: "not_found" } satisfies GetAdminUserDetailResponse, {
      status: ERROR_STATUS.not_found,
    });
  }

  const result = await getAdminUserDetail(actingUser, userIdResult.value);
  return result.match(
    (user) =>
      Response.json({ user: toAdminUserDetailJson(user) } satisfies GetAdminUserDetailResponse),
    (error) =>
      Response.json({ error } satisfies GetAdminUserDetailResponse, {
        status: ERROR_STATUS[error],
      }),
  );
}

export async function PATCH(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies SetUserDisabledResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const userIdResult = UserId.from_string(event.params.id);
  if (userIdResult.isErr()) {
    return Response.json({ error: "not_found" } satisfies SetUserDisabledResponse, {
      status: ERROR_STATUS.not_found,
    });
  }

  const parsed = SetUserDisabledRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies SetUserDisabledResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const result = await setUserDisabled(actingUser, userIdResult.value, parsed.data.disabled);
  return result.match(
    () => Response.json({ ok: true } satisfies SetUserDisabledResponse),
    (error) =>
      Response.json({ error } satisfies SetUserDisabledResponse, { status: ERROR_STATUS[error] }),
  );
}
