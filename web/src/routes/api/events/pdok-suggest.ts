import type { APIEvent } from "@solidjs/start/server";
import { suggestAddresses } from "~/domain/events/pdok-client";
import { logger } from "~/lib/logger";
import type { PdokSuggestResponse } from "./pdok-suggest.schema";

/**
 * Proxies PDOK Locatieserver suggest so the browser doesn't call a
 * third-party API directly from the create/edit form's address field.
 */
export async function GET(event: APIEvent): Promise<Response> {
  const query = new URL(event.request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return Response.json({ suggestions: [] } satisfies PdokSuggestResponse);
  }

  const result = await suggestAddresses(query);
  return result.match(
    (suggestions) => Response.json({ suggestions } satisfies PdokSuggestResponse),
    (pdokError) => {
      logger.warn({ err: pdokError }, "PDOK address suggest failed");
      return Response.json({ suggestions: [] } satisfies PdokSuggestResponse);
    },
  );
}
