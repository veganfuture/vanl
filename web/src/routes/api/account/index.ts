import type { APIEvent } from "@solidjs/start/server";
import { authService } from "~/domain/auth/auth_service";
import type { User } from "~/domain/auth/user";
import { parseJsonBody } from "~/lib/http";
import {
  UpdateAccountRequestSchema,
  type AccountJson,
  type GetAccountResponse,
  type UpdateAccountResponse,
} from "./index.schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  validation: 400,
  internal_error: 500,
};

function toAccountJson(user: User): AccountJson {
  return {
    id: user.id.value,
    accountName: user.accountName.value,
    email: user.email,
    displayName: user.displayName,
    affiliationsNote: user.affiliationsNote,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function GET(event: APIEvent): Promise<Response> {
  const cookieHeader = event.request.headers.get("cookie");
  const sessionResult = await authService.getSessionUser(cookieHeader);
  const user = sessionResult.match(
    (u) => u,
    () => null,
  );
  if (!user) {
    return Response.json({ error: "unauthorized" } satisfies GetAccountResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  return Response.json({ account: toAccountJson(user) } satisfies GetAccountResponse);
}

export async function PATCH(event: APIEvent): Promise<Response> {
  const cookieHeader = event.request.headers.get("cookie");
  const sessionResult = await authService.getSessionUser(cookieHeader);
  const user = sessionResult.match(
    (u) => u,
    () => null,
  );
  if (!user) {
    return Response.json({ error: "unauthorized" } satisfies UpdateAccountResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const parsed = UpdateAccountRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies UpdateAccountResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const result = await authService.updateOwnProfile(user.id, parsed.data);
  return result.match(
    (updated) => Response.json({ account: toAccountJson(updated) } satisfies UpdateAccountResponse),
    (error) =>
      Response.json({ error } satisfies UpdateAccountResponse, { status: ERROR_STATUS[error] }),
  );
}
