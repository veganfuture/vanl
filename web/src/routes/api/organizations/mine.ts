import type { APIEvent } from "@solidjs/start/server";
import {
  canManageOrg,
  isOrgMember,
  organizationService,
} from "~/domain/organizations/organization_service";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { toOrganizationJson } from "./organization.schema";
import type { MyOrganizationsResponse } from "./mine.schema";

export async function GET(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  if (!actingUser) {
    return Response.json({ organizations: [] } satisfies MyOrganizationsResponse, { status: 401 });
  }

  const organizations = await organizationService.listMyOrganizations(actingUser);
  return organizations.match(
    (list) =>
      Response.json({
        organizations: list.map((o) =>
          toOrganizationJson(
            o,
            canManageOrg(o.id.value, actingUser),
            isOrgMember(o.id.value, actingUser),
          ),
        ),
      } satisfies MyOrganizationsResponse),
    () => Response.json({ organizations: [] } satisfies MyOrganizationsResponse),
  );
}
