import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { authService } from "~/domain/auth/auth_service";

export const MeResponseSchema = z.object({
  user: z.object({ accountName: z.string(), displayName: z.string() }).nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export async function GET(event: APIEvent): Promise<Response> {
  const user = await authService.getSessionUser(event.request.headers.get("cookie"));
  if (!user) {
    return Response.json({ user: null } satisfies MeResponse);
  }
  return Response.json({
    user: { accountName: user.accountName.value, displayName: user.displayName },
  } satisfies MeResponse);
}
