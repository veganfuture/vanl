import type { APIEvent } from "@solidjs/start/server";
import { eventService } from "~/domain/events/event_service";
import { EventId } from "~/domain/events/event_id";
import { resolveActingUser } from "~/lib/acting-user";
import { parseJsonBody } from "~/lib/http";
import { EventRequestSchema, toEventJson } from "./event.schema";
import type { DeleteEventResponse, UpdateEventResponse } from "./[id].schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  not_found: 404,
  forbidden: 403,
  validation: 400,
  internal_error: 500,
};

export async function PATCH(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies UpdateEventResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const eventIdResult = EventId.from_string(event.params.id);
  if (eventIdResult.isErr()) {
    return Response.json({ error: "not_found" } satisfies UpdateEventResponse, {
      status: ERROR_STATUS.not_found,
    });
  }

  const parsed = EventRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies UpdateEventResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const result = await eventService.updateEvent(actingUser, eventIdResult.value, {
    ...parsed.data,
    startAt: new Date(parsed.data.startAt),
    endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : null,
  });

  return result.match(
    (updated) => Response.json(toEventJson(updated) satisfies UpdateEventResponse),
    (error) =>
      Response.json({ error } satisfies UpdateEventResponse, { status: ERROR_STATUS[error] }),
  );
}

export async function DELETE(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies DeleteEventResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const eventIdResult = EventId.from_string(event.params.id);
  if (eventIdResult.isErr()) {
    return Response.json({ error: "not_found" } satisfies DeleteEventResponse, {
      status: ERROR_STATUS.not_found,
    });
  }

  const result = await eventService.deleteEvent(actingUser, eventIdResult.value);
  return result.match(
    () => Response.json({ ok: true } satisfies DeleteEventResponse),
    (error) =>
      Response.json({ error } satisfies DeleteEventResponse, { status: ERROR_STATUS[error] }),
  );
}
