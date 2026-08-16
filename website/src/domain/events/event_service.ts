import { err, errAsync, ok, okAsync, ResultAsync, type Result } from "neverthrow";
import { z } from "zod";
import type { ActingUser } from "~/lib/acting-user";
import { sql } from "~/lib/db";
import { logger } from "~/lib/logger";
import { placeRepository, type PlaceRepository } from "~/domain/places/place_repository";
import { OrganizationId } from "~/domain/organizations/organization_id";
import type { UserId } from "../auth/user_id";
import type { Event, EventLocationKind } from "./event";
import { EventRepository, type EditableEventFields } from "./event_repository";
import type { EventId } from "./event_id";
import { validateEvent } from "~/lib/event_validation";
import { lookupAddress } from "./pdok-client";
import { generateSlug } from "~/lib/slug";

export type { ActingUser };

/**
 * Same shape whether creating or updating - the caller (route layer) is
 * expected to have already parsed raw request JSON into these types (dates
 * as Date, absent optional fields as null, never ""). Business-rule
 * validation (required-ness, cross-field constraints) is delegated to
 * validateEvent (~/lib/event_validation.ts), shared with the client so its
 * rules can never drift from what the server actually accepts.
 */
export type EventInput = {
  /** Bilingual: a publisher fills in either language or both - at least one of each pair is required. */
  titleNl: string | null;
  titleEn: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  startAt: Date;
  endAt: Date | null;
  locationKind: EventLocationKind;
  /** Required unless locationKind = precise_address, where it's resolved from the PDOK lookup instead. */
  placeId: string | null;
  locationDescription: string;
  /** Required when locationKind = precise_address - the selected PDOK suggestion's id. Ignored otherwise. */
  pdokAddressId: string | null;
  mapUrl: string | null;
  externalEventUrl: string | null;
  registrationUrl: string | null;
  /** Publish on behalf of this org instead of as the caller themselves - the caller must belong to it (any role). Null publishes as the caller. */
  orgId: string | null;
};

const nullableTrimmed = z
  .string()
  .nullable()
  .transform((v) => v?.trim() || null);

/**
 * Shape/type coercion only - trimming, nullable transforms, and defensive
 * format guards (uuid/url) against a malformed request body. The actual
 * business rules (required-ness, cross-field constraints, friendly
 * messages) live in validateEvent, shared with the client - see there
 * for the single source of truth.
 */
const EventInputSchema = z.object({
  titleNl: nullableTrimmed,
  titleEn: nullableTrimmed,
  descriptionNl: nullableTrimmed,
  descriptionEn: nullableTrimmed,
  startAt: z.date(),
  endAt: z.date().nullable(),
  locationKind: z.enum(["precise_address", "meeting_point_city_only"]),
  placeId: z.string().uuid().nullable(),
  locationDescription: z.string().trim(),
  pdokAddressId: z.string().nullable(),
  mapUrl: z.string().trim().url().nullable(),
  externalEventUrl: z.string().trim().url().nullable(),
  registrationUrl: z.string().trim().url().nullable(),
  orgId: z.string().uuid().nullable(),
});

export type CreateEventError = "validation" | "forbidden" | "internal_error";
export type UpdateEventError = "not_found" | "forbidden" | "validation" | "internal_error";
export type SetEventStatusError = "not_found" | "forbidden" | "internal_error";
export type DeleteEventError = "not_found" | "forbidden" | "internal_error";

type PdokFields = {
  locationStreet: string | null;
  locationHouseNumber: string | null;
  locationPostcode: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationPdokId: string | null;
};

const NULL_PDOK_FIELDS: PdokFields = {
  locationStreet: null,
  locationHouseNumber: null,
  locationPostcode: null,
  locationLat: null,
  locationLng: null,
  locationPdokId: null,
};

export class EventService {
  constructor(
    private readonly repository: EventRepository,
    private readonly placeRepository: PlaceRepository,
  ) {}

