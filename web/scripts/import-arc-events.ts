import postgres from "postgres";
import nodeIcal, { type ParameterValue, type VEvent } from "node-ical";
import { Command } from "commander";
import { fromZonedTime } from "date-fns-tz";
import { okAsync, ResultAsync, type Result } from "neverthrow";
import { loadConfig } from "../src/lib/config";
import { AccountName } from "../src/domain/auth/account_name";
import { AuthRepository } from "../src/domain/auth/auth_repository";
import { SignalAci } from "../src/domain/auth/signal_aci";
import type { UserId } from "../src/domain/auth/user_id";
import { EventRepository, type NewEventInput } from "../src/domain/events/event_repository";
import type { EventId } from "../src/domain/events/event_id";
import { ImageRepository } from "../src/domain/images/image_repository";
import { FLYER_VARIANTS, processUpload } from "../src/domain/images/image_processing";
import type { Organization } from "../src/domain/organizations/organization";
import { OrganizationRepository } from "../src/domain/organizations/organization_repository";
import { PlaceRepository } from "../src/domain/places/place_repository";
import type { Sha256 } from "../src/lib/sha256";
import type { Uuid } from "../src/lib/uuid";
import { reverseGeocode } from "../src/domain/events/pdok-client";
import { generateSlug } from "../src/lib/slug";
import { validateEvent, type ValidatableEvent } from "../src/lib/event_validation";

/**
 * Imports events from animalrightscalendar.com (ARC) into our events table.
 * Idempotent - safe to re-run; each ARC event is upserted, keyed on
 * (source, external_source_id) (see migrations/0002_events.sql). Run by hand
 * (e.g. cron), not part of `bun run migrate`.
 *
 * ARC sometimes publishes each event as two separate VEVENTs sharing the
 * same start/end/location but with different UIDs (occasionally one per
 * language, though ARC's own Dutch text is unreliable enough - see
 * pickText below - that we no longer trust it and only ever import English).
 * We group by (start, end, location) to recombine those into one Event; a
 * group can also be a single VEVENT, or, rarely, a true duplicate posting
 * (two VEVENTs, same everything) - see detectRealEvents below.
 *
 * ARC's 200km search radius (centered on Lunteren) reaches into Germany and
 * Belgium - see NL_DISTANCE_THRESHOLD_METERS below for how those get
 * filtered out.
 */

const ARC_FEED_URL =
  "https://animalrightscalendar.com/cal?coordinates=5.62222%2C52.085&city=Lunteren+%F0%9F%87%B3%F0%9F%87%B1&timezone=Europe%2FAmsterdam&radius=200&showOnlineEvents=false";

const EXTERNAL_SOURCE_NAME = "animalrightscalendar.com";

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

/**
 * ARC's placeholder text for a VEVENT that has no real content (e.g. the
 * "other language" half of a pair ARC didn't actually translate) - seen
 * literally as "(No description available)" in the feed. Never worth
 * importing over a sibling VEVENT that has real text.
 */
const PLACEHOLDER_TEXT_RE = /^\(?no (?:title|description) available\)?$/i;

/** First candidate with real (non-placeholder) text; falls back to the first non-null one, then null. */
function pickText(candidates: Array<string | null>): string | null {
  return (
    candidates.find((text) => text !== null && !PLACEHOLDER_TEXT_RE.test(text.trim())) ??
    candidates.find((text) => text !== null) ??
    null
  );
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
  /** False when ARC's DTSTART only specified a date (node-ical's `.dateOnly`) - startAt's time is then a meaningless midnight placeholder. */
  startTimeKnown: boolean;
  endAt: Date | null;
  /** Same caveat as startTimeKnown - only meaningful when endAt is non-null. */
  endTimeKnown: boolean;
  location: string;
  geo: Geo;
  flyerUrl: string | null;
};

/**
 * ARC embeds each event's flyer as a standard iCal ATTACH property
 * (node-ical surfaces it in the same {val, params} shape textOf() already
 * unwraps for summary/description/location) - no page-scraping needed. Not
 * every ATTACH is a bespoke flyer though; some are a generic/default image
 * an organizer reuses across many events - see reusedFlyerUrls and
 * EventRepository.isFlyerImageUsedByAnotherEvent for the two-layer filter
 * that catches those before they're ever imported as a flyer.
 */
