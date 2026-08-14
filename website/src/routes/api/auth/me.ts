import type { APIEvent } from "@solidjs/start/server";
import { getSessionUser } from "~/domain/auth/service";

export async function GET(event: APIEvent): Promise<Response> {
  const user = await getSessionUser(event.request.headers.get("cookie"));
  if (!user) {
    return Response.json({ user: null });
  }
  return Response.json({
    user: { accountName: user.accountName, displayName: user.displayName },
  });
}
