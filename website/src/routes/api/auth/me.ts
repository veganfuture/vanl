import type { APIEvent } from "@solidjs/start/server";
import { authService } from "~/domain/auth/auth_service";
import type { MeResponse } from "./me.schema";

export async function GET(event: APIEvent): Promise<Response> {
  const cookieHeader = event.request.headers.get("cookie");
  const sessionResult = await authService.getSessionUser(cookieHeader);
  const user = sessionResult.match(
    (u) => u,
    () => null,
  );
  if (!user) {
    return Response.json({ user: null } satisfies MeResponse);
  }

  const adminResult = await authService.isSiteAdmin(user.id);
  const isSiteAdmin = adminResult.match(
    (v) => v,
    () => false,
  );

  return Response.json({
    user: {
      id: user.id.value,
      accountName: user.accountName.value,
      displayName: user.displayName,
      isSiteAdmin,
    },
  } satisfies MeResponse);
}
