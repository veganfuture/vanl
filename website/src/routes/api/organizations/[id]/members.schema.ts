import { z } from "zod";
import { MembershipJsonSchema } from "../organization.schema";

const MembersErrorSchema = z.object({
  error: z.enum(["unauthorized", "org_not_found", "forbidden", "validation", "internal_error"]),
});

export const ListMembersResponseSchema = z.union([
  z.object({ members: z.array(MembershipJsonSchema) }),
  MembersErrorSchema,
]);
export type ListMembersResponse = z.infer<typeof ListMembersResponseSchema>;

export const AddMemberResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({
    error: z.enum([
      "unauthorized",
      "org_not_found",
      "account_not_found",
      "already_member",
      "forbidden",
      "validation",
      "internal_error",
    ]),
  }),
]);
export type AddMemberResponse = z.infer<typeof AddMemberResponseSchema>;
