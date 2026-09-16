import { z } from "zod";
import { EventJsonSchema } from "../event.schema";

/** POST /api/events/[id]/org body - which org to attach the event to. */
export const SetEventOrgRequestSchema = z.object({
  orgId: z.string().uuid(),
});
export type SetEventOrgRequest = z.infer<typeof SetEventOrgRequestSchema>;

/** Shared error shape for both POST (attach) and DELETE (detach). */
const EventOrgErrorSchema = z.object({
  error: z.enum([
    "unauthorized",
    "not_found",
    "org_not_found",
    "forbidden",
    "already_in_org",
    "not_in_org",
    "validation",
    "internal_error",
  ]),
});

export const EventOrgResponseSchema = z.union([EventJsonSchema, EventOrgErrorSchema]);
export type EventOrgResponse = z.infer<typeof EventOrgResponseSchema>;