  /**
   * Any authenticated user may create an event published as themselves; if
   * orgId is set, they must belong to that org (any role - permission
   * matrix §3: "Create event on behalf of an org (member of)").
   */
  createEvent(actingUser: ActingUser, input: EventInput): ResultAsync<Event, CreateEventError> {
    const parsed = EventInputSchema.safeParse(input);
    if (!parsed.success) {
      logger.warn({ err: parsed.error }, "event creation rejected: invalid input");
      return errAsync("validation");
    }
    const validation = validateEvent(parsed.data, { lang: "en", requireFutureStart: true });
    if (validation.isErr()) {
      logger.warn({ messages: validation.error }, "event creation rejected: invalid input");
      return errAsync("validation");
    }
    const publisherResult = this.resolvePublisher(actingUser, parsed.data.orgId);
    if (publisherResult.isErr()) {
      logger.warn(
        { userId: actingUser.id.value, orgId: parsed.data.orgId },
        "event creation rejected: not a member of that org",
      );
      return errAsync("forbidden");
    }
    const publisher = publisherResult.value;

    return this.resolveLocationFields(parsed.data).andThen((locationFields) =>
      this.repository
        .createEvent({
          slug: generateSlug(parsed.data.titleNl ?? parsed.data.titleEn ?? ""),
          titleNl: parsed.data.titleNl,
          titleEn: parsed.data.titleEn,
          descriptionNl: parsed.data.descriptionNl,
          descriptionEn: parsed.data.descriptionEn,
          startAt: parsed.data.startAt,
          endAt: parsed.data.endAt,
          locationKind: parsed.data.locationKind,
          locationDescription: parsed.data.locationDescription,
          ...locationFields,
          mapUrl: parsed.data.mapUrl,
          externalEventUrl: parsed.data.externalEventUrl,
          registrationUrl: parsed.data.registrationUrl,
          organizerName: null,
          publisherUserId: publisher.publisherUserId,
          publisherOrgId: publisher.publisherOrgId,
          createdBy: actingUser.id,
          source: "manual",
          externalSourceId: null,
        })
        .mapErr((dbError): CreateEventError => {
          logger.error({ err: dbError }, "failed to create event");
          return "internal_error";
        }),
    );
  }

  /** Public - no auth required (permission matrix §3: visitors can view events). */
  getEventBySlug(slug: string): ResultAsync<Event | null, never> {
    return this.repository.findEventBySlug(slug).orElse((dbError) => {
      logger.error({ err: dbError }, "failed to look up event by slug");
      return okAsync(null);
    });
  }

  /** Public, basic/unfiltered (Milestone 4 adds city/province filtering and past-event handling). */
  listVisibleEvents(): ResultAsync<Event[], never> {
    return this.repository.listVisibleEvents().orElse((dbError) => {
      logger.error({ err: dbError }, "failed to list visible events");
      return okAsync([]);
    });
  }

  /**
   * "My events" - every status, not just visible, since it's for managing
   * your own events: everything published as the caller themselves, unioned
   * with everything published by any org they belong to (any role).
   */
  listMyEvents(actingUser: ActingUser): ResultAsync<Event[], never> {
    const orgIds = [...actingUser.orgRoles.keys()];
    return ResultAsync.combine([
      this.repository.listEventsByPublisher(actingUser.id),
      this.repository.listEventsByOrgIds(orgIds),
    ])
      .map(([ownEvents, orgEvents]) =>
        [...ownEvents, ...orgEvents].sort((a, b) => a.startAt.getTime() - b.startAt.getTime()),
      )
      .orElse((dbError) => {
        logger.error({ err: dbError }, "failed to list my events");
        return okAsync([]);
      });
  }

  updateEvent(
    actingUser: ActingUser,
    eventId: EventId,
    input: EventInput,
  ): ResultAsync<Event, UpdateEventError> {
    return this.loadForModification(actingUser, eventId).andThen(() => {
      const parsed = EventInputSchema.safeParse(input);
      if (!parsed.success) {
        logger.warn({ err: parsed.error }, "event update rejected: invalid input");
        return errAsync<Event, UpdateEventError>("validation");
      }
      const validation = validateEvent(parsed.data, { lang: "en", requireFutureStart: false });
      if (validation.isErr()) {
        logger.warn({ messages: validation.error }, "event update rejected: invalid input");
        return errAsync<Event, UpdateEventError>("validation");
      }
      return this.resolveLocationFields(parsed.data).andThen((locationFields) => {
        const fields: EditableEventFields = {
          titleNl: parsed.data.titleNl,
          titleEn: parsed.data.titleEn,
          descriptionNl: parsed.data.descriptionNl,
          descriptionEn: parsed.data.descriptionEn,
          startAt: parsed.data.startAt,
          endAt: parsed.data.endAt,
          locationKind: parsed.data.locationKind,
          locationDescription: parsed.data.locationDescription,
          ...locationFields,
          mapUrl: parsed.data.mapUrl,
          externalEventUrl: parsed.data.externalEventUrl,
          registrationUrl: parsed.data.registrationUrl,
        };
        return this.repository.updateEvent(eventId, fields, actingUser.id).mapErr((dbError) => {
          logger.error({ err: dbError }, "failed to update event");
          return "internal_error" as const;
        });
      });
    });
  }

  setEventStatus(
    actingUser: ActingUser,
    eventId: EventId,
    status: Event["status"],
    cancelReason: string | null,
  ): ResultAsync<Event, SetEventStatusError> {
    return this.loadForModification(actingUser, eventId).andThen(() =>
      this.repository
        .setEventStatus(eventId, status, cancelReason, actingUser.id)
        .mapErr((dbError): SetEventStatusError => {
          logger.error({ err: dbError }, "failed to set event status");
          return "internal_error";
        }),
    );
  }

