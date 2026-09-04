import postgres from "postgres";
import sharp from "sharp";
import { loadConfig } from "../src/lib/config";
import { ImageRepository, type NewImageInput } from "../src/domain/images/image_repository";
import { processUpload } from "../src/domain/images/image_processing";
import { LOGO_VARIANTS } from "../src/domain/organizations/organization_service";
import { OrganizationId } from "../src/domain/organizations/organization_id";

/**
 * Preloads the database with a fixed set of real, well-known Dutch/Belgian animal
 * rights and activism organizations - so ARC-imported events (see
 * import-arc-events.ts's detectOrganizer/ORGANIZER_RULES) have a real `organizations`
 * row to link to instead of just a free-text organizer_name guess. Idempotent -
 * upserts keyed on name, safe to re-run (e.g. to pick up a description/logo update).
 * Not run automatically in production - run by hand, same as seed-places.ts.
 */

type OrgSeed = {
  name: string;
  slug: string;
  descriptionNl: string;
  descriptionEn: string;
  websiteUrl: string;
  logoUrl: string;
  /** Only set when the fetched logo needs pre-processing before it can go through processUpload's jpeg/png/webp-only pipeline. */
  prepareLogo?: (bytes: Buffer) => Promise<Buffer>;
};

const DARK_BACKING_SIZE = 512;

/**
 * Anonymous for the Voiceless's only official logo is white-on-transparent (their
 * own site header) - invisible on this platform's light cards/backgrounds, so it
 * gets composited onto a small dark rounded square first (verified by hand: at
 * default LOGO_VARIANTS sizes a plain square backing plate reads fine as a logo
 * tile, no need for actual corner-rounding).
 */
