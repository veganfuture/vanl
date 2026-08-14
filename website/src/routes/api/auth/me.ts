import type { APIEvent } from "@solidjs/start/server";
import { authService } from "~/domain/auth/auth_service";
import type { MeResponse } from "./me.schema";

export async function GET(event: APIEvent): Promise<Response> {
  const result = await authService.getSessionUser(event.request.headers.get("cookie"));
  return result.match(
    (user) =>
      Response.json({
        user: user ? { accountName: user.accountName.value, displayName: user.displayName } : null,
      } satisfies MeResponse),
    () => Response.json({ user: null } satisfies MeResponse),
  );
}
