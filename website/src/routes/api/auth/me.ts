import type { APIEvent } from "@solidjs/start/server";
import { authService } from "~/domain/auth/auth_service";

export type MeResponse = {
  user: { accountName: string; displayName: string } | null;
};

export async function GET(event: APIEvent): Promise<Response> {
  const user = await authService.getSessionUser(event.request.headers.get("cookie"));
  if (!user) {
    return Response.json({ user: null } satisfies MeResponse);
  }
  return Response.json({
    user: { accountName: user.accountName.value, displayName: user.displayName },
  } satisfies MeResponse);
}
