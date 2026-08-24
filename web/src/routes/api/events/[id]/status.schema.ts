import { z } from "zod";
import { EventJsonSchema } from "../event.schema";

export const SetEventStatusRequestSchema = z.object({
  status: z.enum(["hidden", "visible", "cancelled"]),
  cancelReason: z.string().nullable(),
});
export type SetEventStatusRequest = z.infer<typeof SetEventStatusRequestSchema>;

export const SetEventStatusResponseSchema = z.union([
  EventJsonSchema,
  z.object({
    error: z.enum(["unauthorized", "not_found", "forbidden", "validation", "internal_error"]),
  }),
]);
export type SetEventStatusResponse = z.infer<typeof SetEventStatusResponseSchema>;
