import type { APIEvent } from "@solidjs/start/server";
import { z } from "zod";
import { authService } from "~/domain/auth/auth_service";

export const SignupInspectResponseSchema = z.union([
  z.object({ aci: z.string() }),
  z.object({ error: z.enum(["invalid", "already_used"]) }),
]);
export type SignupInspectResponse = z.infer<typeof SignupInspectResponseSchema>;

export async function GET(event: APIEvent): Promise<Response> {
  const token = new URL(event.request.url).searchParams.get("token");
  if (!token) {
    return Response.json({ error: "invalid" } satisfies SignupInspectResponse, { status: 400 });
  }

  const result = await authService.inspectSignupToken(token);
  if ("error" in result) {
    return Response.json({ error: result.error } satisfies SignupInspectResponse, {
      status: 400,
    });
  }
  return Response.json({ aci: result.aci.value } satisfies SignupInspectResponse);
}
