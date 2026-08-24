import { z } from "zod";
import { OrganizationJsonSchema } from "./organization.schema";

export const MyOrganizationsResponseSchema = z.object({
  organizations: z.array(OrganizationJsonSchema),
});
export type MyOrganizationsResponse = z.infer<typeof MyOrganizationsResponseSchema>;
