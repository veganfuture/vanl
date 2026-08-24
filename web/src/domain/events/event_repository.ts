import { err, ok, okAsync, ResultAsync, type Result } from "neverthrow";
import type postgres from "postgres";
import { z } from "zod";
import { UserId } from "../auth/user_id";
import { OrganizationId } from "../organizations/organization_id";
import type { Event, EventLocationKind, EventSource, EventStatus } from "./event";
import { EventId } from "./event_id";

/**
 * Repositories are the only code in this project allowed to write SQL - see
 * auth_repository.ts for the fuller rationale (also applies here).
 */

export type DbError = { readonly message: string; readonly cause: unknown };

const EventRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title_nl: z.string().nullable(),
  title_en: z.string().nullable(),
  description_nl: z.string().nullable(),
  description_en: z.string().nullable(),
  start_at: z.coerce.date(),
  end_at: z.coerce.date().nullable(),
  location_kind: z.enum(["precise_address", "meeting_point_city_only"]),
  place_id: z.string(),
  location_description: z.string(),
  location_street: z.string().nullable(),
  location_house_number: z.string().nullable(),
  location_postcode: z.string().nullable(),
  location_lat: z.number().nullable(),
  location_lng: z.number().nullable(),
  location_pdok_id: z.string().nullable(),
  map_url: z.string().nullable(),
  external_event_url: z.string().nullable(),
  registration_url: z.string().nullable(),
  organizer_name: z.string().nullable(),
  flyer_full_image_id: z.string().nullable(),
  flyer_preview_image_id: z.string().nullable(),
  flyer_thumbnail_image_id: z.string().nullable(),
  publisher_user_id: z.string().nullable(),
  publisher_org_id: z.string().nullable(),
  publisher_user_visible: z.boolean(),
  status: z.enum(["hidden", "visible", "cancelled"]),
  cancel_reason: z.string().nullable(),
  is_featured: z.boolean(),
  source: z.enum(["manual", "signal_import", "animalrightscalendar.com"]),
  external_source_id: z.string().nullable(),
  created_by: z.string(),
  updated_by: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

/**
 * Rows come from a table whose columns are constrained (CHECKs, not-null,
 * uniqueness) so id/publisher_user_id/etc. should always be parseable - a
 * failure here means the database and this code have drifted, not that a
 * caller passed bad input. Same reasoning as auth_repository.ts's mapUserRow.
 */
function mapEventRow(row: unknown): Result<Event, DbError> {
  const parsedRow = EventRowSchema.safeParse(row);
  if (!parsedRow.success) {
    return err({
      message: `Corrupt events row: ${parsedRow.error.message}`,
      cause: parsedRow.error,
    });
  }
  const parsed = parsedRow.data;

  const idResult = EventId.from_string(parsed.id);
  if (idResult.isErr()) {
    return err({ message: `Corrupt events row: ${idResult.error.message}`, cause: idResult.error });
  }
  // Exactly one of these is non-null - enforced by the events_exactly_one_publisher CHECK.
  let publisherUserId: UserId | null = null;
  if (parsed.publisher_user_id !== null) {
    const publisherUserIdResult = UserId.from_string(parsed.publisher_user_id);
    if (publisherUserIdResult.isErr()) {
      return err({
        message: `Corrupt events row: ${publisherUserIdResult.error.message}`,
        cause: publisherUserIdResult.error,
      });
    }
    publisherUserId = publisherUserIdResult.value;
  }
  let publisherOrgId: OrganizationId | null = null;
  if (parsed.publisher_org_id !== null) {
    const publisherOrgIdResult = OrganizationId.from_string(parsed.publisher_org_id);
    if (publisherOrgIdResult.isErr()) {
      return err({
        message: `Corrupt events row: ${publisherOrgIdResult.error.message}`,
        cause: publisherOrgIdResult.error,
      });
    }
    publisherOrgId = publisherOrgIdResult.value;
  }
  const createdByResult = UserId.from_string(parsed.created_by);
  if (createdByResult.isErr()) {
    return err({
      message: `Corrupt events row: ${createdByResult.error.message}`,
      cause: createdByResult.error,
    });
  }
  const updatedByResult = UserId.from_string(parsed.updated_by);
  if (updatedByResult.isErr()) {
    return err({
      message: `Corrupt events row: ${updatedByResult.error.message}`,
      cause: updatedByResult.error,
    });
  }

  return ok({
    id: idResult.value,
    slug: parsed.slug,
    titleNl: parsed.title_nl,
    titleEn: parsed.title_en,
    descriptionNl: parsed.description_nl,
    descriptionEn: parsed.description_en,
    startAt: parsed.start_at,
    endAt: parsed.end_at,
    locationKind: parsed.location_kind,
    placeId: parsed.place_id,
    locationDescription: parsed.location_description,
    locationStreet: parsed.location_street,
    locationHouseNumber: parsed.location_house_number,
    locationPostcode: parsed.location_postcode,
    locationLat: parsed.location_lat,
    locationLng: parsed.location_lng,
    locationPdokId: parsed.location_pdok_id,
    mapUrl: parsed.map_url,
    externalEventUrl: parsed.external_event_url,
    registrationUrl: parsed.registration_url,
    organizerName: parsed.organizer_name,
    flyerFullImageId: parsed.flyer_full_image_id,
    flyerPreviewImageId: parsed.flyer_preview_image_id,
    flyerThumbnailImageId: parsed.flyer_thumbnail_image_id,
    publisherUserId,
    publisherOrgId,
    publisherUserVisible: parsed.publisher_user_visible,
    status: parsed.status,
    cancelReason: parsed.cancel_reason,
    isFeatured: parsed.is_featured,
    source: parsed.source,
    externalSourceId: parsed.external_source_id,
    createdBy: createdByResult.value,
    updatedBy: updatedByResult.value,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  });
}

