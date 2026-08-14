import type { APIEvent } from "@solidjs/start/server";
import { logout } from "~/domain/auth/service";

export async function POST(event: APIEvent): Promise<Response> {
  const setCookieHeaders = await logout(event.request.headers.get("cookie"));
  const headers = new Headers();
  for (const cookie of setCookieHeaders) {
    headers.append("set-cookie", cookie);
  }
  return new Response(null, { status: 204, headers });
}
