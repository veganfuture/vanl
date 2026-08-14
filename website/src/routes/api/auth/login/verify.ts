import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { authService } from "~/domain/auth/auth_service";
import { parseJsonBody } from "~/lib/http";

export const LoginVerifyRequestSchema = z.object({
  accountName: z.string().min(1),
  code: z.string().min(1),
});
export type LoginVerifyRequest = z.infer<typeof LoginVerifyRequestSchema>;

export type LoginVerifyResponse =
  | { accountName: string }
  | {
      error:
        | "account_not_found"
        | "no_active_challenge"
        | "wrong_code"
        | "attempts_exhausted"
        | "validation";
    };

const ERROR_STATUS: Record<string, number> = {
  account_not_found: 404,
  no_active_challenge: 401,
  wrong_code: 401,
  attempts_exhausted: 401,
};

export async function POST(event: APIEvent): Promise<Response> {
  const parsed = LoginVerifyRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies LoginVerifyResponse, { status: 400 });
  }

  const result = await authService.verifyLogin(parsed.data.accountName, parsed.data.code);
  if ("error" in result) {
    return Response.json({ error: result.error } satisfies LoginVerifyResponse, {
      status: ERROR_STATUS[result.error],
    });
  }

  const headers = new Headers({ "content-type": "application/json" });
  for (const cookie of result.setCookieHeaders) {
    headers.append("set-cookie", cookie);
  }
  const body: LoginVerifyResponse = { accountName: result.user.accountName.value };
  return new Response(JSON.stringify(body), { headers });
}
