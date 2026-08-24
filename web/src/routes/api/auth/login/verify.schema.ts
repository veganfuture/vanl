import { z } from "zod";

/**
 * Split out from verify.ts (rather than co-located with POST) so pages can
 * import the request/response schemas without pulling in the route
 * handler's server-only dependency chain (authService -> postgres, node:fs
 * config reading) into the client bundle.
 */
export const LoginVerifyRequestSchema = z.object({
  accountName: z.string().min(1),
  code: z.string().min(1),
});
export type LoginVerifyRequest = z.infer<typeof LoginVerifyRequestSchema>;

export const LoginVerifyResponseSchema = z.union([
  z.object({ accountName: z.string() }),
  z.object({
    error: z.enum([
      "account_not_found",
      "no_active_challenge",
      "wrong_code",
      "attempts_exhausted",
      "validation",
      "internal_error",
    ]),
  }),
]);
export type LoginVerifyResponse = z.infer<typeof LoginVerifyResponseSchema>;