export function flyerUrlOf(event: VEvent): string | null {
  return textOf(event.attach as ParameterValue<string> | undefined);
}

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
  {
    organizer: "Anonymous for the Voiceless",
    test: (title, description) =>
      /cube of truth/i.test(title) ||
      /anonymous for the voiceless/i.test(title) ||
      /anonymousforthevoiceless\.org/i.test(description) ||
      /cubeoftruth\.com/i.test(description),
  },
  {
    organizer: "We The Free",
    test: (title, description) =>
      /we the free/i.test(title) ||
      /activism\.wtf/i.test(description) ||
      /mystats\.wtf/i.test(description),
  },
  {
    organizer: "Animal Save",
    test: (title, description) =>
      /save square/i.test(title) ||
      /pig save/i.test(title) ||
      /savemovement\.nl/i.test(description),
  },
  { organizer: "Partij voor de Dieren", test: (title) => /\bpvdd\b/i.test(title) },
  {
    organizer: "Vegan Future",
    test: (_title, description) => /veganfuture\.org/i.test(description),
  },
  {
    organizer: "XR Landbouw",
    test: (title, description) =>
      /xr landbouw/i.test(title) || /stopdeuitbuiting\.nl/i.test(description),
  },
  {
    organizer: "Active for Justice",
    test: (title, description) =>
      /active for justice/i.test(title) || /activeforjustice\.nl/i.test(description),
  },
  {
    organizer: "Animal Equality",
    test: (title, description) =>
      /animal equality/i.test(title) || /animalequality\.org/i.test(description),
  },
  {
    organizer: "Bite Back",
    test: (title, description) =>
      /\bbite\s*back\b/i.test(title) || /biteback\.nl/i.test(description),
  },
  {
    organizer: "International Council for Animal Welfare",
    test: (_title, description) =>
      /international council for animal welfare/i.test(description) ||
      /\bi-caw\.org\b/i.test(description),
  },
];

/**
 * seed-organizations.ts also seeds "Animal Rebellion" - deliberately no rule for
 * it here. Checked by hand against a live feed pull: every Animal Rebellion-hosted
 * event links to groups.animalrebellion.nl, but that's a shared community-calendar
 * platform Animal Rebellion runs for a wide range of unaffiliated local groups
 * (XR Amersfoort trainings, Palestine-solidarity sit-ins, a housing protest, other
 * orgs' own actions like "Boxtel Pig Save") - not a signal that Animal Rebellion
 * organized the event. No event in that pull named "Animal Rebellion" in its own
 * title or description either. Add a rule here if ARC's feed ever gains a cleaner
 * signal (e.g. events actually titled/attributed to them).
 */

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
 * node-ical parses a bare `VALUE=DATE` property (no TZID - see its own
 * "assume same timezone as this computer" comment) via `new Date(y, m-1, d)`,
 * i.e. using the *import script process's* ambient system timezone, not
 * Amsterdam's - so its absolute instant is only right if that process happens
 * to run with Europe/Amsterdam as its system zone (true in prod today, see
 * server/configuration.nix's `time.timeZone`, but not guaranteed, and not
 * true for `bun test`). Our own date-only events store Amsterdam midnight as
 * a UTC instant instead (see format-date.ts's EVENT_DISPLAY_TZ comment) -
 * reinterpreting the Date's already-correct Y/M/D (its local getters, read
 * back from however it was actually constructed) as Amsterdam wall-clock
 * time makes this match that convention deterministically, independent of
 * the running process's own zone. Without this, a date-only event's start_at
 * wouldn't exactly match its own manually-created twin were it to loop back
 * through ARC (see EventRepository.findEventByTitleAndStart), silently
 * letting a duplicate through.
 */
function normalizeDateOnly(date: VEvent["start"]): Date {
  return date.dateOnly ? fromZonedTime(date, "Europe/Amsterdam") : date;
}

