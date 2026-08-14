import type { APIEvent } from "@solidjs/start/server";
import { authService } from "~/domain/auth/auth_service";
import { parseJsonBody } from "~/lib/http";
import { LoginVerifyRequestSchema, type LoginVerifyResponse } from "./verify.schema";

const ERROR_STATUS: Record<string, number> = {
  account_not_found: 404,
  no_active_challenge: 401,
  wrong_code: 401,
  attempts_exhausted: 401,
  internal_error: 500,
};

export async function POST(event: APIEvent): Promise<Response> {
  const parsed = LoginVerifyRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies LoginVerifyResponse, { status: 400 });
  }

  const result = await authService.verifyLogin(parsed.data.accountName, parsed.data.code);
  return result.match(
    ({ user, setCookieHeaders }) => {
      const headers = new Headers({ "content-type": "application/json" });
      for (const cookie of setCookieHeaders) {
        headers.append("set-cookie", cookie);
      }
      const body: LoginVerifyResponse = { accountName: user.accountName.value };
      return new Response(JSON.stringify(body), { headers });
    },
    (error) =>
      Response.json({ error } satisfies LoginVerifyResponse, { status: ERROR_STATUS[error] }),
  );
}
