import type { APIEvent } from "@solidjs/start/server";
import { authService } from "~/domain/auth/auth_service";
import { SignupInspectResponseSchema, type SignupInspectResponse } from "./inspect.schema";

const ERROR_STATUS: Record<string, number> = {
  invalid: 400,
  already_used: 400,
  internal_error: 500,
};

export async function GET(event: APIEvent): Promise<Response> {
  const token = new URL(event.request.url).searchParams.get("token");
  if (!token) {
    return Response.json({ error: "invalid" } satisfies SignupInspectResponse, { status: 400 });
  }

  const result = await authService.inspectSignupToken(token);
  return result.match(
    (aci) => Response.json({ aci: aci.value } satisfies SignupInspectResponse),
    (error) =>
      Response.json({ error } satisfies SignupInspectResponse, { status: ERROR_STATUS[error] }),
  );
}
