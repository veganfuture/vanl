import { z } from "zod";

/**
 * Split out (like every other *.schema.ts in this app) so pages can import
 * it without pulling the route handlers' server-only dependency chain into
 * the client bundle - see src/routes/api/organizations/organization.schema.ts
 * for the same pattern. account_name is intentionally not part of the
 * request schema below - it's not editable from this page.
 */
export const AccountJsonSchema = z.object({
  id: z.string(),
  accountName: z.string(),
  email: z.string(),
  displayName: z.string(),
  affiliationsNote: z.string().nullable(),
  createdAt: z.string(),
});
export type AccountJson = z.infer<typeof AccountJsonSchema>;

const AccountErrorSchema = z.object({
  error: z.enum(["unauthorized", "validation", "internal_error"]),
});

export const GetAccountResponseSchema = z.union([
  z.object({ account: AccountJsonSchema }),
  AccountErrorSchema,
]);
export type GetAccountResponse = z.infer<typeof GetAccountResponseSchema>;

/** PATCH /api/account body. */
export const UpdateAccountRequestSchema = z.object({
  email: z.string().min(1),
  displayName: z.string().min(1),
  affiliationsNote: z.string().nullable(),
});
export type UpdateAccountRequest = z.infer<typeof UpdateAccountRequestSchema>;

export const UpdateAccountResponseSchema = z.union([
  z.object({ account: AccountJsonSchema }),
  AccountErrorSchema,
]);
export type UpdateAccountResponse = z.infer<typeof UpdateAccountResponseSchema>;
