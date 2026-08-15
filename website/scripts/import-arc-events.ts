import postgres from "postgres";
import nodeIcal, { type ParameterValue, type VEvent } from "node-ical";
import { Command } from "commander";
import { okAsync, type Result } from "neverthrow";
import { loadConfig } from "../src/lib/config";
import { AccountName } from "../src/domain/auth/account_name";
import { AuthRepository } from "../src/domain/auth/auth_repository";
import { SignalAci } from "../src/domain/auth/signal_aci";
import type { UserId } from "../src/domain/auth/user_id";
import { EventRepository, type NewEventInput } from "../src/domain/events/event_repository";
import { PlaceRepository } from "../src/domain/places/place_repository";
import { reverseGeocode } from "../src/domain/events/pdok-client";
import { generateSlug } from "../src/domain/events/slug";
import { validateEvent, type ValidatableEvent } from "../src/shared/events/event_validation";

/**
 * Imports events from animalrightscalendar.com (ARC) into our events table.
 * Idempotent - safe to re-run; each ARC event is upserted, keyed on
 * (source, external_source_id) (see migrations/0002_events.sql). Run by hand
 * (e.g. cron), not part of `bun run migrate`.
 *
 * ARC publishes each event as two separate VEVENTs, one per language,
 * sharing the same start/end/location but with different UIDs. We group by
 * (start, end, location) to recombine them into one bilingual Event; a
 * group can also be a single VEVENT (only one language given) or, rarely, a
 * true duplicate posting (two VEVENTs, same language, same everything) -
 * see detectRealEvents below.
 *
 * ARC's 200km search radius (centered on Lunteren) reaches into Germany and
 * Belgium - see NL_DISTANCE_THRESHOLD_METERS below for how those get
 * filtered out.
 */

const ARC_FEED_URL =
  "https://animalrightscalendar.com/cal?coordinates=5.62222%2C52.085&city=Lunteren+%F0%9F%87%B3%F0%9F%87%B1&timezone=Europe%2FAmsterdam&radius=200&showOnlineEvents=false";

const EVENT_SOURCE = "animalrightscalendar.com";

/**
 * How country filtering works: PDOK's Locatieserver only indexes Dutch
 * addresses, so reverseGeocode(lat, lng) always returns the *nearest* Dutch
 * address to a coordinate, however far away that actually is - its
 * distanceMeters is therefore also a "how far outside the Netherlands is
 * this point" signal, not just a precision measure. A genuinely Dutch
 * coordinate has a real address right there; a German or Belgian one only
 * matches whatever's closest across the border.
 *
 * Verified against this feed by hand before picking a threshold: every
 * genuinely-Dutch coordinate resolved within 243m; the closest actual
 * cross-border event - Aachen, Germany, just past Vaals - resolved at
 * 3.7km. That leaves a gap between 243m and 3.7km; 2km sits in the middle
 * of it. If a re-run ever misclassifies a real event, that gap is the
 * first thing to re-check (has ARC started listing closer-to-the-border
 * events than it did during that check?), not just the number itself.
 *
 * (An earlier version of this survey put the worst genuinely-Dutch case at
 * 3.7km too, which is what originally justified a 5km threshold - that
 * turned out to be *this exact Aachen coordinate*, silently misclassified
 * as Dutch because AddressDocFields required `postcode` and PDOK's doc for
 * it happened to omit that field, so the whole response failed to parse
 * and got swallowed into "no match" instead of surfacing its real,
 * comfortably-non-Dutch distance. Fixed by making `postcode` optional in
 * pdok-client.ts - lesson being: a threshold is only as good as the data
 * that produced it, and a swallowed error can look exactly like a
 * legitimate data point until something forces it to surface.)
 */
const NL_DISTANCE_THRESHOLD_METERS = 2000;

/** Fixed, well-known system account used as publisher/created_by/updated_by for every imported event. */
const IMPORT_BOT_SIGNAL_ACI = "bded156e-9835-44ca-a791-827b42177f36";
const IMPORT_BOT_ACCOUNT_NAME = "arc-import";

type Geo = { lat: number; lon: number };

function textOf(value: ParameterValue<string> | undefined): string | null {
  if (value === undefined) return null;
  const text = typeof value === "string" ? value : value.val;
  return text.trim() || null;
}

