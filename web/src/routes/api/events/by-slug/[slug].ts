import type { APIEvent } from "@solidjs/start/server";
import { canLinkEventOrg, canModifyEvent, eventService } from "~/domain/events/event_service";
import { organizationService } from "~/domain/organizations/organization_service";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { toEventJson } from "../event.schema";
import type { GetEventBySlugResponse } from "./[slug].schema";

/** Public - no auth required to view, but resolves the (possibly anonymous) acting user so the response can carry the correct canEdit for the view/edit pages. */
export async function GET(event: APIEvent): Promise<Response> {
  const [result, actingUser] = await Promise.all([
    eventService.getEventBySlug(event.params.slug),
    resolveActingUser(event.request),
  ]);
  const found = result.match(
    (event) => event,
    () => null,
  );
  if (!found) {
    return Response.json({ error: "not_found" } satisfies GetEventBySlugResponse, {
      status: 404,
    });
  }

  // Resolve the publishing org's slug so the page can link "organized by" to it - see toEventJson's organizerOrgSlug.
  const organizerOrgSlug = found.publisherOrgId
    ? (await organizationService.getOrganizationById(found.publisherOrgId)).match(
        (org) => org?.slug ?? null,
        () => null,
      )
    : null;

  return Response.json({
    event: toEventJson(
      found,
      canModifyEvent(found, actingUser),
      canLinkEventOrg(found, actingUser),
      null,
      actingUser?.isSiteAdmin ?? false,
      organizerOrgSlug,
    ),
  } satisfies GetEventBySlugResponse);
}
