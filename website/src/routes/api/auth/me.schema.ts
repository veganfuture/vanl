import { z } from "zod";

/**
 * Split out from me.ts (rather than co-located with GET) so pages can
 * import the response schema without pulling in the route handler's
 * server-only dependency chain (authService -> postgres, node:fs config
 * reading) into the client bundle.
 */
export const MeResponseSchema = z.object({
  user: z.object({ accountName: z.string(), displayName: z.string() }).nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
