import type { APIEvent } from "@solidjs/start/server";
import { imageService } from "~/domain/images/image_service";
import { EventId } from "~/domain/events/event_id";
import { resolveActingUser } from "~/lib/acting-user";
import { toEventJson } from "../event.schema";
import type { UploadFlyerResponse } from "./flyer.schema";

const ERROR_STATUS: Record<string, number> = {
  unauthorized: 401,
  not_found: 404,
  forbidden: 403,
  validation: 400,
  internal_error: 500,
};

/** Matches image_processing.ts's own cap - checked here too so an oversized body never even reaches it. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function POST(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request.headers.get("cookie"));
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies UploadFlyerResponse, {
      status: ERROR_STATUS.unauthorized,
    });
  }

  const eventIdResult = EventId.from_string(event.params.id);
  if (eventIdResult.isErr()) {
    return Response.json({ error: "not_found" } satisfies UploadFlyerResponse, {
      status: ERROR_STATUS.not_found,
    });
  }

  const declaredLength = Number(event.request.headers.get("content-length") ?? "0");
  if (!declaredLength || declaredLength > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "validation" } satisfies UploadFlyerResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const bytes = Buffer.from(await event.request.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "validation" } satisfies UploadFlyerResponse, {
      status: ERROR_STATUS.validation,
    });
  }

  const result = await imageService.replaceEventFlyer(actingUser, eventIdResult.value, bytes);
  return result.match(
    (updated) => Response.json(toEventJson(updated) satisfies UploadFlyerResponse),
    (error) =>
      Response.json({ error } satisfies UploadFlyerResponse, { status: ERROR_STATUS[error] }),
  );
}