  /** Hard delete - see docs/architecture.md's Event notes on why. */
  deleteEvent(actingUser: ActingUser, eventId: EventId): ResultAsync<void, DeleteEventError> {
    return this.loadForModification(actingUser, eventId).andThen(() =>
      this.repository.deleteEvent(eventId).mapErr((dbError): DeleteEventError => {
        logger.error({ err: dbError }, "failed to delete event");
        return "internal_error";
      }),
    );
  }

  /**
   * Loads the event and checks actingUser may modify it (permission matrix
   * §3): site_admin can moderate anything; an individually-published
   * event's own publisher can; an org's org_admin can touch any of that
   * org's events; an org's org_editor can only touch events they personally
   * created on behalf of that org (there's no per-event "author" distinct
   * from the org itself, so "own org event" is tracked via created_by).
   * Public: ImageService reuses this exact check for flyer uploads rather
   * than re-implementing the same authorization rules a second time.
   */
  loadForModification(
    actingUser: ActingUser,
    eventId: EventId,
  ): ResultAsync<Event, "not_found" | "forbidden" | "internal_error"> {
    return this.repository
      .findEventById(eventId)
      .mapErr((dbError): "internal_error" => {
        logger.error({ err: dbError }, "failed to look up event for modification");
        return "internal_error";
      })
      .andThen((event) => {
        if (!event) {
          return errAsync<Event, "not_found">("not_found");
        }
        if (!this.canModify(actingUser, event)) {
          return errAsync<Event, "forbidden">("forbidden");
        }
        return okAsync(event);
      });
  }

  private canModify(actingUser: ActingUser, event: Event): boolean {
    if (actingUser.isSiteAdmin) {
      return true;
    }
    if (event.publisherUserId && actingUser.id.equals(event.publisherUserId)) {
      return true;
    }
    if (event.publisherOrgId) {
      const role = actingUser.orgRoles.get(event.publisherOrgId.value);
      if (role === "org_admin") {
        return true;
      }
      if (role === "org_editor" && actingUser.id.equals(event.createdBy)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resolves who an event is published as: the caller themselves (orgId
   * null), or an org they belong to (any role qualifies - permission matrix
   * §3's "Create event on behalf of an org (member of)" row).
   */
  private resolvePublisher(
    actingUser: ActingUser,
    orgId: string | null,
  ): Result<
    { publisherUserId: UserId | null; publisherOrgId: OrganizationId | null },
    "forbidden"
  > {
    if (!orgId) {
      return ok({ publisherUserId: actingUser.id, publisherOrgId: null });
    }
    if (!actingUser.orgRoles.has(orgId)) {
      return err("forbidden");
    }
    const orgIdResult = OrganizationId.from_string(orgId);
    if (orgIdResult.isErr()) {
      return err("forbidden");
    }
    return ok({ publisherUserId: null, publisherOrgId: orgIdResult.value });
  }

  /**
   * For meeting_point_city_only, placeId comes straight from the input
   * (validateEvent already guarantees it's non-null there, called before
   * this method runs). For
   * precise_address, the PDOK free-text address search is the *only* way a
   * publisher specifies a location - there's no manual place/description
   * fallback - so both placeId and the structured PDOK fields must resolve
   * together from the same lookup, or the save fails outright.
   */
  private resolveLocationFields(
    input: z.infer<typeof EventInputSchema>,
  ): ResultAsync<PdokFields & { placeId: string }, "validation"> {
    if (input.locationKind !== "precise_address") {
      return okAsync({ placeId: input.placeId as string, ...NULL_PDOK_FIELDS });
    }

    return lookupAddress(input.pdokAddressId as string)
      .mapErr((pdokError): "validation" => {
        logger.warn(
          { err: pdokError },
          "PDOK address lookup failed; cannot resolve precise_address location",
        );
        return "validation";
      })
      .andThen((address) =>
        this.placeRepository
          .findPlaceByName(address.woonplaatsNaam)
          .mapErr((dbError): "validation" => {
            logger.error({ err: dbError }, "failed to resolve place for precise_address event");
            return "validation";
          })
          .andThen((place): ResultAsync<PdokFields & { placeId: string }, "validation"> => {
            if (!place) {
              logger.warn(
                { woonplaatsNaam: address.woonplaatsNaam },
                "PDOK-resolved city has no matching place row; cannot save precise_address event",
              );
              return errAsync("validation");
            }
            return okAsync({
              placeId: place.id,
              locationStreet: address.street,
              locationHouseNumber: address.houseNumber,
              locationPostcode: address.postcode,
              locationLat: address.lat,
              locationLng: address.lng,
              locationPdokId: address.pdokId,
            });
          }),
      );
  }
}

export const eventService = new EventService(new EventRepository(sql), placeRepository);
