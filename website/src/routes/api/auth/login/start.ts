import type { APIEvent } from "@solidjs/start/server";
import { authService } from "~/domain/auth/auth_service";
import { getClientIp, parseJsonBody } from "~/lib/http";
import { LoginStartRequestSchema, type LoginStartResponse } from "./start.schema";

const ERROR_STATUS: Record<string, number> = {
  account_not_found: 404,
  rate_limited: 429,
  internal_error: 500,
};

export async function POST(event: APIEvent): Promise<Response> {
  const parsed = LoginStartRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies LoginStartResponse, { status: 400 });
  }

  const result = await authService.startLogin(parsed.data.accountName, getClientIp(event.request));
  return result.match(
    () => Response.json({ ok: true } satisfies LoginStartResponse),
    (error) =>
      Response.json({ error } satisfies LoginStartResponse, { status: ERROR_STATUS[error] }),
  );
}
