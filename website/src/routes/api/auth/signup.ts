import type { APIEvent } from "@solidjs/start/server";
import { authService } from "~/domain/auth/auth_service";
import { parseJsonBody } from "~/lib/http";
import { logger } from "~/lib/logger";
import { SignupRequestSchema, type SignupResponse } from "./signup.schema";

const ERROR_STATUS: Record<string, number> = {
  invalid_token: 400,
  already_used: 409,
  account_name_taken: 409,
  validation: 400,
  internal_error: 500,
};

export async function POST(event: APIEvent): Promise<Response> {
  const parsed = SignupRequestSchema.safeParse(await parseJsonBody(event.request));
  if (!parsed.success) {
    return Response.json({ error: "validation" } satisfies SignupResponse, { status: 400 });
  }

  const result = await authService.completeSignup({
    token: parsed.data.token,
    accountName: parsed.data.accountName,
    email: parsed.data.email,
    displayName: parsed.data.displayName,
    affiliationsNote: parsed.data.affiliationsNote ?? null,
  });

  return result.match(
    ({ user, setCookieHeaders }) => {
      logger.info({ accountName: user.accountName }, "account created via signup");
      const headers = new Headers({ "content-type": "application/json" });
      for (const cookie of setCookieHeaders) {
        headers.append("set-cookie", cookie);
      }
      const body: SignupResponse = { accountName: user.accountName.value };
      return new Response(JSON.stringify(body), { status: 201, headers });
    },
    (error) => Response.json({ error } satisfies SignupResponse, { status: ERROR_STATUS[error] }),
  );
}
