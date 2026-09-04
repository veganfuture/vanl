import type { APIEvent } from "@solidjs/start/server";
import {
  canManageOrg,
  isOrgMember,
  organizationService,
} from "~/domain/organizations/organization_service";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { toOrganizationJson } from "../organization.schema";
import type { GetOrganizationBySlugResponse } from "./[slug].schema";

/** Public - no auth required to view, but resolves the (possibly anonymous) acting user so the response can carry the correct canManage/isMember for the view/edit/members pages. */
export async function GET(event: APIEvent): Promise<Response> {
  const [result, actingUser] = await Promise.all([
    organizationService.getOrganizationBySlug(event.params.slug),
    resolveActingUser(event.request),
  ]);
  return result.match(
    (found) =>
      found
        ? Response.json({
            organization: toOrganizationJson(
              found,
              canManageOrg(found.id.value, actingUser),
              isOrgMember(found.id.value, actingUser),
            ),
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
