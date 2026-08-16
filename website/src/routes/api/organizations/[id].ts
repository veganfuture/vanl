import type { APIEvent } from "@solidjs/start/server";
import { organizationService } from "~/domain/organizations/organization_service";
import { OrganizationId } from "~/domain/organizations/organization_id";
import { resolveActingUser } from "~/lib/acting-user";
import { parseJsonBody } from "~/lib/http";
import { OrganizationRequestSchema, toOrganizationJson } from "./organization.schema";
import type { DeleteOrganizationResponse, UpdateOrganizationResponse } from "./[id].schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  not_found: 404,
  forbidden: 403,
  validation: 400,
  name_taken: 409,
  internal_error: 500,
};

export async function PATCH(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies UpdateOrganizationResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const orgIdResult = OrganizationId.from_string(event.params.id);
  if (orgIdResult.isErr()) {
    return Response.json({ error: "not_found" } satisfies UpdateOrganizationResponse, {
      status: ERROR_STATUS.not_found,
    });
  }

  const parsed = OrganizationRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies UpdateOrganizationResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const result = await organizationService.updateOrganization(
    actingUser,
    orgIdResult.value,
    parsed.data,
  );
  return result.match(
    (updated) => Response.json(toOrganizationJson(updated) satisfies UpdateOrganizationResponse),
    (error) =>
      Response.json({ error } satisfies UpdateOrganizationResponse, {
        status: ERROR_STATUS[error],
      }),
  );
}

export async function DELETE(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies DeleteOrganizationResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const orgIdResult = OrganizationId.from_string(event.params.id);
  if (orgIdResult.isErr()) {
    return Response.json({ error: "not_found" } satisfies DeleteOrganizationResponse, {
      status: ERROR_STATUS.not_found,
    });
  }

  const result = await organizationService.deleteOrganization(actingUser, orgIdResult.value);
  return result.match(
    () => Response.json({ ok: true } satisfies DeleteOrganizationResponse),
    (error) =>
      Response.json({ error } satisfies DeleteOrganizationResponse, {
        status: ERROR_STATUS[error],
      }),
  );
}
