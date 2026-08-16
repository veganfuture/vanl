import type { APIEvent } from "@solidjs/start/server";
import { organizationService } from "~/domain/organizations/organization_service";
import { OrganizationId } from "~/domain/organizations/organization_id";
import { UserId } from "~/domain/auth/user_id";
import { resolveActingUser } from "~/lib/acting-user";
import { parseJsonBody } from "~/lib/http";
import { UpdateMemberRoleRequestSchema } from "../../organization.schema";
import type { RemoveMemberResponse, UpdateMemberRoleResponse } from "./[userId].schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  org_not_found: 404,
  member_not_found: 404,
  forbidden: 403,
  sole_admin: 409,
  validation: 400,
  internal_error: 500,
};

function parseParams(
  event: APIEvent,
): { orgId: OrganizationId; memberUserId: UserId } | "not_found" {
  const orgIdResult = OrganizationId.from_string(event.params.id);
  const userIdResult = UserId.from_string(event.params.userId);
  if (orgIdResult.isErr() || userIdResult.isErr()) {
    return "not_found";
  }
  return { orgId: orgIdResult.value, memberUserId: userIdResult.value };
}

export async function PATCH(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies UpdateMemberRoleResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const params = parseParams(event);
  if (params === "not_found") {
    return Response.json({ error: "org_not_found" } satisfies UpdateMemberRoleResponse, {
      status: ERROR_STATUS.org_not_found,
    });
  }

  const parsed = UpdateMemberRoleRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies UpdateMemberRoleResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const result = await organizationService.updateMemberRole(
    actingUser,
    params.orgId,
    params.memberUserId,
    parsed.data.role,
  );
  return result.match(
    () => Response.json({ ok: true } satisfies UpdateMemberRoleResponse),
    (error) =>
      Response.json({ error } satisfies UpdateMemberRoleResponse, { status: ERROR_STATUS[error] }),
  );
}

export async function DELETE(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies RemoveMemberResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const params = parseParams(event);
  if (params === "not_found") {
    return Response.json({ error: "org_not_found" } satisfies RemoveMemberResponse, {
      status: ERROR_STATUS.org_not_found,
    });
  }

  const result = await organizationService.removeMember(
    actingUser,
    params.orgId,
    params.memberUserId,
  );
  return result.match(
    () => Response.json({ ok: true } satisfies RemoveMemberResponse),
    (error) =>
      Response.json({ error } satisfies RemoveMemberResponse, { status: ERROR_STATUS[error] }),
  );
}
