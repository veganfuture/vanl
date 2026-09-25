import type { APIEvent } from "@solidjs/start/server";
import { resolveActingUser } from "~/domain/auth/acting_user";
import { getBotStatus } from "~/domain/bot/bot_status_client";
import { checkDatabaseConnection } from "~/lib/db";
import type {
  BotStatusComponentSchema,
  StatusComponentSchema,
  StatusResponse,
} from "./status.schema";
import type { z } from "zod";

/**
 * Site-admin-only monitoring overview (unlike /api/healthz, which is public
 * and deliberately DB-free for load-balancer-style liveness checks) - this
 * one reports real infrastructure state (DB reachability, bot reachability,
 * signal-cli connection), which isn't something to expose to anonymous
 * visitors.
 */
export async function GET(event: APIEvent): Promise<Response> {
  const actingUser = await resolveActingUser(event.request);
  if (!actingUser) {
    return Response.json({ error: "unauthorized" } satisfies StatusResponse, { status: 401 });
  }
  if (!actingUser.isSiteAdmin) {
    return Response.json({ error: "forbidden" } satisfies StatusResponse, { status: 403 });
  }

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
