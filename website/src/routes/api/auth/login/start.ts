import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { authService } from "~/domain/auth/auth_service";
import { parseJsonBody } from "~/lib/http";

export const LoginStartRequestSchema = z.object({ accountName: z.string().min(1) });
export type LoginStartRequest = z.infer<typeof LoginStartRequestSchema>;

export const LoginStartResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ error: z.enum(["account_not_found", "validation"]) }),
]);
export type LoginStartResponse = z.infer<typeof LoginStartResponseSchema>;

export async function POST(event: APIEvent): Promise<Response> {
  const parsed = LoginStartRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies LoginStartResponse, { status: 400 });
  }

  const result = await authService.startLogin(parsed.data.accountName);
  if ("error" in result) {
    return Response.json({ error: result.error } satisfies LoginStartResponse, { status: 404 });
  }
  return Response.json({ ok: true } satisfies LoginStartResponse);
}
