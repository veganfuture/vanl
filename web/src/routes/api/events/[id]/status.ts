import type { APIEvent } from "@solidjs/start/server";
import { eventService } from "~/domain/events/event_service";
import { EventId } from "~/domain/events/event_id";
import { resolveActingUser } from "~/lib/acting-user";
import { parseJsonBody } from "~/lib/http";
import { toEventJson } from "../event.schema";
import { SetEventStatusRequestSchema, type SetEventStatusResponse } from "./status.schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  not_found: 404,
  forbidden: 403,
  validation: 400,
  internal_error: 500,
};

export async function POST(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies SetEventStatusResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const eventIdResult = EventId.from_string(event.params.id);
  if (eventIdResult.isErr()) {
    return Response.json({ error: "not_found" } satisfies SetEventStatusResponse, {
      status: ERROR_STATUS.not_found,
    });
  }

  const parsed = SetEventStatusRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies SetEventStatusResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const result = await eventService.setEventStatus(
    actingUser,
    eventIdResult.value,
    parsed.data.status,
    parsed.data.cancelReason,
  );

  return result.match(
    (updated) => Response.json(toEventJson(updated) satisfies SetEventStatusResponse),
    (error) =>
      Response.json({ error } satisfies SetEventStatusResponse, { status: ERROR_STATUS[error] }),
  );
}
