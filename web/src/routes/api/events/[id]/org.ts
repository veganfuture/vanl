import type { APIEvent } from "@solidjs/start/server";
import { canLinkEventOrg, canModifyEvent, eventService } from "~/domain/events/event_service";
import { EventId } from "~/domain/events/event_id";
import { OrganizationId } from "~/domain/organizations/organization_id";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { parseJsonBody } from "~/lib/http";
import { toEventJson } from "../event.schema";
import { SetEventOrgRequestSchema, type EventOrgResponse } from "./org.schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  not_found: 404,
  org_not_found: 404,
  forbidden: 403,
  already_in_org: 409,
  not_in_org: 409,
  validation: 400,
  internal_error: 500,
};

/** Attaches an event to an organization - see event_service.ts's addEventToOrganization for the authorization rules. */
export async function POST(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies EventOrgResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const eventIdResult = EventId.from_string(event.params.id);
  if (eventIdResult.isErr()) {
    return Response.json({ error: "not_found" } satisfies EventOrgResponse, {
      status: ERROR_STATUS.not_found,
    });
  }

  const parsed = SetEventOrgRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies EventOrgResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const orgIdResult = OrganizationId.from_string(parsed.data.orgId);
  if (orgIdResult.isErr()) {
    return Response.json({ error: "org_not_found" } satisfies EventOrgResponse, {
      status: ERROR_STATUS.org_not_found,
    });
  }

  const result = await eventService.addEventToOrganization(
    actingUser,
    eventIdResult.value,
    orgIdResult.value,
  );

  return result.match(
    (updated) =>
      Response.json(
        toEventJson(
          updated,
          canModifyEvent(updated, actingUser),
          canLinkEventOrg(updated, actingUser),
        ) satisfies EventOrgResponse,
      ),
    (error) => Response.json({ error } satisfies EventOrgResponse, { status: ERROR_STATUS[error] }),
  );
}

/** Detaches an event from its current organization - see event_service.ts's removeEventFromOrganization for the authorization rules. */
export async function DELETE(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies EventOrgResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const eventIdResult = EventId.from_string(event.params.id);
  if (eventIdResult.isErr()) {
    return Response.json({ error: "not_found" } satisfies EventOrgResponse, {
      status: ERROR_STATUS.not_found,
    });
  }

  const result = await eventService.removeEventFromOrganization(actingUser, eventIdResult.value);

  return result.match(
    (updated) =>
      Response.json(
        toEventJson(
          updated,
          canModifyEvent(updated, actingUser),
          canLinkEventOrg(updated, actingUser),
        ) satisfies EventOrgResponse,
      ),
    (error) => Response.json({ error } satisfies EventOrgResponse, { status: ERROR_STATUS[error] }),
  );
}
