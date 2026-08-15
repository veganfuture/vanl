import type { APIEvent } from "@solidjs/start/server";
import { eventService } from "~/domain/events/event_service";
import { resolveActingUser } from "~/lib/acting-user";
import { toEventJson } from "./event.schema";
import type { ListEventsResponse } from "./index.schema";

export async function GET(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ events: [] } satisfies ListEventsResponse, { status: 401 });
  }

  const events = await eventService.listEventsByPublisher(actingUser.id);
  return events.match(
    (list) => Response.json({ events: list.map(toEventJson) } satisfies ListEventsResponse),
    () => Response.json({ events: [] } satisfies ListEventsResponse),
  );
}
