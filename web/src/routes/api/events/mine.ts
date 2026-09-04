import type { APIEvent } from "@solidjs/start/server";
import { canModifyEvent, eventService } from "~/domain/events/event_service";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { toEventJson } from "./event.schema";
import type { ListEventsResponse } from "./index.schema";

export async function GET(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  if (!actingUser) {
    return Response.json({ events: [] } satisfies ListEventsResponse, { status: 401 });
  }

  const events = await eventService.listMyEvents(actingUser);
  return events.match(
    (list) =>
      Response.json({
        events: list.map((e) => toEventJson(e, canModifyEvent(e, actingUser))),
      } satisfies ListEventsResponse),
    () => Response.json({ events: [] } satisfies ListEventsResponse),
  );
}