function geoOf(event: VEvent): Geo | null {
  const geo = event.geo as { lat?: unknown; lon?: unknown } | undefined;
  if (typeof geo?.lat !== "number" || typeof geo?.lon !== "number") return null;
  return { lat: geo.lat, lon: geo.lon };
}

const NL_WORDS =
  /\b(de|het|een|van|voor|met|niet|wordt|worden|dat|dit|wij|zijn|ons|jij|bij|en|op|te|is|je)\b/gi;
const EN_WORDS = /\b(the|and|with|from|that|this|we|are|our|you|at|is|of|to|for|will|have)\b/gi;

/** Word-frequency heuristic - reliable given each event has a full paragraph of running text. */
function detectLanguage(event: VEvent): "nl" | "en" {
  const text = `${textOf(event.summary) ?? ""} ${textOf(event.description) ?? ""}`;
  const nl = (text.match(NL_WORDS) ?? []).length;
  const en = (text.match(EN_WORDS) ?? []).length;
  return nl >= en ? "nl" : "en";
}

/**
 * Second opinion, not the primary filter: a plain-text country mention is
 * too unreliable to decide anything on its own (plenty of genuine German
 * events in this feed give only a German postcode/city, no country word at
 * all, and plenty of genuine Dutch ones likewise omit it) - see
 * NL_DISTANCE_THRESHOLD_METERS for why distance is the real signal, and why
 * this can only ever veto an event distance already resolved as Dutch, never
 * approve one distance rejected. Catching the geo filter disagreeing with an
 * *explicit* country name in the event's own location text is exactly the
 * kind of thing a bad coordinate or a regressed threshold would produce
 * (see the Aachen incident in NL_DISTANCE_THRESHOLD_METERS's comment) - so
 * on a mismatch, skip rather than trust the geo filter over the event's own
 * stated location.
 */
const FOREIGN_COUNTRY_RE = /\b(Germany|Deutschland|Belgium|Belgique|Belgi[eë])\b/i;

function mentionsForeignCountry(location: string): string | null {
  return FOREIGN_COUNTRY_RE.exec(location)?.[0] ?? null;
}

/**
 * ARC's own LOCATION text is occasionally just the raw lat/lon as a string
 * (e.g. "51.441560, 5.478300") instead of a real address - a data gap in
 * their feed specifically, not something ARC's own event pages show. When
 * that happens we already have a far better answer sitting right there:
 * the same PDOK reverse-geocode result used for country filtering also
 * comes with a proper human-readable address (see PlaceResolution's
 * `pdokLabel`), which the main loop prefers over text like this.
 */
const BARE_COORDINATES_RE = /^-?\d{1,3}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/;

function looksLikeBareCoordinates(location: string): boolean {
  return BARE_COORDINATES_RE.test(location.trim());
}

export type RealEvent = {
  externalSourceId: string;
  titleNl: string | null;
  titleEn: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  startAt: Date;
  endAt: Date | null;
  location: string;
  geo: Geo;
  externalEventUrl: string | null;
};

/**
 * ARC doesn't have a structured organizer/host field at all (checked the
 * raw parsed feed by hand - there's no ORGANIZER property), so this is
 * entirely pattern-matched against known campaign/org naming conventions in
 * the title, or a known domain mentioned in the description. First match
 * wins; an event matching none of these just gets no organizer, which is
 * fine - it's optional, informational metadata, not a required field.
 */
const ORGANIZER_RULES: ReadonlyArray<{
  organizer: string;
  test: (title: string, description: string) => boolean;
}> = [
  { organizer: "Anonymous for the Voiceless", test: (title) => /cube of truth/i.test(title) },
  { organizer: "We The Free", test: (title) => /\bwtf\b/i.test(title) },
  {
    organizer: "Animal Save",
    test: (title) => /save square/i.test(title) || /pig save/i.test(title),
  },
  { organizer: "Partij voor de Dieren", test: (title) => /\bpvdd\b/i.test(title) },
  {
    organizer: "Vegan Future",
    test: (_title, description) => /veganfuture\.org/i.test(description),
  },
];

export function detectOrganizer(event: RealEvent): string | null {
  const title = `${event.titleNl ?? ""} ${event.titleEn ?? ""}`;
  const description = `${event.descriptionNl ?? ""} ${event.descriptionEn ?? ""}`;
  return ORGANIZER_RULES.find((rule) => rule.test(title, description))?.organizer ?? null;
}

