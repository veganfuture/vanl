import { z } from "zod";

/**
 * Split out (like every other *.schema.ts in this app) so the status page
 * can import it without pulling status.ts's server-only dependency chain
 * (db, bot-status client) into the client bundle.
 */
export const StatusComponentSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});

export const BotStatusComponentSchema = StatusComponentSchema.extend({
  signalConnected: z.boolean().optional(),
});

export const StatusResponseSchema = z.union([
  z.object({
    time: z.string(),
    web: z.object({ ok: z.literal(true) }),
    database: StatusComponentSchema,
    bot: BotStatusComponentSchema,
  }),
  z.object({ error: z.enum(["unauthorized", "forbidden"]) }),
]);
export type StatusResponse = z.infer<typeof StatusResponseSchema>;
