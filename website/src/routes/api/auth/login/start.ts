import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { authService } from "~/domain/auth/auth_service";
import { parseJsonBody } from "~/lib/http";

const RequestSchema = z.object({ accountName: z.string().min(1) });

export async function POST(event: APIEvent): Promise<Response> {
  const parsed = RequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" }, { status: 400 });
  }

  const result = await authService.startLogin(parsed.data.accountName);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 404 });
  }
  return Response.json({ ok: true });
}
