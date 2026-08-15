import { z } from "zod";

export const SearchPlacesResponseSchema = z.object({
  places: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      municipalityName: z.string(),
      province: z.string(),
    }),
  ),
});
export type SearchPlacesResponse = z.infer<typeof SearchPlacesResponseSchema>;
