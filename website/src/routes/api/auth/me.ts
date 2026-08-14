import type { APIEvent } from "@solidjs/start/server";
import { authService } from "~/domain/auth/auth_service";

export async function GET(event: APIEvent): Promise<Response> {
  const user = await authService.getSessionUser(event.request.headers.get("cookie"));
  if (!user) {
    return Response.json({ user: null });
  }
  return Response.json({
    user: { accountName: user.accountName, displayName: user.displayName },
  });
}
