import type { APIEvent } from "@solidjs/start/server";
import { inspectSignupToken } from "~/domain/auth/service";

export async function GET(event: APIEvent): Promise<Response> {
  const token = new URL(event.request.url).searchParams.get("token");
  if (!token) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const result = await inspectSignupToken(token);
  if ("error" in result) {
    return Response.json(result, { status: 400 });
  }
  return Response.json(result);
}
