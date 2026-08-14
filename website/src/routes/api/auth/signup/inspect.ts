import type { APIEvent } from "@solidjs/start/server";
import { authService } from "~/domain/auth/auth_service";

export async function GET(event: APIEvent): Promise<Response> {
  const token = new URL(event.request.url).searchParams.get("token");
  if (!token) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const result = await authService.inspectSignupToken(token);
  if ("error" in result) {
    return Response.json(result, { status: 400 });
  }
  return Response.json(result);
}
