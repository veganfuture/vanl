import { z } from "zod";
import { EventJsonSchema } from "../event.schema";

export const UploadFlyerResponseSchema = z.union([
  EventJsonSchema,
  z.object({
    error: z.enum(["unauthorized", "not_found", "forbidden", "validation", "internal_error"]),
  }),
]);
export type UploadFlyerResponse = z.infer<typeof UploadFlyerResponseSchema>;
