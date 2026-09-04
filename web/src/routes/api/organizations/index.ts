import type { APIEvent } from "@solidjs/start/server";
import {
  canManageOrg,
  isOrgMember,
  organizationService,
} from "~/domain/organizations/organization_service";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { parseJsonBody } from "~/lib/http";
import { OrganizationRequestSchema, toOrganizationJson } from "./organization.schema";
import type { CreateOrganizationResponse, ListOrganizationsResponse } from "./index.schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  validation: 400,
  name_taken: 409,
  internal_error: 500,
};

/** Public listing - not gated on login, so every org's canManage/isMember is computed against no acting user (always false). */
export async function GET(): Promise<Response> {
  const organizations = await organizationService.listOrganizations();
  return organizations.match(
    (list) =>
      Response.json({
        organizations: list.map((o) =>
          toOrganizationJson(o, canManageOrg(o.id.value, null), isOrgMember(o.id.value, null)),
        ),
      } satisfies ListOrganizationsResponse),
    () => Response.json({ organizations: [] } satisfies ListOrganizationsResponse),
  );
}

export async function POST(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies CreateOrganizationResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const parsed = OrganizationRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies CreateOrganizationResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const result = await organizationService.createOrganization(actingUser, parsed.data);
  return result.match(
    (created) =>
      Response.json(
        toOrganizationJson(
          created,
          canManageOrg(created.id.value, actingUser),
          isOrgMember(created.id.value, actingUser),
        ) satisfies CreateOrganizationResponse,
        { status: 201 },
      ),
    (error) =>
      Response.json({ error } satisfies CreateOrganizationResponse, {
        status: ERROR_STATUS[error],
      }),
  );
}
