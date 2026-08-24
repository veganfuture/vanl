import { z } from "zod";

const MemberActionErrorSchema = z.object({
  error: z.enum([
    "unauthorized",
    "org_not_found",
    "member_not_found",
    "forbidden",
    "sole_admin",
    "validation",
    "internal_error",
  ]),
});

export const UpdateMemberRoleResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  MemberActionErrorSchema,
]);
export type UpdateMemberRoleResponse = z.infer<typeof UpdateMemberRoleResponseSchema>;

export const RemoveMemberResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  MemberActionErrorSchema,
]);
export type RemoveMemberResponse = z.infer<typeof RemoveMemberResponseSchema>;
