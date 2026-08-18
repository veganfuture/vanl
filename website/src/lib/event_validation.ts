import { err, ok, type Result } from "neverthrow";
import type { Locale } from "./i18n";

/**
 * The business rules for a savable event, shared verbatim between the
 * client (EventForm - to tell the publisher exactly what's still missing
 * before they can submit) and the server (EventService - the actual
 * authority, so the client's messages can never drift from what the server
 * will actually accept).
 *
 * Deliberately imports nothing from src/domain/ (not even types) - this
 * file ships in the client bundle, so it must never be able to reach into
 * the backend domain layer, even accidentally through a type-only import
 * that happens to be safe today but stops being safe the next time someone
 * edits that file.
 */
export type EventLocationKind = "precise_address" | "meeting_point_city_only";

/** Mirrors the DB CHECK constraints in migrations/0006_field_length_limits.sql and event_service.ts's EventInputSchema - kept here too so EventForm can set matching maxlength attributes and show a friendly message before ever hitting the server. */
export const EVENT_TITLE_MAX_LENGTH = 200;
export const EVENT_DESCRIPTION_MAX_LENGTH = 10000;
export const EVENT_LOCATION_DESCRIPTION_MAX_LENGTH = 500;
export const EVENT_URL_MAX_LENGTH = 2000;

export type ValidatableEvent = {
  titleNl: string | null;
  titleEn: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  startAt: Date | null;
  endAt: Date | null;
  locationKind: EventLocationKind;
  placeId: string | null;
  locationDescription: string | null;
  pdokAddressId: string | null;
  mapUrl: string | null;
  externalEventUrl: string | null;
  registrationUrl: string | null;
};

export type ValidateEventOptions = {
  lang: Locale;
  /** New events can't start in the past - editing an already-started event isn't restricted. */
  requireFutureStart: boolean;
};

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Validates an event, returning every reason it can't be saved yet (not just the first). */
export function validateEvent(
  input: ValidatableEvent,
  options: ValidateEventOptions,
): Result<void, string[]> {
  const t = (nl: string, en: string) => (options.lang === "nl" ? nl : en);
  const messages: string[] = [];

  const hasTitleNl = !!input.titleNl?.trim();
  const hasTitleEn = !!input.titleEn?.trim();
  const hasDescriptionNl = !!input.descriptionNl?.trim();
  const hasDescriptionEn = !!input.descriptionEn?.trim();

  if (!hasTitleNl && !hasTitleEn) {
    messages.push(
      t(
        "Vul een titel in (Nederlands, Engels, of beide).",
        "Enter a title (Dutch, English, or both).",
      ),
    );
  }
  if (hasTitleNl !== hasDescriptionNl) {
    messages.push(
      t(
        "De Nederlandse titel en beschrijving moeten samen worden ingevuld.",
        "The Dutch title and description must be given together.",
      ),
    );
  }
  if (hasTitleEn !== hasDescriptionEn) {
    messages.push(
      t(
        "De Engelse titel en beschrijving moeten samen worden ingevuld.",
        "The English title and description must be given together.",
      ),
    );
  }

  const titleFields: Array<[string | null, string]> = [
    [input.titleNl, t("De titel (Nederlands)", "The title (Dutch)")],
    [input.titleEn, t("De titel (Engels)", "The title (English)")],
  ];
  for (const [value, label] of titleFields) {
    if (value && value.trim().length > EVENT_TITLE_MAX_LENGTH) {
      messages.push(
        t(
          `${label} mag maximaal ${EVENT_TITLE_MAX_LENGTH} tekens zijn.`,
          `${label} must be at most ${EVENT_TITLE_MAX_LENGTH} characters.`,
        ),
      );
    }
  }
  const descriptionFields: Array<[string | null, string]> = [
    [input.descriptionNl, t("De beschrijving (Nederlands)", "The description (Dutch)")],
    [input.descriptionEn, t("De beschrijving (Engels)", "The description (English)")],
  ];
  for (const [value, label] of descriptionFields) {
    if (value && value.trim().length > EVENT_DESCRIPTION_MAX_LENGTH) {
      messages.push(
        t(
          `${label} mag maximaal ${EVENT_DESCRIPTION_MAX_LENGTH} tekens zijn.`,
          `${label} must be at most ${EVENT_DESCRIPTION_MAX_LENGTH} characters.`,
        ),
      );
    }
  }

  if (!input.startAt) {
    messages.push(t("Kies een startdatum en -tijd.", "Choose a start date and time."));
  } else if (options.requireFutureStart && input.startAt <= new Date()) {
    messages.push(
      t("De startdatum mag niet in het verleden liggen.", "The start date can't be in the past."),
    );
  }
  if (input.startAt && input.endAt && input.endAt <= input.startAt) {
    messages.push(
      t("De einddatum moet na de startdatum liggen.", "The end date must be after the start date."),
    );
  }

  if (input.locationKind === "precise_address") {
    if (!input.pdokAddressId) {
      messages.push(t("Zoek en kies een adres.", "Search and pick an address."));
    }
  } else if (!input.placeId) {
    messages.push(t("Zoek en kies een stad of plaats.", "Search and pick a city or town."));
  }

  if (!input.locationDescription?.trim()) {
    messages.push(t("Vul een locatiebeschrijving in.", "Enter a location description."));
  } else if (input.locationDescription.trim().length > EVENT_LOCATION_DESCRIPTION_MAX_LENGTH) {
    messages.push(
      t(
        `De locatiebeschrijving mag maximaal ${EVENT_LOCATION_DESCRIPTION_MAX_LENGTH} tekens zijn.`,
        `The location description must be at most ${EVENT_LOCATION_DESCRIPTION_MAX_LENGTH} characters.`,
      ),
    );
  }

  const urlFields: Array<[string | null, string]> = [
    [input.mapUrl, t("Kaart-URL", "Map URL")],
    [input.externalEventUrl, t("Externe evenement-URL", "External event URL")],
    [input.registrationUrl, t("Aanmeld-URL", "Registration URL")],
  ];
  for (const [value, label] of urlFields) {
    if (value && !isValidUrl(value)) {
      messages.push(t(`${label} is geen geldige URL.`, `${label} is not a valid URL.`));
    } else if (value && value.length > EVENT_URL_MAX_LENGTH) {
      messages.push(
        t(
          `${label} mag maximaal ${EVENT_URL_MAX_LENGTH} tekens zijn.`,
          `${label} must be at most ${EVENT_URL_MAX_LENGTH} characters.`,
        ),
      );
    }
  }

  return messages.length > 0 ? err(messages) : ok(undefined);
}
