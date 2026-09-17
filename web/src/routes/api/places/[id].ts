import type { APIEvent } from "@solidjs/start/server";
import { placeRepository } from "~/domain/places/place_repository";
import { logger } from "~/lib/logger";
import { parseUuid } from "~/lib/uuid";
import type { GetPlaceResponse } from "./[id].schema";

export async function GET(event: APIEvent): Promise<Response> {
  const idResult = parseUuid(event.params.id);
  if (idResult.isErr()) {
    return Response.json({ error: "not_found" } satisfies GetPlaceResponse, { status: 404 });
  }
  const result = await placeRepository.findPlaceById(idResult.value);
  return result.match(
    (place) =>
      place
        ? Response.json({ place } satisfies GetPlaceResponse)
        : Response.json({ error: "not_found" } satisfies GetPlaceResponse, { status: 404 }),
    (dbError) => {
      logger.error({ err: dbError }, "failed to find place by id");
      return Response.json({ error: "not_found" } satisfies GetPlaceResponse, { status: 404 });
    },
  );
}
