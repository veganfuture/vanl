import { z } from "zod";
import { EventJsonSchema } from "./event.schema";

const EventErrorSchema = z.object({
  error: z.enum(["unauthorized", "not_found", "forbidden", "validation", "internal_error"]),
});

export const UpdateEventResponseSchema = z.union([EventJsonSchema, EventErrorSchema]);
export type UpdateEventResponse = z.infer<typeof UpdateEventResponseSchema>;

export const DeleteEventResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  EventErrorSchema,
]);
export type DeleteEventResponse = z.infer<typeof DeleteEventResponseSchema>;