/**
 * Turns one (start, end, location) group into a single real-world event.
 * Members are sorted by uid first so the canonical external id (and the
 * choice between duplicate postings) is deterministic across re-runs.
 * ARC's Dutch text is unreliable (see PLACEHOLDER_TEXT_RE) and unnecessary
 * anyway (pickLocalized falls back to whichever language is present), so we
 * never populate titleNl/descriptionNl - only titleEn/descriptionEn, picked
 * from whichever member actually has real text.
 */
export function toRealEvent(group: VEvent[]): RealEvent {
  const sorted = [...group].sort((a, b) => a.uid.localeCompare(b.uid));
  const canonical = sorted[0];
  return {
    externalSourceId: canonical.uid,
    titleNl: null,
    titleEn: pickText(sorted.map((e) => textOf(e.summary))),
    descriptionNl: null,
    descriptionEn: pickText(sorted.map((e) => textOf(e.description))),
    startAt: normalizeDateOnly(canonical.start),
    startTimeKnown: !canonical.start.dateOnly,
    endAt: canonical.end ? normalizeDateOnly(canonical.end) : null,
    endTimeKnown: canonical.end ? !canonical.end.dateOnly : true,
    location: textOf(canonical.location)!,
    geo: geoOf(canonical)!,
    flyerUrl: flyerUrlOf(canonical),
  };
}

/**
 * An image URL used by more than one real event this pull is an organizer's
 * shared/default graphic, not a flyer made for any one of them - verified
 * against a live pull: the same image reused across 25 different "Cube of
 * Truth: Nijmegen" recurring actions on different dates. Catches bulk reuse
 * before ever downloading anything; EventRepository.isFlyerImageUsedByAnotherEvent
 * is the backstop for an organizer who (for now) only has one upcoming event
 * sharing such an image, which this same-pull count alone can't see.
 */
export function reusedFlyerUrls(events: RealEvent[]): Set<string> {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!e.flyerUrl) continue;
    counts.set(e.flyerUrl, (counts.get(e.flyerUrl) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([url]) => url));
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

type FlyerImageIds = { full: Sha256; preview: Sha256; thumbnail: Sha256 };

/**
 * Downloads, processes, and stores (content-addressed, via ImageRepository)
 * ARC's flyer image at most once per distinct URL per run - cached the same
 * way as geoResolutionCache/organizerOrgCache above, but only the resulting
 * sha256 ids, not the image bytes: once they're durably stored there's no
 * reason to keep holding several events' worth of decoded webp buffers in
 * memory for the rest of the run. Without this cache, an image several
 * events share (e.g. "Boxtel Pig Save" posted repeatedly) would otherwise
 * be re-downloaded, re-encoded, and re-uploaded once per event instead of
 * once. `null` is cached too, so a failing URL is only ever retried once
 * per run, not once per event that references it.
 */
const flyerDownloadCache = new Map<string, FlyerImageIds | null>();

async function downloadAndStoreFlyer(
  flyerUrl: string,
  imageRepository: ImageRepository,
): Promise<FlyerImageIds | null> {
  const cached = flyerDownloadCache.get(flyerUrl);
  if (cached !== undefined) {
    return cached;
  }

  let bytes: Buffer;
  try {
    const response = await fetch(flyerUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      console.warn(`Flyer download failed (${response.status}): ${flyerUrl}`);
      flyerDownloadCache.set(flyerUrl, null);
      return null;
    }
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn(`Flyer download failed: ${flyerUrl}`, error);
    flyerDownloadCache.set(flyerUrl, null);
    return null;
  }

  const processed = await processUpload(bytes, FLYER_VARIANTS);
  if (processed.isErr()) {
    console.warn(`Flyer processing failed for ${flyerUrl}: ${processed.error.message}`);
    flyerDownloadCache.set(flyerUrl, null);
    return null;
  }
  const [full, preview, thumbnail] = processed.value;

  const uploaded = await ResultAsync.combine([
    imageRepository.upsertImage(full),
    imageRepository.upsertImage(preview),
    imageRepository.upsertImage(thumbnail),
  ]);
  if (uploaded.isErr()) {
    console.warn(`Flyer storage failed for ${flyerUrl}: ${uploaded.error.message}`);
    flyerDownloadCache.set(flyerUrl, null);
    return null;
  }

  const ids: FlyerImageIds = {
    full: full.sha256,
    preview: preview.sha256,
    thumbnail: thumbnail.sha256,
  };
  flyerDownloadCache.set(flyerUrl, ids);
  return ids;
}

