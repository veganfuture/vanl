import { z } from "zod";

/**
 * Split out from inspect.ts (rather than co-located with GET) so pages can
 * import the response schema without pulling in the route handler's
 * server-only dependency chain (authService -> postgres, node:fs config
 * reading) into the client bundle — a single value-import from a file with
 * such a side-effecting import graph drags the whole thing along, since a
 * module either fully evaluates or isn't included at all.
 */
export const SignupInspectResponseSchema = z.union([
  z.object({ aci: z.string() }),
  z.object({ error: z.enum(["invalid", "already_used", "internal_error"]) }),
]);
export type SignupInspectResponse = z.infer<typeof SignupInspectResponseSchema>;
