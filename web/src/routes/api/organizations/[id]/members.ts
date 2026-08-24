import type { APIEvent } from "@solidjs/start/server";
import { organizationService } from "~/domain/organizations/organization_service";
import { OrganizationId } from "~/domain/organizations/organization_id";
import { resolveActingUser } from "~/lib/acting-user";
import { parseJsonBody } from "~/lib/http";
import { AddMemberRequestSchema, toMembershipJson } from "../organization.schema";
import type { AddMemberResponse, ListMembersResponse } from "./members.schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  org_not_found: 404,
  account_not_found: 404,
  already_member: 409,
  forbidden: 403,
  validation: 400,
  internal_error: 500,
};

export async function GET(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies ListMembersResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const orgIdResult = OrganizationId.from_string(event.params.id);
  if (orgIdResult.isErr()) {
    return Response.json({ error: "org_not_found" } satisfies ListMembersResponse, {
      status: ERROR_STATUS.org_not_found,
    });
  }

  const result = await organizationService.listMembershipDetails(actingUser, orgIdResult.value);
  return result.match(
    (members) =>
      Response.json({ members: members.map(toMembershipJson) } satisfies ListMembersResponse),
    (error) =>
      Response.json({ error } satisfies ListMembersResponse, { status: ERROR_STATUS[error] }),
  );
}

export async function POST(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies AddMemberResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const orgIdResult = OrganizationId.from_string(event.params.id);
  if (orgIdResult.isErr()) {
    return Response.json({ error: "org_not_found" } satisfies AddMemberResponse, {
      status: ERROR_STATUS.org_not_found,
    });
  }

  const parsed = AddMemberRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies AddMemberResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const result = await organizationService.addMember(
    actingUser,
    orgIdResult.value,
    parsed.data.accountName,
    parsed.data.role,
  );
  return result.match(
    () => Response.json({ ok: true } satisfies AddMemberResponse, { status: 201 }),
    (error) =>
      Response.json({ error } satisfies AddMemberResponse, { status: ERROR_STATUS[error] }),
  );
}
