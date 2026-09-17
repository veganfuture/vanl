import type { Uuid } from "~/lib/uuid";

export type Place = {
  id: Uuid;
  name: string;
  municipalityName: string;
  province: string;
};
