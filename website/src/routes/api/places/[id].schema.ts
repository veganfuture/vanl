import { z } from "zod";

export const GetPlaceResponseSchema = z.union([
  z.object({
    place: z.object({
      id: z.string(),
      name: z.string(),
      municipalityName: z.string(),
      province: z.string(),
    }),
  }),
  z.object({ error: z.literal("not_found") }),
]);
export type GetPlaceResponse = z.infer<typeof GetPlaceResponseSchema>;
