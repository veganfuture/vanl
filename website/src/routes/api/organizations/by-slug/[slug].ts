import type { APIEvent } from "@solidjs/start/server";
import { organizationService } from "~/domain/organizations/organization_service";
import { toOrganizationJson } from "../organization.schema";
import type { GetOrganizationBySlugResponse } from "./[slug].schema";

export async function GET(event: APIEvent): Promise<Response> {
  const result = await organizationService.getOrganizationBySlug(event.params.slug);
  return result.match(
    (found) =>
      found
        ? Response.json({
            organization: toOrganizationJson(found),
          } satisfies GetOrganizationBySlugResponse)
        : Response.json({ error: "not_found" } satisfies GetOrganizationBySlugResponse, {
            status: 404,
          }),
    () =>
      Response.json({ error: "not_found" } satisfies GetOrganizationBySlugResponse, {
        status: 404,
      }),
  );
}
