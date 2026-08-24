import { z } from "zod";

/**
 * Split out from signup.ts (rather than co-located with POST) so pages can
 * import the request/response schemas without pulling in the route
 * handler's server-only dependency chain (authService -> postgres, node:fs
 * config reading) into the client bundle.
 */
export const SignupRequestSchema = z.object({
  token: z.string().min(1),
  accountName: z.string().min(1),
  email: z.string().min(1),
  displayName: z.string().min(1),
  affiliationsNote: z.string().nullable().optional(),
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const SignupResponseSchema = z.union([
  z.object({ accountName: z.string() }),
  z.object({
    error: z.enum([
      "invalid_token",
      "already_used",
      "account_name_taken",
      "validation",
      "internal_error",
    ]),
  }),
]);
export type SignupResponse = z.infer<typeof SignupResponseSchema>;
