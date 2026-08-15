import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { z } from "zod";
import { UserId } from "../auth/user_id";
import { sql } from "~/lib/db";
import { logger } from "~/lib/logger";
import { placeRepository, type PlaceRepository } from "~/domain/places/place_repository";
import type { Event, EventLocationKind } from "./event";
import { EventRepository, type EditableEventFields } from "./event_repository";
import type { EventId } from "./event_id";
import { lookupAddress } from "./pdok-client";
import { generateSlug } from "./slug";

/** Who's making the request, and whether they can moderate any event, not just their own. */
export type ActingUser = { readonly id: UserId; readonly isSiteAdmin: boolean };

/**
 * Same shape whether creating or updating - the caller (route layer) is
 * expected to have already parsed raw request JSON into these types (dates
 * as Date, absent optional fields as null, never ""). This service does
 * its own business-rule validation on top (non-empty after trim, endAt >
 * startAt, valid URLs), the same division of labor as auth_service.ts.
 */
export type EventInput = {
  title: string;
  description: string;
  startAt: Date;
  endAt: Date | null;
  locationKind: EventLocationKind;
  /** Required unless locationKind = precise_address, where it's resolved from the PDOK lookup instead. */
  placeId: string | null;
  locationDescription: string;
  /** Required when locationKind = precise_address - the selected PDOK suggestion's id. Ignored otherwise. */
  pdokAddressId: string | null;
  mapUrl: string | null;
  contactInfo: string | null;
  registrationInstructions: string | null;
  externalEventUrl: string | null;
  registrationUrl: string | null;
};

const EventInputSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    startAt: z.date(),
    endAt: z.date().nullable(),
    locationKind: z.enum(["precise_address", "meeting_point_city_only"]),
    placeId: z.string().uuid().nullable(),
    locationDescription: z.string().trim().min(1),
    pdokAddressId: z.string().nullable(),
    mapUrl: z.string().trim().url().nullable(),
    contactInfo: z.string().nullable(),
    registrationInstructions: z.string().nullable(),
    externalEventUrl: z.string().trim().url().nullable(),
    registrationUrl: z.string().trim().url().nullable(),
  })
  .refine((data) => data.endAt === null || data.endAt > data.startAt, {
    message: "endAt must be after startAt",
    path: ["endAt"],
  })
  .refine((data) => data.locationKind === "precise_address" || data.placeId !== null, {
    message: "placeId is required unless locationKind is precise_address",
    path: ["placeId"],
  })
  .refine((data) => data.locationKind !== "precise_address" || data.pdokAddressId !== null, {
    message: "pdokAddressId is required when locationKind is precise_address",
    path: ["pdokAddressId"],
  });

export type CreateEventError = "validation" | "internal_error";
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

  /** Any authenticated user may create an event published as themselves (permission matrix §3). */
  createEvent(publisherUserId: UserId, input: EventInput): ResultAsync<Event, CreateEventError> {
    const parsed = EventInputSchema.safeParse(input);
    if (!parsed.success) {
      logger.warn({ err: parsed.error }, "event creation rejected: invalid input");
      return errAsync("validation");
    }

    return this.resolveLocationFields(parsed.data).andThen((locationFields) =>
      this.repository
        .createEvent({
          slug: generateSlug(parsed.data.title),
          title: parsed.data.title,
          description: parsed.data.description,
          startAt: parsed.data.startAt,
          endAt: parsed.data.endAt,
          locationKind: parsed.data.locationKind,
          locationDescription: parsed.data.locationDescription,
          ...locationFields,
          mapUrl: parsed.data.mapUrl,
          contactInfo: parsed.data.contactInfo,
          registrationInstructions: parsed.data.registrationInstructions,
          externalEventUrl: parsed.data.externalEventUrl,
          registrationUrl: parsed.data.registrationUrl,
          publisherUserId,
          createdBy: publisherUserId,
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

  /** "My events" - every status, not just visible, since it's for managing your own events. */
  listEventsByPublisher(publisherUserId: UserId): ResultAsync<Event[], never> {
    return this.repository.listEventsByPublisher(publisherUserId).orElse((dbError) => {
      logger.error({ err: dbError }, "failed to list events by publisher");
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
      return this.resolveLocationFields(parsed.data).andThen((locationFields) => {
        const fields: EditableEventFields = {
          title: parsed.data.title,
          description: parsed.data.description,
          startAt: parsed.data.startAt,
          endAt: parsed.data.endAt,
          locationKind: parsed.data.locationKind,
          locationDescription: parsed.data.locationDescription,
          ...locationFields,
          mapUrl: parsed.data.mapUrl,
          contactInfo: parsed.data.contactInfo,
          registrationInstructions: parsed.data.registrationInstructions,
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
   * Loads the event and checks it's either owned by actingUser or
   * actingUser is a site_admin (moderation override - docs/milestones.md:
   * "Moderation for MVP is site-admin manual hide/delete only").
   */
  private loadForModification(
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
        if (!actingUser.isSiteAdmin && !actingUser.id.equals(event.publisherUserId)) {
          return errAsync<Event, "forbidden">("forbidden");
        }
        return okAsync(event);
      });
  }

  /**
   * For meeting_point_city_only, placeId comes straight from the input (the
   * schema refine above already guarantees it's non-null there). For
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
