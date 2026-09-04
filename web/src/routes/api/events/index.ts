import type { APIEvent } from "@solidjs/start/server";
import { canModifyEvent, eventService } from "~/domain/events/event_service";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { parseJsonBody } from "~/lib/http";
import { EventRequestSchema, toEventJson } from "./event.schema";
import type { CreateEventResponse, ListEventsResponse } from "./index.schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  validation: 400,
  internal_error: 500,
};

/**
 * Public listing - not gated on login, but resolves the (possibly
 * anonymous) acting user so site admins see every status (hidden/cancelled
 * included, not just visible) and so canEdit reflects reality instead of
 * always being false.
 */
export async function GET(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  const events = await eventService.listEventsForViewer(actingUser);
  return events.match(
    (list) =>
      Response.json({
        events: list.map((e) => toEventJson(e, canModifyEvent(e, actingUser))),
      } satisfies ListEventsResponse),
    () => Response.json({ events: [] } satisfies ListEventsResponse),
  );
}

export async function POST(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies CreateEventResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const parsed = EventRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies CreateEventResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const result = await eventService.createEvent(actingUser, {
    ...parsed.data,
    startAt: new Date(parsed.data.startAt),
    endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : null,
  });

  return result.match(
    (created) =>
      Response.json(
        toEventJson(created, canModifyEvent(created, actingUser)) satisfies CreateEventResponse,
        {
          status: 201,
        },
      ),
    (error) =>
      Response.json({ error } satisfies CreateEventResponse, { status: ERROR_STATUS[error] }),
  );
}
