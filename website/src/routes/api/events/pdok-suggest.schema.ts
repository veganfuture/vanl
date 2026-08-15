import { z } from "zod";

export const PdokSuggestResponseSchema = z.object({
  suggestions: z.array(z.object({ pdokId: z.string(), label: z.string() })),
});
export type PdokSuggestResponse = z.infer<typeof PdokSuggestResponseSchema>;
