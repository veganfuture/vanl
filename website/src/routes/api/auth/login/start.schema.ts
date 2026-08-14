import { z } from "zod";

/**
 * Split out from start.ts (rather than co-located with POST) so pages can
 * import the request/response schemas without pulling in the route
 * handler's server-only dependency chain (authService -> postgres, node:fs
 * config reading) into the client bundle.
 */
export const LoginStartRequestSchema = z.object({ accountName: z.string().min(1) });
export type LoginStartRequest = z.infer<typeof LoginStartRequestSchema>;

export const LoginStartResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ error: z.enum(["account_not_found", "validation", "internal_error"]) }),
]);
export type LoginStartResponse = z.infer<typeof LoginStartResponseSchema>;
