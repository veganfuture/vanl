import type { APIEvent } from "@solidjs/start/server";
import { eventService } from "~/domain/events/event_service";
import { toEventJson } from "../event.schema";
import type { GetEventBySlugResponse } from "./[slug].schema";

export async function GET(event: APIEvent): Promise<Response> {
  const result = await eventService.getEventBySlug(event.params.slug);
  return result.match(
    (found) =>
      found
        ? Response.json({ event: toEventJson(found) } satisfies GetEventBySlugResponse)
        : Response.json({ error: "not_found" } satisfies GetEventBySlugResponse, { status: 404 }),
    () => Response.json({ error: "not_found" } satisfies GetEventBySlugResponse, { status: 404 }),
  );
}
