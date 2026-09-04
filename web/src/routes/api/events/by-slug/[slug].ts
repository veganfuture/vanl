import type { APIEvent } from "@solidjs/start/server";
import { canModifyEvent, eventService } from "~/domain/events/event_service";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { toEventJson } from "../event.schema";
import type { GetEventBySlugResponse } from "./[slug].schema";

/** Public - no auth required to view, but resolves the (possibly anonymous) acting user so the response can carry the correct canEdit for the view/edit pages. */
export async function GET(event: APIEvent): Promise<Response> {
  const [result, actingUser] = await Promise.all([
    eventService.getEventBySlug(event.params.slug),
    resolveActingUser(event.request),
  ]);
  return result.match(
    (found) =>
      found
        ? Response.json({
            event: toEventJson(found, canModifyEvent(found, actingUser)),
          } satisfies GetEventBySlugResponse)
        : Response.json({ error: "not_found" } satisfies GetEventBySlugResponse, { status: 404 }),
    () => Response.json({ error: "not_found" } satisfies GetEventBySlugResponse, { status: 404 }),
  );
}
