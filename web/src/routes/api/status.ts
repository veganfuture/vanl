import type { APIEvent } from "@solidjs/start/server";
import { getBotStatus } from "~/domain/bot/bot_status_client";
import { checkDatabaseConnection } from "~/lib/db";
import type {
  BotStatusComponentSchema,
  StatusComponentSchema,
  StatusResponse,
} from "./status.schema";
import type { z } from "zod";

/**
 * Public and unauthenticated, like /api/healthz - deliberately so, since
 * this exists to be checked *during* an outage (e.g. the database being
 * down), and login itself does a DB-backed session lookup. Gating this
 * behind auth would mean the one time you most need it is the one time you
 * can't reach it.
 */
export async function GET(_event: APIEvent): Promise<Response> {
  const [database, bot] = await Promise.all([checkDatabase(), checkBot()]);

  return Response.json({
    time: new Date().toISOString(),
    web: { ok: true },
    database,
    bot,
  } satisfies StatusResponse);
}

async function checkDatabase(): Promise<z.infer<typeof StatusComponentSchema>> {
  try {
    await checkDatabaseConnection();
    return { ok: true };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Unknown database error" };
  }
}

async function checkBot(): Promise<z.infer<typeof BotStatusComponentSchema>> {
  const result = await getBotStatus();
  return result.match(
    ({ signalConnected }) => ({ ok: true, signalConnected }),
    (error) => ({ ok: false, error: error.message }),
  );
}
