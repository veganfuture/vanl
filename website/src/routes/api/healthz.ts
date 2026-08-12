import type { APIEvent } from "@solidjs/start/server";
import { logger } from "~/lib/logger";

/**
 * Deliberately does not touch the database (there isn't one yet, and later there
 * won't be one on this path either) — proves DB-independent pages stay up even if
 * Postgres is unavailable, per the reliability requirement in docs/architecture.md.
 */
export function GET(_event: APIEvent): Response {
  logger.info("healthz check");
  return Response.json({ status: "ok", time: new Date().toISOString() });
}
