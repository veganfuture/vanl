import postgres from "postgres";
import { z } from "zod";
import { loadConfig } from "../src/lib/config";

/**
 * Bulk-seeds the `places` table from pdok.nl's Locatieserver (the "free"
 * search endpoint, filtered to type:woonplaats) - the official, canonical
 * list of Dutch woonplaatsen. Not run automatically by `bun run migrate`;
 * run by hand (or re-run to pick up upstream renames/additions - it's an
 * idempotent upsert keyed on the PDOK woonplaatscode, safe to re-run).
 * See docs/milestones.md ADR-3.
 */

const PDOK_FREE_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const PAGE_SIZE = 100;

const ProvinceSchema = z.enum([
  "Drenthe",
  "Flevoland",
  "Friesland",
  "Gelderland",
  "Groningen",
  "Limburg",
  "Noord-Brabant",
  "Noord-Holland",
  "Overijssel",
  "Utrecht",
  "Zeeland",
  "Zuid-Holland",
]);

/**
 * PDOK's official province name for Friesland is the Frisian "Fryslân" -
 * everything else in provincienaam already matches our enum verbatim
 * (verified against the live API).
 */
const PDOK_PROVINCE_ALIASES: Record<string, z.infer<typeof ProvinceSchema>> = {
  Fryslân: "Friesland",
};

const PdokWoonplaatsSchema = z.object({
  woonplaatscode: z.string().min(1),
  woonplaatsnaam: z.string().min(1),
  gemeentenaam: z.string().min(1),
  provincienaam: z.string().min(1),
});

const PdokFreeResponseSchema = z.object({
  response: z.object({
    numFound: z.number().int().nonnegative(),
    docs: z.array(PdokWoonplaatsSchema),
  }),
});

type Place = {
  sourceId: string;
  name: string;
  municipalityName: string;
  province: z.infer<typeof ProvinceSchema>;
};

async function fetchAllPlaces(): Promise<Place[]> {
  const places: Place[] = [];
  let start = 0;

  while (true) {
    const url = new URL(PDOK_FREE_URL);
    url.searchParams.set("q", "*");
    url.searchParams.set("fq", "type:woonplaats");
    url.searchParams.set("rows", String(PAGE_SIZE));
    url.searchParams.set("start", String(start));
    url.searchParams.set("fl", "woonplaatscode,woonplaatsnaam,gemeentenaam,provincienaam");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`PDOK request failed: ${response.status} ${await response.text()}`);
    }
    const parsed = PdokFreeResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`Unexpected PDOK response shape: ${parsed.error.message}`);
    }

    for (const doc of parsed.data.response.docs) {
      const provinceName = PDOK_PROVINCE_ALIASES[doc.provincienaam] ?? doc.provincienaam;
      const province = ProvinceSchema.safeParse(provinceName);
      if (!province.success) {
        throw new Error(
          `Unrecognized province "${doc.provincienaam}" for woonplaats "${doc.woonplaatsnaam}" ` +
            `(${doc.woonplaatscode}) - update ProvinceSchema/PDOK_PROVINCE_ALIASES`,
        );
      }
      places.push({
        sourceId: doc.woonplaatscode,
        name: doc.woonplaatsnaam,
        municipalityName: doc.gemeentenaam,
        province: province.data,
      });
    }

    start += PAGE_SIZE;
    if (start >= parsed.data.response.numFound) {
      break;
    }
  }

  return places;
}

async function main(): Promise<void> {
  console.log("Fetching woonplaatsen from PDOK...");
  const places = await fetchAllPlaces();
  console.log(`Fetched ${places.length} places.`);

  const config = loadConfig();
  const sql = postgres({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    username: config.database.user,
    password: process.env.VANL_DATABASE_PASSWORD ?? "",
  });

  try {
    for (const place of places) {
      await sql`
        insert into places (name, municipality_name, province, source_id)
        values (${place.name}, ${place.municipalityName}, ${place.province}, ${place.sourceId})
        on conflict (source_id) do update set
          name = excluded.name,
          municipality_name = excluded.municipality_name,
          province = excluded.province
      `;
    }
    console.log(`Upserted ${places.length} places into the database.`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
