import { z } from "zod";
import { OrganizationJsonSchema } from "../organization.schema";

export const GetOrganizationBySlugResponseSchema = z.union([
  z.object({ organization: OrganizationJsonSchema }),
  z.object({ error: z.literal("not_found") }),
]);
export type GetOrganizationBySlugResponse = z.infer<typeof GetOrganizationBySlugResponseSchema>;
