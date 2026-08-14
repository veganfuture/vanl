import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { authService } from "~/domain/auth/auth_service";
import { parseJsonBody } from "~/lib/http";

const RequestSchema = z.object({
  accountName: z.string().min(1),
  code: z.string().min(1),
});

const ERROR_STATUS: Record<string, number> = {
  account_not_found: 404,
  no_active_challenge: 401,
  wrong_code: 401,
  attempts_exhausted: 401,
};

export async function POST(event: APIEvent): Promise<Response> {
  const parsed = RequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" }, { status: 400 });
  }

  const result = await authService.verifyLogin(parsed.data.accountName, parsed.data.code);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: ERROR_STATUS[result.error] });
  }

  const headers = new Headers({ "content-type": "application/json" });
  for (const cookie of result.setCookieHeaders) {
    headers.append("set-cookie", cookie);
  }
  return new Response(JSON.stringify({ accountName: result.user.accountName }), { headers });
}
