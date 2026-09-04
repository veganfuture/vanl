import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { loadConfig } from "../src/lib/config";
import { ImageRepository, type NewImageInput } from "../src/domain/images/image_repository";
import { processUpload } from "../src/domain/images/image_processing";
import type { OrganizationId } from "../src/domain/organizations/organization_id";
import { LOGO_VARIANTS } from "../src/domain/organizations/organization_service";
import { OrganizationRepository } from "../src/domain/organizations/organization_repository";

/**
 * Preloads the database with a fixed set of real, well-known Dutch animal rights
 * and activism organizations - so ARC-imported events (see
 * import-arc-events.ts's detectOrganizer/ORGANIZER_RULES) have a real `organizations`
 * row to link to instead of just a free-text organizer_name guess. Idempotent -
 * upserts keyed on name, safe to re-run (e.g. to pick up a description/logo update).
 * Not run automatically in production - run by hand, same as seed-places.ts.
 *
 * Logo source images live under scripts/seed-assets/organizations/ (committed to
 * the repo, already through any org-specific pre-processing they need - see that
 * directory's own files) - deliberately not fetched from each org's own site at
 * seed time, so this script has no runtime dependency on external URLs.
 */

type OrgSeed = {
  name: string;
  slug: string;
  descriptionNl: string;
  descriptionEn: string;
  websiteUrl: string;
  logoAssetPath: string;
};

