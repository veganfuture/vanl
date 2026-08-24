import { z } from "zod";
import { OrganizationJsonSchema } from "./organization.schema";

export const ListOrganizationsResponseSchema = z.object({
  organizations: z.array(OrganizationJsonSchema),
});
export type ListOrganizationsResponse = z.infer<typeof ListOrganizationsResponseSchema>;

export const CreateOrganizationResponseSchema = z.union([
  OrganizationJsonSchema,
  z.object({ error: z.enum(["unauthorized", "validation", "name_taken", "internal_error"]) }),
]);
export type CreateOrganizationResponse = z.infer<typeof CreateOrganizationResponseSchema>;
