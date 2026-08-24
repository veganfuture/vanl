import { z } from "zod";
import { EventJsonSchema } from "../event.schema";

export const GetEventBySlugResponseSchema = z.union([
  z.object({ event: EventJsonSchema }),
  z.object({ error: z.literal("not_found") }),
]);
export type GetEventBySlugResponse = z.infer<typeof GetEventBySlugResponseSchema>;
