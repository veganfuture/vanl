import { z } from "zod";
import { EventJsonSchema } from "./event.schema";

export const ListEventsResponseSchema = z.object({
  events: z.array(EventJsonSchema),
});
export type ListEventsResponse = z.infer<typeof ListEventsResponseSchema>;

export const CreateEventResponseSchema = z.union([
  EventJsonSchema,
  z.object({ error: z.enum(["unauthorized", "validation", "internal_error"]) }),
]);
export type CreateEventResponse = z.infer<typeof CreateEventResponseSchema>;