/**
 * Groups by (start, end, location) to recombine ARC's per-language VEVENT
 * pairs into single bilingual events, and drops events without usable
 * geo/location data (can't filter or place them without it).
 */
function groupEvents(events: VEvent[]): VEvent[][] {
  const groups = new Map<string, VEvent[]>();
  for (const event of events) {
    const geo = geoOf(event);
    const location = textOf(event.location);
    if (!geo || !location || !event.end) continue;
    const key = `${event.start.toISOString()}|${event.end.toISOString()}|${location}`;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * Turns one (start, end, location) group into a single real-world event.
 * Members are sorted by uid first so the canonical external id (and the
 * choice between duplicate same-language postings) is deterministic across
 * re-runs.
 */
function toRealEvent(group: VEvent[]): RealEvent {
  const sorted = [...group].sort((a, b) => a.uid.localeCompare(b.uid));
  const canonical = sorted[0];
  const shared = {
    externalSourceId: canonical.uid,
    startAt: canonical.start,
    endAt: canonical.end ?? null,
    location: textOf(canonical.location)!,
    geo: geoOf(canonical)!,
    externalEventUrl: canonical.url ?? null,
  };

  if (sorted.length === 1) {
    // No second member to pair against, so there's nothing to detect: which
    // field we put the text in makes no visible difference either way -
    // pickLocalized falls back to whichever language is present, so a lone
    // text renders identically in both locales. Call it English and skip
    // detectLanguage entirely.
    return {
      ...shared,
      titleNl: null,
      titleEn: textOf(canonical.summary),
      descriptionNl: null,
      descriptionEn: textOf(canonical.description),
    };
  }

  // Two or more members sharing (start, end, location): usually a genuine
  // nl/en pair, occasionally ARC posting the same event twice in the same
  // language (see the module doc comment) - here detectLanguage actually
  // matters, since it decides which text a Dutch vs. English viewer sees.
  const nl = sorted.find((e) => detectLanguage(e) === "nl") ?? null;
  const en = sorted.find((e) => detectLanguage(e) === "en" && e !== nl) ?? null;
  return {
    ...shared,
    titleNl: nl ? textOf(nl.summary) : null,
    titleEn: en ? textOf(en.summary) : null,
    descriptionNl: nl ? textOf(nl.description) : null,
    descriptionEn: en ? textOf(en.description) : null,
  };
}

async function fetchArcEvents(): Promise<VEvent[]> {
  const response = await fetch(ARC_FEED_URL, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch ARC feed: ${response.status} ${await response.text()}`);
  }
  const body = await response.text();
  const parsed = nodeIcal.sync.parseICS(body);
  return Object.values(parsed).filter((e): e is VEvent => e?.type === "VEVENT");
}

/**
 * Whether this run is actually allowed to touch the database. `--dry-run`
 * still does everything read-only (fetch, group, PDOK lookups, validation,
 * the existing-event check) so its report reflects what a real run would
 * decide - it just never creates the import bot user or writes an event.
 */
type WriteMode = { dryRun: true } | { dryRun: false; botUserId: UserId };

function parseCliOptions(): { dryRun: boolean } {
  const program = new Command()
    .name("import-arc-events")
    .description("Imports upcoming events from animalrightscalendar.com into the events table.")
    .option("--dry-run", "report what would happen without writing to the database", false);
  program.parse();
  return program.opts<{ dryRun: boolean }>();
}

async function ensureImportBotUser(authRepository: AuthRepository): Promise<UserId> {
  const existing = await authRepository.findUserByAccountName(IMPORT_BOT_ACCOUNT_NAME);
  if (existing.isErr()) {
    throw new Error(`Failed to look up import bot user: ${existing.error.message}`);
  }
  if (existing.value) {
    return existing.value.id;
  }

  const created = await authRepository.createUser({
    signalAci: SignalAci.from_string(IMPORT_BOT_SIGNAL_ACI)._unsafeUnwrap(),
    accountName: AccountName.from_string(IMPORT_BOT_ACCOUNT_NAME)._unsafeUnwrap(),
    email: "imports@veganactivists.nl",
    displayName: "Animal Rights Calendar (import)",
    affiliationsNote: null,
  });
  if (created.isErr()) {
    throw new Error(`Failed to create import bot user: ${created.error.message}`);
  }
  return created.value.id;
}

/**
 * Every way resolving a coordinate to one of our Places can legitimately
 * come out - each is a real, expected outcome, not a failure. Contrast
 * with PlaceResolutionError below, for the two ways it can actually break
 * (PDOK or the database misbehaving) - those get surfaced to the caller
 * instead of being folded into one of these, so a technical failure and a
 * confirmed "this is in Germany" are never confused with each other.
 */
type PlaceResolution =
  | { kind: "resolved"; placeId: string; distanceMeters: number; pdokLabel: string }
  | { kind: "outside_nl"; distanceMeters: number }
  | { kind: "no_pdok_match" }
  | { kind: "no_matching_place"; woonplaatsNaam: string; distanceMeters: number };

type PlaceResolutionError = { subsystem: "pdok" | "db"; message: string };

/** Nearest-Dutch-address resolution cache, keyed by rounded coordinate - many events share a venue. */
const geoResolutionCache = new Map<string, Result<PlaceResolution, PlaceResolutionError>>();

function resolveDutchPlace(
  geo: Geo,
  placeRepository: PlaceRepository,
): PromiseLike<Result<PlaceResolution, PlaceResolutionError>> {
  const cacheKey = `${geo.lat.toFixed(5)},${geo.lon.toFixed(5)}`;
  const cached = geoResolutionCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  return reverseGeocode(geo.lat, geo.lon)
    .mapErr((pdokError): PlaceResolutionError => ({
      subsystem: "pdok",
      message: pdokError.message,
    }))
    .andThen((found) => {
      if (!found) {
        return okAsync<PlaceResolution, PlaceResolutionError>({ kind: "no_pdok_match" });
      }
      const { address, distanceMeters } = found;
      if (distanceMeters > NL_DISTANCE_THRESHOLD_METERS) {
        return okAsync<PlaceResolution, PlaceResolutionError>({
          kind: "outside_nl",
          distanceMeters,
        });
      }
      return placeRepository
        .findPlaceByName(address.woonplaatsNaam)
        .mapErr((dbError): PlaceResolutionError => ({ subsystem: "db", message: dbError.message }))
        .map((place): PlaceResolution =>
          place
            ? { kind: "resolved", placeId: place.id, distanceMeters, pdokLabel: address.label }
            : { kind: "no_matching_place", woonplaatsNaam: address.woonplaatsNaam, distanceMeters },
        );
    })
    .then((result) => {
      geoResolutionCache.set(cacheKey, result);
      return result;
    });
}

async function main(): Promise<void> {
  const { dryRun } = parseCliOptions();
  if (dryRun) {
    console.log("Dry run - the database will not be written to.");
  }

  console.log("Fetching ARC feed...");
  const rawEvents = await fetchArcEvents();
  console.log(`Fetched ${rawEvents.length} VEVENTs.`);

  const now = new Date();
  const groups = groupEvents(rawEvents)
    .map(toRealEvent)
    .filter((e) => e.startAt > now);
  console.log(`${groups.length} upcoming real events after de-duplication/pairing.`);

  const config = loadConfig();
  const sql = postgres({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    username: config.database.user,
    password: process.env.VANL_DATABASE_PASSWORD ?? "",
  });

  const eventRepository = new EventRepository(sql);
  const placeRepository = new PlaceRepository(sql);
  const authRepository = new AuthRepository(sql);

  let filteredNonNl = 0;
  let skippedNoPlace = 0;
  let skippedValidation = 0;
  let failed = 0;
  let created = 0;
  let updated = 0;
  let crossCheckMismatches = 0;

  try {
    const mode: WriteMode = dryRun
      ? { dryRun: true }
      : { dryRun: false, botUserId: await ensureImportBotUser(authRepository) };

    for (const event of groups) {
      const placeResolution = await resolveDutchPlace(event.geo, placeRepository);
      if (placeResolution.isErr()) {
        failed++;
        console.error(
          `Failed to resolve place for "${event.location}" (${event.externalSourceId}) via ` +
            `${placeResolution.error.subsystem}: ${placeResolution.error.message}`,
        );
        continue;
      }

      const resolution = placeResolution.value;
      if (resolution.kind === "outside_nl") {
        filteredNonNl++;
        continue;
      }
      if (resolution.kind === "no_pdok_match" || resolution.kind === "no_matching_place") {
        skippedNoPlace++;
        console.warn(`No matching place for "${event.location}" (${event.externalSourceId})`);
        continue;
      }
      const placeId = resolution.placeId;

      const foreignMention = mentionsForeignCountry(event.location);
      if (foreignMention) {
        crossCheckMismatches++;
        console.warn(
          `Skipping "${event.location}" (${event.externalSourceId}): geo resolved it as within the ` +
            `Netherlands (${resolution.distanceMeters.toFixed(0)}m from the nearest address), but ` +
            `its location text mentions "${foreignMention}" - second opinion disagrees, so skip ` +
            `rather than risk importing a foreign event.`,
        );
        continue;
      }

      const locationDescription = looksLikeBareCoordinates(event.location)
        ? resolution.pdokLabel
        : event.location;

      const mapUrl = `https://www.google.com/maps?q=${event.geo.lat},${event.geo.lon}`;
      const validatable: ValidatableEvent = {
        titleNl: event.titleNl,
        titleEn: event.titleEn,
        descriptionNl: event.descriptionNl,
        descriptionEn: event.descriptionEn,
        startAt: event.startAt,
        endAt: event.endAt,
        locationKind: "meeting_point_city_only",
        placeId,
        locationDescription,
        pdokAddressId: null,
        mapUrl,
        externalEventUrl: event.externalEventUrl,
        registrationUrl: null,
      };
      const validation = validateEvent(validatable, { lang: "en", requireFutureStart: false });
      if (validation.isErr()) {
        skippedValidation++;
        console.warn(
          `Skipping "${event.titleNl ?? event.titleEn}" (${event.externalSourceId}): ${validation.error.join("; ")}`,
        );
        continue;
      }

      const fields = {
        titleNl: event.titleNl,
        titleEn: event.titleEn,
        descriptionNl: event.descriptionNl,
        descriptionEn: event.descriptionEn,
        startAt: event.startAt,
        endAt: event.endAt,
        locationKind: "meeting_point_city_only" as const,
        placeId,
        locationDescription,
        locationStreet: null,
        locationHouseNumber: null,
        locationPostcode: null,
        locationLat: null,
        locationLng: null,
        locationPdokId: null,
        mapUrl,
        externalEventUrl: event.externalEventUrl,
        registrationUrl: null,
      };

      const existing = await eventRepository.findEventBySourceAndExternalId(
        EVENT_SOURCE,
        event.externalSourceId,
      );
      if (existing.isErr()) {
        failed++;
        console.error(
          `Failed to look up existing event for "${event.externalSourceId}": ${existing.error.message}`,
        );
        continue;
      }

      const title = event.titleNl ?? event.titleEn;

      if (existing.value) {
        if (mode.dryRun) {
          console.log(`[dry-run] would update "${title}" (${event.externalSourceId})`);
        } else {
          const result = await eventRepository.updateEvent(
            existing.value.id,
            fields,
            mode.botUserId,
          );
          if (result.isErr()) {
            failed++;
            console.error(
              `Failed to update event "${event.externalSourceId}": ${result.error.message}`,
            );
            continue;
          }
        }
        updated++;
      } else {
        if (mode.dryRun) {
          console.log(`[dry-run] would create "${title}" (${event.externalSourceId})`);
        } else {
          const input: NewEventInput = {
            ...fields,
            slug: generateSlug(event.titleNl ?? event.titleEn ?? ""),
            organizerName: detectOrganizer(event),
            publisherUserId: mode.botUserId,
            createdBy: mode.botUserId,
            source: EVENT_SOURCE,
            externalSourceId: event.externalSourceId,
          };
          const result = await eventRepository.createEvent(input);
          if (result.isErr()) {
            failed++;
            console.error(
              `Failed to create event "${event.externalSourceId}": ${result.error.message}`,
            );
            continue;
          }
        }
        created++;
      }
    }

    console.log(
      `Done${dryRun ? " (dry-run)" : ""}. ${dryRun ? "Would create" : "Created"} ${created}, ` +
        `${dryRun ? "would update" : "updated"} ${updated}, filtered out ${filteredNonNl} non-NL ` +
        `events, skipped ${skippedNoPlace} for no matching place, ${skippedValidation} failing ` +
        `validation, ${crossCheckMismatches} on a second-opinion mismatch, ${failed} failed outright.`,
    );
  } finally {
    await sql.end();
  }
}

// Guarded so importing this module (e.g. from import-arc-events.test.ts, to
// unit-test pure helpers like detectOrganizer) never fetches the real feed
// or touches the database as a side effect of the import.
if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
