import { z } from "zod";
import { OrganizationJsonSchema } from "./organization.schema";

const OrganizationErrorSchema = z.object({
  error: z.enum([
    "unauthorized",
    "not_found",
    "forbidden",
    "validation",
    "name_taken",
    "internal_error",
  ]),
});

export const UpdateOrganizationResponseSchema = z.union([
  OrganizationJsonSchema,
  OrganizationErrorSchema,
]);
export type UpdateOrganizationResponse = z.infer<typeof UpdateOrganizationResponseSchema>;

export const DeleteOrganizationResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  OrganizationErrorSchema,
]);
export type DeleteOrganizationResponse = z.infer<typeof DeleteOrganizationResponseSchema>;
