import type { APIEvent } from "@solidjs/start/server";
import { placeRepository } from "~/domain/places/place_repository";
import { logger } from "~/lib/logger";
import type { SearchPlacesResponse } from "./search.schema";

export async function GET(event: APIEvent): Promise<Response> {
  const query = new URL(event.request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return Response.json({ places: [] } satisfies SearchPlacesResponse);
  }

  const result = await placeRepository.searchPlaces(query);
  return result.match(
    (places) => Response.json({ places } satisfies SearchPlacesResponse),
    (dbError) => {
      logger.error({ err: dbError }, "failed to search places");
      return Response.json({ places: [] } satisfies SearchPlacesResponse);
    },
  );
}
