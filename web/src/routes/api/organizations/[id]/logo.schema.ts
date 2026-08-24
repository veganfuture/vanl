import { z } from "zod";
import { OrganizationJsonSchema } from "../organization.schema";

export const UploadLogoResponseSchema = z.union([
  OrganizationJsonSchema,
  z.object({
    error: z.enum(["unauthorized", "not_found", "forbidden", "validation", "internal_error"]),
  }),
]);
export type UploadLogoResponse = z.infer<typeof UploadLogoResponseSchema>;