async function addDarkBackingPlate(bytes: Buffer): Promise<Buffer> {
  const padded = Math.round(DARK_BACKING_SIZE * 0.8);
  const logo = await sharp(bytes).resize(padded, padded, { fit: "inside" }).toBuffer();
  return sharp({
    create: {
      width: DARK_BACKING_SIZE,
      height: DARK_BACKING_SIZE,
      channels: 4,
      background: { r: 17, g: 17, b: 17, alpha: 1 },
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

/**
 * processUpload deliberately rejects SVG input (see image_processing.ts's
 * ALLOWED_INPUT_FORMATS / docs/threat-model.md) since it's normally fed
 * user-uploaded bytes - but this script's logoUrls are hardcoded, curated
 * constants below, not user input, so rasterizing here first is safe.
 */
async function rasterizeSvg(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes, { density: 384 }).png().toBuffer();
}

const ORGANIZATIONS: OrgSeed[] = [
  {
    name: "Anonymous for the Voiceless",
    slug: "anonymous-for-the-voiceless",
    websiteUrl: "https://www.anonymousforthevoiceless.org/",
    logoUrl:
      "https://images.squarespace-cdn.com/content/v1/5815cb5b197aea6c5f13a2d0/1556924489351-QDV744Z6QDVVVJH4O3XY/AV-Symbol-White-Transparent-Website.png",
    prepareLogo: addDarkBackingPlate,
    descriptionEn:
      "Anonymous for the Voiceless (AV) is an international animal rights organisation known for " +
      'its "Cube of Truth" street outreach, where masked volunteers show footage of animal ' +
      "agriculture practices to passersby. Founded in 2016, it now has hundreds of active chapters " +
      "worldwide, including in Amsterdam and cities across Belgium. Its aim is to educate the " +
      "public about animal exploitation and encourage a shift toward veganism through calm, " +
      "non-confrontational activism.",
    descriptionNl:
      "Anonymous for the Voiceless (AV) is een internationale dierenrechtenorganisatie die bekend " +
      'staat om haar "Cube of Truth"-straatactivisme, waarbij gemaskerde vrijwilligers beelden van ' +
      "de vee-industrie tonen aan voorbijgangers. De organisatie werd in 2016 opgericht en heeft " +
      "inmiddels honderden actieve afdelingen wereldwijd, waaronder in Amsterdam en diverse " +
      "Belgische steden. Het doel is het publiek te informeren over dierenuitbuiting en mensen op " +
      "een rustige, niet-confronterende manier aan te moedigen om veganistisch te gaan leven.",
  },
  {
    name: "Vegan Future",
    slug: "vegan-future",
    websiteUrl: "https://veganfuture.org/",
    logoUrl: "https://veganfuture.org/vf_logo_web.png",
    descriptionEn:
      "Vegan Future organises street outreach, leafleting, and educational events to promote " +
      "veganism as a compassionate, practical and sustainable lifestyle. It also runs RAAF " +
      "(Revolutionary Animal Advocacy Forum), a networking event where activists share strategies " +
      "and build community.",
    descriptionNl:
      "Vegan Future organiseert straatactivisme, het uitdelen van flyers en educatieve evenementen " +
      "om veganisme te promoten als een meelevende, praktische en duurzame levensstijl. Daarnaast " +
      "organiseert de organisatie RAAF (Revolutionary Animal Advocacy Forum), een netwerkevenement " +
      "waar activisten strategieën delen en een gemeenschap opbouwen.",
  },
  {
    name: "XR Landbouw",
    slug: "xr-landbouw",
    websiteUrl: "https://extinctionrebellion.nl/community/xrlandbouw/",
    logoUrl: "https://extinctionrebellion.nl/app/uploads/2020/07/XR-Landbouw_Groen-scaled.jpg",
    descriptionEn:
      "XR Landbouw is the agriculture-focused working group of Extinction Rebellion Netherlands, " +
      "made up of farmers and citizens campaigning for a climate-neutral, agro-ecological food " +
      "system that strengthens rather than damages biodiversity. It uses nonviolent direct action " +
      '- including its long-running "Rabobank Rebellion" campaign - to pressure banks, government ' +
      "and agribusiness to end support for destructive industrial agriculture.",
    descriptionNl:
      "XR Landbouw is de landbouwwerkgroep van Extinction Rebellion Nederland, bestaande uit " +
      "boeren en burgers die actievoeren voor een klimaatneutraal, agro-ecologisch voedselsysteem " +
      "dat de biodiversiteit versterkt in plaats van aantast. De groep gebruikt geweldloze directe " +
      'actie - waaronder de langlopende campagne "Rabobank Rebellion" - om banken, overheid en ' +
      "agro-industrie onder druk te zetten hun steun aan destructieve, industriële landbouw te " +
      "stoppen.",
  },
  {
    name: "Active for Justice",
    slug: "active-for-justice",
    websiteUrl: "https://activeforjustice.nl/",
    logoUrl: "https://activeforjustice.nl/wp-content/uploads/2025/08/cropped-logo-192x192.png",
    descriptionEn:
      "Active for Justice is a grassroots animal rights collective founded in 2016 in Maastricht, " +
      "the Netherlands. It organises direct actions, demonstrations and pressure campaigns - such " +
      "as a nationwide campaign against foie gras suppliers - targeting industries that exploit " +
      "animals, framing animal liberation as part of a broader struggle against oppression and " +
      "hierarchy.",
    descriptionNl:
      "Active for Justice is een activistisch dierenrechtencollectief dat in 2016 in Maastricht is " +
      "opgericht. De groep organiseert directe acties, demonstraties en drukcampagnes - zoals een " +
      "landelijke campagne tegen foie-gras-leveranciers - gericht tegen industrieën die dieren " +
      "uitbuiten, en ziet dierenbevrijding als onderdeel van een bredere strijd tegen onderdrukking " +
      "en hiërarchie.",
  },
  {
    name: "Animal Save",
    slug: "animal-save",
    websiteUrl: "https://savemovement.nl/",
    logoUrl: "https://savemovement.nl/wp-content/uploads/logo-animal-save-movement.png",
    descriptionEn:
      "Animal Save Nederland is the Dutch chapter of the international Save Movement, a global " +
      "network of grassroots groups holding peaceful vigils for farmed animals being transported " +
      "to slaughterhouses. Volunteers bear witness to animals in transport trucks - offering water " +
      "and comfort where possible - while photographing and filming to raise public awareness. " +
      'Local groups, including in Amsterdam, also run "Save Square" street outreach.',
    descriptionNl:
      "Animal Save Nederland is de Nederlandse afdeling van de internationale Save Movement, een " +
      "wereldwijd netwerk van basisbewegingen die vreedzame wakes houden voor landbouwhuisdieren " +
      "die naar het slachthuis worden vervoerd. Vrijwilligers staan de dieren in de veewagens bij " +
      "- met water en troost waar mogelijk - terwijl ze foto's en video's maken om het publiek " +
      'bewust te maken. Lokale groepen, waaronder in Amsterdam, organiseren ook "Save ' +
      'Square"-straatactivisme.',
  },
  {
    name: "We The Free",
    slug: "we-the-free",
    websiteUrl: "https://www.activism.wtf/",
    logoUrl:
      "https://assets.nationbuilder.com/wethefree/sites/37/meta_images/original/High_Res_WTF_NEW_LOGOS_%281%29.png",
    descriptionEn:
      "We The Free (WTF) is an international animal rights and vegan street-outreach community, " +
      "structured as a Community Interest Company registered in the UK, with local volunteer-led " +
      "teams in dozens of countries - including Belgian teams in Ghent and Liège. It focuses on " +
      'innovative street-advocacy formats (e.g. the "WTF Diamond" and "3 Minute Movie Challenge"), ' +
      "digital campaigns, and a data-analytics tool (MyStats) letting activists track their impact.",
    descriptionNl:
      "We The Free (WTF) is een internationale gemeenschap voor dierenrechten- en veganistisch " +
      "straatactivisme, opgezet als een Community Interest Company in het Verenigd Koninkrijk, met " +
      "lokale, door vrijwilligers geleide teams in tientallen landen - waaronder Belgische teams in " +
      "Gent en Luik. De organisatie richt zich op vernieuwende vormen van straatactivisme (zoals de " +
      '"WTF Diamond" en de "3 Minute Movie Challenge"), digitale campagnes en de data-analysetool ' +
      "MyStats waarmee activisten hun impact bijhouden.",
  },
  {
    name: "Animal Equality",
    slug: "animal-equality",
    websiteUrl: "https://animalequality.org/",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/2/2e/Animal_Equality_Logo.svg",
    prepareLogo: rasterizeSvg,
    descriptionEn:
      "Animal Equality is an international animal protection organisation, founded in 2006, that " +
      "works with society, governments, and companies to end cruelty toward farmed animals. It is " +
      "known for undercover investigations into factory farms and slaughterhouses, corporate " +
      "campaigns (e.g. pressuring Ahold Delhaize on animal welfare commitments in the Netherlands), " +
      "and public education programmes across Europe, the Americas, and Asia.",
    descriptionNl:
      "Animal Equality is een internationale dierenbeschermingsorganisatie, opgericht in 2006, die " +
      "samenwerkt met de samenleving, overheden en bedrijven om een einde te maken aan de wreedheid " +
      "tegenover landbouwhuisdieren. De organisatie staat bekend om undercoveronderzoeken in " +
      "fabrieksboerderijen en slachthuizen, campagnes gericht op bedrijven (zoals druk op Ahold " +
      "Delhaize om dierenwelzijnsbeloften in Nederland na te komen), en publieksvoorlichting in " +
      "Europa, Amerika en Azië.",
  },
];

async function fetchBytes(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function upsertOrg(sql: postgres.Sql, org: OrgSeed): Promise<string> {
  const [row] = await sql`
    insert into organizations (name, slug, description_nl, description_en, website_url)
    values (${org.name}, ${org.slug}, ${org.descriptionNl}, ${org.descriptionEn}, ${org.websiteUrl})
    on conflict (name) do update set
      slug = excluded.slug,
      description_nl = excluded.description_nl,
      description_en = excluded.description_en,
      website_url = excluded.website_url
    returning id
  `;
  return row.id as string;
}

async function upsertLogo(
  imageRepository: ImageRepository,
  variants: readonly {
    sha256: string;
    bytes: Buffer;
    mime: string;
    width: number;
    height: number;
  }[],
): Promise<{ fullSha256: string; thumbnailSha256: string }> {
  const [full, thumbnail] = variants;
  const inputs: NewImageInput[] = [full, thumbnail];
  const [fullImage, thumbnailImage] = await Promise.all(
    inputs.map(async (input) => {
      const result = await imageRepository.upsertImage(input);
      if (result.isErr()) {
        throw new Error(`Failed to upsert image: ${result.error.message}`);
      }
      return result.value;
    }),
  );
  return { fullSha256: fullImage.sha256, thumbnailSha256: thumbnailImage.sha256 };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const sql = postgres({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    username: config.database.user,
    password: process.env.VANL_DATABASE_PASSWORD ?? "",
  });

  const imageRepository = new ImageRepository(sql);

  try {
    for (const org of ORGANIZATIONS) {
      const orgIdString = await upsertOrg(sql, org);
      const orgId = OrganizationId.from_string(orgIdString)._unsafeUnwrap();

      const rawBytes = await fetchBytes(org.logoUrl);
      const logoBytes = org.prepareLogo ? await org.prepareLogo(rawBytes) : rawBytes;

      const processed = await processUpload(logoBytes, LOGO_VARIANTS);
      if (processed.isErr()) {
        throw new Error(`Failed to process logo for "${org.name}": ${processed.error.message}`);
      }
      const { fullSha256, thumbnailSha256 } = await upsertLogo(imageRepository, processed.value);

      await sql`
        update organizations set
          logo_full_image_id = ${fullSha256},
          logo_thumbnail_image_id = ${thumbnailSha256},
          updated_at = now()
        where id = ${orgId.value}
      `;

      console.log(`Seeded organization "${org.name}" (${org.slug})`);
    }
    console.log(`Seeded ${ORGANIZATIONS.length} organizations.`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