export type NewEventInput = {
  slug: string;
  titleNl: string | null;
  titleEn: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  startAt: Date;
  endAt: Date | null;
  locationKind: EventLocationKind;
  placeId: string;
  locationDescription: string;
  locationStreet: string | null;
  locationHouseNumber: string | null;
  locationPostcode: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationPdokId: string | null;
  mapUrl: string | null;
  externalEventUrl: string | null;
  registrationUrl: string | null;
  organizerName: string | null;
  /** Exactly one of publisherUserId/publisherOrgId must be set - enforced by a DB CHECK. */
  publisherUserId: UserId | null;
  publisherOrgId: OrganizationId | null;
  createdBy: UserId;
  source: EventSource;
  externalSourceId: string | null;
};

export type EditableEventFields = Omit<
  NewEventInput,
  | "slug"
  | "publisherUserId"
  | "publisherOrgId"
  | "createdBy"
  | "source"
  | "externalSourceId"
  | "organizerName"
>;

export class EventRepository {
  constructor(private readonly sql: postgres.Sql) {}

  createEvent(input: NewEventInput): ResultAsync<Event, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        insert into events (
          slug, title_nl, title_en, description_nl, description_en, start_at, end_at,
          location_kind, place_id, location_description, location_street,
          location_house_number, location_postcode, location_lat, location_lng,
          location_pdok_id, map_url, external_event_url, registration_url, organizer_name,
          publisher_user_id, publisher_org_id, created_by, updated_by, source, external_source_id
        )
        values (
          ${input.slug}, ${input.titleNl}, ${input.titleEn}, ${input.descriptionNl},
          ${input.descriptionEn}, ${input.startAt}, ${input.endAt}, ${input.locationKind},
          ${input.placeId}, ${input.locationDescription}, ${input.locationStreet},
          ${input.locationHouseNumber}, ${input.locationPostcode}, ${input.locationLat},
          ${input.locationLng}, ${input.locationPdokId}, ${input.mapUrl},
          ${input.externalEventUrl}, ${input.registrationUrl}, ${input.organizerName},
          ${input.publisherUserId?.value ?? null}, ${input.publisherOrgId?.value ?? null},
          ${input.createdBy.value}, ${input.createdBy.value}, ${input.source},
          ${input.externalSourceId}
        )
        returning *
      `,
      (cause): DbError => ({ message: "Failed to create event", cause }),
    ).andThen((rows) => mapEventRow(rows[0]));
  }

  findEventBySourceAndExternalId(
    source: EventSource,
    externalSourceId: string,
  ): ResultAsync<Event | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select * from events where source = ${source} and external_source_id = ${externalSourceId}
      `,
      (cause): DbError => ({ message: "Failed to find event by source and external id", cause }),
    ).andThen((rows): Result<Event | null, DbError> => (rows[0] ? mapEventRow(rows[0]) : ok(null)));
  }

  findEventBySlug(slug: string): ResultAsync<Event | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`select * from events where slug = ${slug}`,
      (cause): DbError => ({ message: "Failed to find event by slug", cause }),
    ).andThen((rows): Result<Event | null, DbError> => (rows[0] ? mapEventRow(rows[0]) : ok(null)));
  }

  findEventById(id: EventId): ResultAsync<Event | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`select * from events where id = ${id.value}`,
      (cause): DbError => ({ message: "Failed to find event by id", cause }),
    ).andThen((rows): Result<Event | null, DbError> => (rows[0] ? mapEventRow(rows[0]) : ok(null)));
  }

  /**
   * Basic, unfiltered public listing (Milestone 3 scope - city/province
   * filtering and past-event exclusion arrive in Milestone 4). Only
   * `visible` events, soonest first.
   */
  listVisibleEvents(): ResultAsync<Event[], DbError> {
    return ResultAsync.fromPromise(
      this.sql`select * from events where status = 'visible' order by start_at asc`,
      (cause): DbError => ({ message: "Failed to list visible events", cause }),
    ).andThen((rows) => {
      const mapped: Event[] = [];
      for (const row of rows) {
        const result = mapEventRow(row);
        if (result.isErr()) {
          return err<Event[], DbError>(result.error);
        }
        mapped.push(result.value);
      }
      return ok(mapped);
    });
  }

  /** All of a publisher's own events regardless of status, soonest first - backs "My events". */
  listEventsByPublisher(publisherUserId: UserId): ResultAsync<Event[], DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select * from events where publisher_user_id = ${publisherUserId.value} order by start_at asc
      `,
      (cause): DbError => ({ message: "Failed to list events by publisher", cause }),
    ).andThen((rows) => {
      const mapped: Event[] = [];
      for (const row of rows) {
        const result = mapEventRow(row);
        if (result.isErr()) {
          return err<Event[], DbError>(result.error);
        }
        mapped.push(result.value);
      }
      return ok(mapped);
    });
  }

  /** Every event published by any of these orgs, regardless of status - the org half of "My events". */
  listEventsByOrgIds(orgIds: string[]): ResultAsync<Event[], DbError> {
    if (orgIds.length === 0) {
      return okAsync([]);
    }
    return ResultAsync.fromPromise(
      this.sql`
        select * from events where publisher_org_id = any(${orgIds}) order by start_at asc
      `,
      (cause): DbError => ({ message: "Failed to list events by org", cause }),
    ).andThen((rows) => {
      const mapped: Event[] = [];
      for (const row of rows) {
        const result = mapEventRow(row);
        if (result.isErr()) {
          return err<Event[], DbError>(result.error);
        }
        mapped.push(result.value);
      }
      return ok(mapped);
    });
  }

  updateEvent(
    id: EventId,
    fields: EditableEventFields,
    updatedBy: UserId,
  ): ResultAsync<Event, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        update events set
          title_nl = ${fields.titleNl},
          title_en = ${fields.titleEn},
          description_nl = ${fields.descriptionNl},
          description_en = ${fields.descriptionEn},
          start_at = ${fields.startAt},
          end_at = ${fields.endAt},
          location_kind = ${fields.locationKind},
          place_id = ${fields.placeId},
          location_description = ${fields.locationDescription},
          location_street = ${fields.locationStreet},
          location_house_number = ${fields.locationHouseNumber},
          location_postcode = ${fields.locationPostcode},
          location_lat = ${fields.locationLat},
          location_lng = ${fields.locationLng},
          location_pdok_id = ${fields.locationPdokId},
          map_url = ${fields.mapUrl},
          external_event_url = ${fields.externalEventUrl},
          registration_url = ${fields.registrationUrl},
          updated_by = ${updatedBy.value},
          updated_at = now()
        where id = ${id.value}
        returning *
      `,
      (cause): DbError => ({ message: "Failed to update event", cause }),
    ).andThen((rows) => mapEventRow(rows[0]));
  }

  setEventStatus(
    id: EventId,
    status: EventStatus,
    cancelReason: string | null,
    updatedBy: UserId,
  ): ResultAsync<Event, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        update events set status = ${status}, cancel_reason = ${cancelReason},
          updated_by = ${updatedBy.value}, updated_at = now()
        where id = ${id.value}
        returning *
      `,
      (cause): DbError => ({ message: "Failed to set event status", cause }),
    ).andThen((rows) => mapEventRow(rows[0]));
  }

  /** Repoints all three flyer variants at once - a dedicated narrow update, not part of the general edit form. */
  setEventFlyer(
    id: EventId,
    fullImageId: string,
    previewImageId: string,
    thumbnailImageId: string,
    updatedBy: UserId,
  ): ResultAsync<Event, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        update events set
          flyer_full_image_id = ${fullImageId},
          flyer_preview_image_id = ${previewImageId},
          flyer_thumbnail_image_id = ${thumbnailImageId},
          updated_by = ${updatedBy.value},
          updated_at = now()
        where id = ${id.value}
        returning *
      `,
      (cause): DbError => ({ message: "Failed to set event flyer", cause }),
    ).andThen((rows) => mapEventRow(rows[0]));
  }

  /** Hard delete - see docs/architecture.md's Event notes on why. */
  deleteEvent(id: EventId): ResultAsync<void, DbError> {
    return ResultAsync.fromPromise(
      this.sql`delete from events where id = ${id.value}`,
      (cause): DbError => ({ message: "Failed to delete event", cause }),
    ).map(() => undefined);
  }
}
