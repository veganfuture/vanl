import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { authService } from "~/domain/auth/auth_service";
import { parseJsonBody } from "~/lib/http";
import { logger } from "~/lib/logger";

const RequestSchema = z.object({
  token: z.string().min(1),
  accountName: z.string().min(1),
  email: z.string().min(1),
  displayName: z.string().min(1),
  affiliationsNote: z.string().nullable().optional(),
});

const ERROR_STATUS: Record<string, number> = {
  invalid_token: 400,
  already_used: 409,
  account_name_taken: 409,
  validation: 400,
};

export async function POST(event: APIEvent): Promise<Response> {
  const parsed = RequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" }, { status: 400 });
  }

  const result = await authService.completeSignup({
    token: parsed.data.token,
    accountName: parsed.data.accountName,
    email: parsed.data.email,
    displayName: parsed.data.displayName,
    affiliationsNote: parsed.data.affiliationsNote ?? null,
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: ERROR_STATUS[result.error] });
  }

  logger.info({ accountName: result.user.accountName }, "account created via signup");
  const headers = new Headers({ "content-type": "application/json" });
  for (const cookie of result.setCookieHeaders) {
    headers.append("set-cookie", cookie);
  }
  return new Response(JSON.stringify({ accountName: result.user.accountName }), {
    status: 201,
    headers,
  });
}