const ORGANIZATIONS: OrgSeed[] = [
  {
    name: "Anonymous for the Voiceless",
    slug: "anonymous-for-the-voiceless",
    websiteUrl: "https://www.anonymousforthevoiceless.org/",
    logoAssetPath: "scripts/seed-assets/organizations/anonymous-for-the-voiceless.png",
    descriptionEn:
      "Anonymous for the Voiceless (AV) is an international animal rights organisation known for " +
      'its "Cube of Truth" street outreach, where masked volunteers show footage of animal ' +
      "agriculture practices to passersby. Founded in 2016, it now has hundreds of active chapters " +
      "worldwide, including in cities such as Amsterdam, Eindhoven, Almere, Maastricht and " +
      "Rotterdam. Its aim is to educate the public about animal exploitation and encourage a shift " +
      "toward veganism through calm, non-confrontational activism.",
    descriptionNl:
      "Anonymous for the Voiceless (AV) is een internationale dierenrechtenorganisatie die bekend " +
      'staat om haar "Cube of Truth"-straatactivisme, waarbij gemaskerde vrijwilligers beelden van ' +
      "de vee-industrie tonen aan voorbijgangers. De organisatie werd in 2016 opgericht en heeft " +
      "inmiddels honderden actieve afdelingen wereldwijd, waaronder in steden als Amsterdam, " +
      "Eindhoven, Almere, Maastricht en Rotterdam. Het doel is het publiek te informeren over " +
      "dierenuitbuiting en mensen op een rustige, niet-confronterende manier aan te moedigen om " +
      "veganistisch te gaan leven.",
  },
  {
    name: "Vegan Future",
    slug: "vegan-future",
    websiteUrl: "https://veganfuture.org/",
    logoAssetPath: "scripts/seed-assets/organizations/vegan-future.png",
    descriptionEn:
      "Vegan Future organises street outreach and educational events to promote veganism as a " +
      "compassionate, practical and sustainable lifestyle, active in cities including Amsterdam, " +
      "Leiden and Haarlem. It also runs RAAF (Revolutionary Animal Advocacy Forum), a networking " +
      "event where activists share strategies and build community.",
    descriptionNl:
      "Vegan Future organiseert straatactivisme en educatieve evenementen om veganisme te " +
      "promoten als een meelevende, praktische en duurzame levensstijl, actief in onder meer " +
      "Amsterdam, Leiden en Haarlem. Daarnaast organiseert de organisatie RAAF (Revolutionary " +
      "Animal Advocacy Forum), een netwerkevenement waar activisten strategieën delen en een " +
      "gemeenschap opbouwen.",
  },
  {
    name: "XR Landbouw",
    slug: "xr-landbouw",
    websiteUrl: "https://extinctionrebellion.nl/community/xrlandbouw/",
    logoAssetPath: "scripts/seed-assets/organizations/xr-landbouw.jpg",
    descriptionEn:
      "XR Landbouw is the agriculture-focused working group of Extinction Rebellion Netherlands, " +
      "made up of farmers and citizens campaigning for a climate-neutral, agro-ecological food " +
      "system that strengthens rather than damages biodiversity. It uses nonviolent direct action, " +
      'including its long-running "Rabobank Rebellion" campaign, to pressure banks, government ' +
      "and agribusiness to end support for destructive industrial agriculture.",
    descriptionNl:
      "XR Landbouw is de landbouwwerkgroep van Extinction Rebellion Nederland, bestaande uit " +
      "boeren en burgers die actievoeren voor een klimaatneutraal, agro-ecologisch voedselsysteem " +
      "dat de biodiversiteit versterkt in plaats van aantast. De groep gebruikt geweldloze directe " +
      'actie, waaronder de langlopende campagne "Rabobank Rebellion", om banken, overheid en ' +
      "agro-industrie onder druk te zetten hun steun aan destructieve, industriële landbouw te " +
      "stoppen.",
  },
  {
    name: "Active for Justice",
    slug: "active-for-justice",
    websiteUrl: "https://activeforjustice.nl/",
    logoAssetPath: "scripts/seed-assets/organizations/active-for-justice.png",
    descriptionEn:
      "Active for Justice is a grassroots animal rights collective founded in 2016 in Maastricht, " +
      "the Netherlands. It organises direct actions, demonstrations and pressure campaigns, " +
      "including a nationwide campaign against foie gras suppliers, targeting industries that " +
      "exploit animals, framing animal liberation as part of a broader struggle against oppression " +
      "and hierarchy.",
    descriptionNl:
      "Active for Justice is een activistisch dierenrechtencollectief dat in 2016 in Maastricht is " +
      "opgericht. De groep organiseert directe acties, demonstraties en drukcampagnes, waaronder " +
      "een landelijke campagne tegen foie-gras-leveranciers, gericht tegen industrieën die dieren " +
      "uitbuiten, en ziet dierenbevrijding als onderdeel van een bredere strijd tegen onderdrukking " +
      "en hiërarchie.",
  },
  {
    name: "Animal Save",
    slug: "animal-save",
    websiteUrl: "https://savemovement.nl/",
    logoAssetPath: "scripts/seed-assets/organizations/animal-save.png",
    descriptionEn:
      "Animal Save Nederland is the Dutch chapter of the international Save Movement, a global " +
      "network of grassroots groups holding peaceful vigils for farmed animals being transported " +
      "to slaughterhouses. Volunteers bear witness to animals in transport trucks, offering water " +
      "and comfort where possible, while photographing and filming to raise public awareness. " +
      'Local groups, including in Tilburg, also run "Save Square" street outreach.',
    descriptionNl:
      "Animal Save Nederland is de Nederlandse afdeling van de internationale Save Movement, een " +
      "wereldwijd netwerk van basisbewegingen die vreedzame wakes houden voor landbouwhuisdieren " +
      "die naar het slachthuis worden vervoerd. Vrijwilligers staan de dieren in de veewagens bij, " +
      "met water en troost waar mogelijk, terwijl ze foto's en video's maken om het publiek bewust " +
      'te maken. Lokale groepen, waaronder in Tilburg, organiseren ook "Save Square"-straatactivisme.',
  },
  {
    name: "We The Free",
    slug: "we-the-free",
    websiteUrl: "https://www.activism.wtf/",
    logoAssetPath: "scripts/seed-assets/organizations/we-the-free.png",
    descriptionEn:
      "We The Free (WTF) is an international animal rights and vegan street-outreach community, " +
      "structured as a Community Interest Company registered in the UK, with local volunteer-led " +
      "teams in dozens of countries, including Dutch teams in Amsterdam, Utrecht, Arnhem and " +
      'Enschede. It focuses on innovative street-advocacy formats (e.g. the "WTF Diamond" and "3 ' +
      'Minute Movie Challenge"), digital campaigns, and a data-analytics tool (MyStats) letting ' +
      "activists track their impact.",
    descriptionNl:
      "We The Free (WTF) is een internationale gemeenschap voor dierenrechten- en veganistisch " +
      "straatactivisme, opgezet als een Community Interest Company in het Verenigd Koninkrijk, met " +
      "lokale, door vrijwilligers geleide teams in tientallen landen, waaronder Nederlandse teams " +
      "in Amsterdam, Utrecht, Arnhem en Enschede. De organisatie richt zich op vernieuwende vormen " +
      'van straatactivisme (zoals de "WTF Diamond" en de "3 Minute Movie Challenge"), digitale ' +
      "campagnes en de data-analysetool MyStats waarmee activisten hun impact bijhouden.",
  },
  {
    name: "Animal Equality",
    slug: "animal-equality",
    websiteUrl: "https://animalequality.org/",
    logoAssetPath: "scripts/seed-assets/organizations/animal-equality.png",
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

async function seedOrganizationLogo(
  organizationRepository: OrganizationRepository,
  imageRepository: ImageRepository,
  orgId: OrganizationId,
  logoAssetPath: string,
): Promise<void> {
  const bytes = await readFile(logoAssetPath);

  const processed = await processUpload(bytes, LOGO_VARIANTS);
  if (processed.isErr()) {
    throw new Error(`Failed to process logo "${logoAssetPath}": ${processed.error.message}`);
  }
  const [full, thumbnail] = processed.value;
  const inputs: NewImageInput[] = [full, thumbnail];
  const [fullImage, thumbnailImage] = await Promise.all(
    inputs.map(async (input) => {
      const result = await imageRepository.upsertImage(input);
      if (result.isErr()) {
        throw new Error(`Failed to upsert image "${logoAssetPath}": ${result.error.message}`);
      }
      return result.value;
    }),
  );

  const result = await organizationRepository.setOrganizationLogo(
    orgId,
    fullImage.sha256,
    thumbnailImage.sha256,
  );
  if (result.isErr()) {
    throw new Error(`Failed to set organization logo: ${result.error.message}`);
  }
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

  const organizationRepository = new OrganizationRepository(sql);
  const imageRepository = new ImageRepository(sql);

  try {
    for (const org of ORGANIZATIONS) {
      const upserted = await organizationRepository.upsertSeedOrganization({
        name: org.name,
        slug: org.slug,
        descriptionNl: org.descriptionNl,
        descriptionEn: org.descriptionEn,
        websiteUrl: org.websiteUrl,
      });
      if (upserted.isErr()) {
        throw new Error(`Failed to upsert organization "${org.name}": ${upserted.error.message}`);
      }

      await seedOrganizationLogo(
        organizationRepository,
        imageRepository,
        upserted.value.id,
        org.logoAssetPath,
      );

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
