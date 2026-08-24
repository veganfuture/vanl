import type { APIEvent } from "@solidjs/start/server";
import { organizationService } from "~/domain/organizations/organization_service";
import { resolveActingUser } from "~/lib/acting-user";
import { toOrganizationJson } from "./organization.schema";
import type { MyOrganizationsResponse } from "./mine.schema";

export async function GET(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ organizations: [] } satisfies MyOrganizationsResponse, { status: 401 });
  }

  const organizations = await organizationService.listMyOrganizations(actingUser);
  return organizations.match(
    (list) =>
      Response.json({
        organizations: list.map(toOrganizationJson),
      } satisfies MyOrganizationsResponse),
    () => Response.json({ organizations: [] } satisfies MyOrganizationsResponse),
  );
}
