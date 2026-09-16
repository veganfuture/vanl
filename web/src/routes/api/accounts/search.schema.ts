import { z } from "zod";

export const SearchAccountsResponseSchema = z.object({
  accounts: z.array(
    z.object({
      accountName: z.string(),
      displayName: z.string(),
    }),
  ),
});
export type SearchAccountsResponse = z.infer<typeof SearchAccountsResponseSchema>;