/**
 * Points an event at an already-downloaded-and-stored flyer image, mirroring
 * EventService.replaceFlyer's pipeline. Never throws - a download/decode/
 * storage failure (see downloadAndStoreFlyer) just means no flyer, logged
 * as a warning there; it must never fail the event's own create/update.
 *
 * checkForDuplicates gates the cross-run content-hash check
 * (EventRepository.isFlyerImageUsedByAnotherEvent - the backstop for a
 * generic/default image that reusedFlyerUrls' same-pull count alone
 * couldn't catch): only worth doing for an event linked to a known org,
 * where a duplicate would otherwise sit on top of a logo we already show as
 * that org's fallback. An unlinked event has no such fallback to protect,
 * so its caller skips this check entirely - see the main loop.
 */
type ImportFlyerResult = "imported" | "duplicate" | "failed";

async function importFlyer(
  flyerUrl: string,
  eventId: EventId,
  botUserId: UserId,
  eventRepository: EventRepository,
  imageRepository: ImageRepository,
  checkForDuplicates: boolean,
): Promise<ImportFlyerResult> {
  const ids = await downloadAndStoreFlyer(flyerUrl, imageRepository);
  if (!ids) {
    return "failed";
  }

  if (checkForDuplicates) {
    const alreadyUsed = await eventRepository.isFlyerImageUsedByAnotherEvent(ids.full, eventId);
    if (alreadyUsed.isErr()) {
      console.warn(`Flyer reuse check failed for ${eventId.value}: ${alreadyUsed.error.message}`);
      return "failed";
    }
    if (alreadyUsed.value) {
      console.warn(
        `Flyer for ${eventId.value} (${flyerUrl}) matches an image another event already uses - ` +
          `treating as a shared/default image, not importing.`,
      );
      return "duplicate";
    }
  }

  const result = await eventRepository.setEventFlyer(
    eventId,
    ids.full,
    ids.preview,
    ids.thumbnail,
    botUserId,
  );
  if (result.isErr()) {
    console.warn(`Failed to set flyer for ${eventId.value}: ${result.error.message}`);
    return "failed";
  }
  return "imported";
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
  | { kind: "resolved"; placeId: Uuid; distanceMeters: number; pdokLabel: string }
  | { kind: "outside_nl"; distanceMeters: number }
  | { kind: "no_pdok_match" }
  | { kind: "no_matching_place"; woonplaatsNaam: string; distanceMeters: number };

type PlaceResolutionError = { subsystem: "pdok" | "db"; message: string };

/** Nearest-Dutch-address resolution cache, keyed by rounded coordinate - many events share a venue. */
const geoResolutionCache = new Map<string, Result<PlaceResolution, PlaceResolutionError>>();

/**
 * detectOrganizer only produces a free-text guess (ARC has no structured organizer
 * field - see its own comment above); this resolves that guess to a real
 * organizations row, if scripts/seed-organizations.ts has seeded one under the exact
 * same name. Cached per run since many events share the same organizer.
 */
const organizerOrgCache = new Map<string, Organization | null>();

async function resolveOrganizerOrganization(
  organizerName: string,
  organizationRepository: OrganizationRepository,
): Promise<Organization | null> {
  const cached = organizerOrgCache.get(organizerName);
  if (cached !== undefined) {
    return cached;
  }
  const result = await organizationRepository.findOrganizationByName(organizerName);
  if (result.isErr()) {
    throw new Error(`Failed to look up organization "${organizerName}": ${result.error.message}`);
  }
  organizerOrgCache.set(organizerName, result.value);
  return result.value;
}

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
  const organizationRepository = new OrganizationRepository(sql);
  const imageRepository = new ImageRepository(sql);

  const reusedFlyers = reusedFlyerUrls(groups);

  let filteredNonNl = 0;
  let skippedNoPlace = 0;
  let skippedValidation = 0;
  let skippedDuplicateTitle = 0;
  let failed = 0;
  let created = 0;
  let updated = 0;
  let linkedToOrg = 0;
  let crossCheckMismatches = 0;
  let flyersImported = 0;
  let flyersSkippedReused = 0;
  let flyersSkippedDuplicate = 0;

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
      // externalEventUrl is never set from ARC - it's shown publicly on the
      // event page now, and a link back to ARC's own listing would just be a
      // duplicate of what this page already shows. Explicitly null (rather
      // than backfill-only) so a re-import also clears it off events created
      // before this changed.
      const validatable: ValidatableEvent = {
        titleNl: event.titleNl,
        titleEn: event.titleEn,
        descriptionNl: event.descriptionNl,
        descriptionEn: event.descriptionEn,
        startAt: event.startAt,
        startTimeKnown: event.startTimeKnown,
        endAt: event.endAt,
        endTimeKnown: event.endTimeKnown,
        locationKind: "meeting_point_city_only",
        placeId,
        locationDescription,
        pdokAddressId: null,
        mapUrl,
        externalEventUrl: null,
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
        startTimeKnown: event.startTimeKnown,
        endAt: event.endAt,
        endTimeKnown: event.endTimeKnown,
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
        externalEventUrl: null,
        registrationUrl: null,
      };

      const existing = await eventRepository.findEventByExternalSourceAndId(
        EXTERNAL_SOURCE_NAME,
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

      // A never-before-seen external_source_id doesn't necessarily mean a new
      // real-world event: it could be one we published ourselves and exported
      // to ARC via /events.ics, now looping back under an ARC-assigned id
      // we've never seen. Title+start is the only stable link back to that
      // original event ARC's feed still carries - skip creating a duplicate
      // when it matches, but never touch the matched event itself (it may not
      // even be one of ours; the point is just to not double it).
      if (!existing.value && title) {
        const titleMatch = await eventRepository.findEventByTitleAndStart(title, event.startAt);
        if (titleMatch.isErr()) {
          failed++;
          console.error(
            `Failed to check for a title/start duplicate for "${title}" (${event.externalSourceId}): ` +
              `${titleMatch.error.message}`,
          );
          continue;
        }
        if (titleMatch.value) {
          skippedDuplicateTitle++;
          console.log(
            `Skipping "${title}" (${event.externalSourceId}): an event with the same title and ` +
              `start time already exists (${titleMatch.value.id.value}) - treating as a duplicate.`,
          );
          continue;
        }
      }

      const organizerName = detectOrganizer(event);
      const organizerOrg = organizerName
        ? await resolveOrganizerOrganization(organizerName, organizationRepository)
        : null;

      // See reusedFlyerUrls' comment - a same-pull-reused image is usually a
      // shared/default graphic, not a flyer made for this event specifically.
      // That only matters when it'd duplicate a logo we already show as the
      // fallback for a known org, though (organizerOrg) - an unlinked event
      // has no such fallback, so ARC's image (bespoke or not) beats showing
      // nothing, and reuse is never checked for it.
      let flyerUrl: string | null = null;
      if (event.flyerUrl) {
        if (organizerOrg && reusedFlyers.has(event.flyerUrl)) {
          flyersSkippedReused++;
        } else {
          flyerUrl = event.flyerUrl;
        }
      }

      if (existing.value) {
        if (mode.dryRun) {
          console.log(`[dry-run] would update "${title}" (${event.externalSourceId})`);
          if (organizerOrg && existing.value.publisherOrgId?.value !== organizerOrg.id.value) {
            console.log(
              `[dry-run] would link "${title}" (${event.externalSourceId}) to organization ` +
                `"${organizerOrg.name}"`,
            );
            linkedToOrg++;
          }
          if (!existing.value.flyerFullImageId && flyerUrl) {
            console.log(`[dry-run] would import flyer for "${title}" (${event.externalSourceId})`);
          }
        } else {
          const result = await eventRepository.updateEvent(
            existing.value.id,
            // Re-imports never touch status - preserve whatever moderation
            // already set (visible/hidden/cancelled/draft).
            { ...fields, status: existing.value.status },
            mode.botUserId,
          );
          if (result.isErr()) {
            failed++;
            console.error(
              `Failed to update event "${event.externalSourceId}": ${result.error.message}`,
            );
            continue;
          }
          // organizer_name/publisher_org_id are bot-owned fields (see
          // 0002_events.sql), never touched by updateEvent above - only backfilled
          // here, and only when a match actually exists, so an event whose
          // organizer can no longer be detected keeps whatever it already had.
          if (organizerOrg && existing.value.publisherOrgId?.value !== organizerOrg.id.value) {
            const linkResult = await eventRepository.setEventPublisherOrg(
              existing.value.id,
              organizerName!,
              organizerOrg.id,
            );
            if (linkResult.isErr()) {
              failed++;
              console.error(
                `Failed to link event "${event.externalSourceId}" to organization ` +
                  `"${organizerOrg.name}": ${linkResult.error.message}`,
              );
              continue;
            }
            linkedToOrg++;
          }
          // flyer_full_image_id is likewise bot-owned but backfill-only, for
          // two reasons: never re-download/re-process the same image every
          // hourly run for an event's whole lifetime, and never clobber a
          // flyer a human organizer may have manually uploaded since.
          if (!existing.value.flyerFullImageId && flyerUrl) {
            const imported = await importFlyer(
              flyerUrl,
              existing.value.id,
              mode.botUserId,
              eventRepository,
              imageRepository,
              organizerOrg !== null,
            );
            if (imported === "imported") flyersImported++;
            if (imported === "duplicate") flyersSkippedDuplicate++;
          }
        }
        updated++;
      } else {
        if (mode.dryRun) {
          console.log(`[dry-run] would create "${title}" (${event.externalSourceId})`);
          if (organizerOrg) {
            console.log(
              `[dry-run] would link "${title}" (${event.externalSourceId}) to organization ` +
                `"${organizerOrg.name}"`,
            );
            linkedToOrg++;
          }
          if (flyerUrl) {
            console.log(`[dry-run] would import flyer for "${title}" (${event.externalSourceId})`);
          }
        } else {
          const input: NewEventInput = {
            ...fields,
            slug: generateSlug(event.titleNl ?? event.titleEn ?? ""),
            organizerName,
            publisherUserId: organizerOrg ? null : mode.botUserId,
            publisherOrgId: organizerOrg?.id ?? null,
            createdBy: mode.botUserId,
            source: "external_import",
            externalSourceId: event.externalSourceId,
            externalSourceName: EXTERNAL_SOURCE_NAME,
            status: "visible",
          };
          const result = await eventRepository.createEvent(input);
          if (result.isErr()) {
            failed++;
            console.error(
              `Failed to create event "${event.externalSourceId}": ${result.error.message}`,
            );
            continue;
          }
          if (organizerOrg) {
            linkedToOrg++;
          }
          if (flyerUrl) {
            const imported = await importFlyer(
              flyerUrl,
              result.value.id,
              mode.botUserId,
              eventRepository,
              imageRepository,
              organizerOrg !== null,
            );
            if (imported === "imported") flyersImported++;
            if (imported === "duplicate") flyersSkippedDuplicate++;
          }
        }
        created++;
      }
    }

    console.log(
      `Done${dryRun ? " (dry-run)" : ""}. ${dryRun ? "Would create" : "Created"} ${created}, ` +
        `${dryRun ? "would update" : "updated"} ${updated}, ${dryRun ? "would link" : "linked"} ` +
        `${linkedToOrg} to an organization, ${dryRun ? "would import" : "imported"} ${flyersImported} ` +
        `flyers (${flyersSkippedReused} skipped as a same-pull-reused image, ${flyersSkippedDuplicate} ` +
        `skipped as a cross-run content duplicate), filtered out ` +
        `${filteredNonNl} non-NL events, skipped ${skippedNoPlace} for no matching place, ` +
        `${skippedValidation} failing validation, ${skippedDuplicateTitle} as a title/start duplicate, ` +
        `${crossCheckMismatches} on a second-opinion mismatch, ${failed} failed outright.`,
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
