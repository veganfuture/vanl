import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { z } from "zod";

/**
 * Live address lookup against pdok.nl's Locatieserver, used only for
 * location_kind = precise_address. Never a hard requirement to save an
 * event - callers treat PdokError as "leave the structured fields blank",
 * not a save-blocking failure (docs/milestones.md M3).
 */

const PDOK_BASE_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";
const REQUEST_TIMEOUT_MS = 5000;

export type PdokError = { readonly message: string; readonly cause?: unknown };

export type AddressSuggestion = {
  readonly pdokId: string;
  readonly label: string;
};

export type ResolvedAddress = {
  readonly pdokId: string;
  readonly street: string;
  readonly houseNumber: string;
  /** Null for the rare PDOK address doc that genuinely has none (seen on some border-adjacent addresses). */
  readonly postcode: string | null;
  readonly woonplaatsNaam: string;
  readonly lat: number;
  readonly lng: number;
  /** PDOK's own human-readable display string, e.g. "18 Septemberplein 35, 5611AL Eindhoven". */
  readonly label: string;
};

const SuggestResponseSchema = z.object({
  response: z.object({
    docs: z.array(
      z.object({
        id: z.string(),
        weergavenaam: z.string(),
      }),
    ),
  }),
});

const WGS84_POINT_RE = /^POINT\(([-\d.]+) ([-\d.]+)\)$/;

const AddressDocFields = z.object({
  id: z.string(),
  straatnaam: z.string(),
  huisnummer: z.number(),
  huisletter: z.string().optional(),
  huisnummertoevoeging: z.string().optional(),
  postcode: z.string().optional(),
  woonplaatsnaam: z.string(),
  centroide_ll: z.string().regex(WGS84_POINT_RE, "expected a WGS84 WKT POINT"),
  weergavenaam: z.string(),
});

function toResolvedAddress(doc: z.infer<typeof AddressDocFields>): ResolvedAddress {
  // Already validated by AddressDocFields's .regex() above - exec() cannot fail here.
  const [, lngText, latText] = WGS84_POINT_RE.exec(doc.centroide_ll)!;
  return {
    pdokId: doc.id,
    street: doc.straatnaam,
    houseNumber: `${doc.huisnummer}${doc.huisletter ?? ""}${
      doc.huisnummertoevoeging ? `-${doc.huisnummertoevoeging}` : ""
    }`,
    postcode: doc.postcode ?? null,
    woonplaatsNaam: doc.woonplaatsnaam,
    lat: Number(latText),
    lng: Number(lngText),
    label: doc.weergavenaam,
  };
}

const LookupDocSchema = AddressDocFields.transform(toResolvedAddress);

const LookupResponseSchema = z.object({
  response: z.object({
    docs: z.array(LookupDocSchema),
  }),
});

export type ReverseGeocodeResult = {
  readonly address: ResolvedAddress;
  /** Distance in meters from the queried point to this (nearest) address. */
  readonly distanceMeters: number;
};

const ReverseDocSchema = AddressDocFields.extend({ afstand: z.number() }).transform(
  (doc): ReverseGeocodeResult => ({
    address: toResolvedAddress(doc),
    distanceMeters: doc.afstand,
  }),
);

const ReverseResponseSchema = z.object({
  response: z.object({
    docs: z.array(ReverseDocSchema),
  }),
});

function fetchJson(url: URL): ResultAsync<unknown, PdokError> {
  return ResultAsync.fromPromise(
    fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    (cause): PdokError => ({ message: "Failed to reach PDOK", cause }),
  ).andThen((response) => {
    if (!response.ok) {
      return errAsync<unknown, PdokError>({
        message: `PDOK returned ${response.status}`,
      });
    }
    return ResultAsync.fromPromise(response.json(), (cause): PdokError => ({
      message: "Failed to parse PDOK response as JSON",
      cause,
    }));
  });
}

/** Address autocomplete-style search, for a search-as-you-type UI field. */
export function suggestAddresses(query: string): ResultAsync<AddressSuggestion[], PdokError> {
  const url = new URL(`${PDOK_BASE_URL}/suggest`);
  url.searchParams.set("q", query);
  url.searchParams.set("fq", "type:adres");
  url.searchParams.set("rows", "10");

  return fetchJson(url).andThen((raw) => {
    const parsed = SuggestResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return errAsync<AddressSuggestion[], PdokError>({
        message: `Unexpected PDOK suggest response shape: ${parsed.error.message}`,
      });
    }
    return okAsync(
      parsed.data.response.docs.map((doc) => ({ pdokId: doc.id, label: doc.weergavenaam })),
    );
  });
}

/** Resolves a suggestion's id (from suggestAddresses) to its full canonical address. */
export function lookupAddress(pdokId: string): ResultAsync<ResolvedAddress, PdokError> {
  const url = new URL(`${PDOK_BASE_URL}/lookup`);
  url.searchParams.set("id", pdokId);

  return fetchJson(url).andThen((raw) => {
    const parsed = LookupResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return errAsync<ResolvedAddress, PdokError>({
        message: `Unexpected PDOK lookup response shape: ${parsed.error.message}`,
      });
    }
    const doc = parsed.data.response.docs[0];
    if (!doc) {
      return errAsync<ResolvedAddress, PdokError>({
        message: `PDOK lookup found no address for id ${pdokId}`,
      });
    }
    return okAsync(doc);
  });
}

/**
 * Finds the nearest Dutch address to a coordinate, plus its distance -
 * PDOK's index only covers the Netherlands, so a large distance reliably
 * signals the coordinate itself lies outside it (used by
 * scripts/import-arc-events.ts to filter out German/Belgian events).
 * Resolves to null, not a PdokError, when PDOK simply has no match.
 */
export function reverseGeocode(
  lat: number,
  lng: number,
): ResultAsync<ReverseGeocodeResult | null, PdokError> {
  const url = new URL(`${PDOK_BASE_URL}/reverse`);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("rows", "1");
  url.searchParams.set("fq", "type:adres");
  url.searchParams.set(
    "fl",
    "id,straatnaam,huisnummer,huisletter,huisnummertoevoeging,postcode,woonplaatsnaam,centroide_ll,afstand,weergavenaam",
  );

  return fetchJson(url).andThen((raw) => {
    const parsed = ReverseResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return errAsync<ReverseGeocodeResult | null, PdokError>({
        message: `Unexpected PDOK reverse response shape: ${parsed.error.message}`,
      });
    }
    return okAsync(parsed.data.response.docs[0] ?? null);
  });
}
