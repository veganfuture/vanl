import type { APIEvent } from "@solidjs/start/server";
import { authService } from "~/domain/auth/auth_service";

export async function POST(event: APIEvent): Promise<Response> {
  const result = await authService.logout(event.request.headers.get("cookie"));
  return result.match(
    (setCookieHeaders) => {
      const headers = new Headers();
      for (const cookie of setCookieHeaders) {
        headers.append("set-cookie", cookie);
      }
      return new Response(null, { status: 204, headers });
    },
    () => new Response(null, { status: 204 }),
  );
}
