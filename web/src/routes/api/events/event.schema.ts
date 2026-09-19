import { z } from "zod";
import type { Event } from "~/domain/events/event";

/**
 * Shared response shape for every events route (list/detail/create/update/
 * status). Split out (like every other *.schema.ts in this app) so pages
 * can import it without pulling the route handlers' server-only dependency
 * chain (eventService -> postgres) into the client bundle.
 */
export const EventJsonSchema = z.object({
  id: z.string(),
  slug: z.string(),
  titleNl: z.string().nullable(),
  titleEn: z.string().nullable(),
  descriptionNl: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  startAt: z.string(),
  startTimeKnown: z.boolean(),
  endAt: z.string().nullable(),
  endTimeKnown: z.boolean(),
  locationKind: z.enum(["precise_address", "meeting_point_city_only"]),
  placeId: z.string(),
  /** Resolved server-side only by the events list endpoint (GET /api/events) - null everywhere else (single-event fetches, mutation responses), since nothing there renders it. */
  municipalityName: z.string().nullable(),
  locationDescription: z.string(),
  locationStreet: z.string().nullable(),
  locationHouseNumber: z.string().nullable(),
  locationPostcode: z.string().nullable(),
  locationLat: z.number().nullable(),
  locationLng: z.number().nullable(),
  locationPdokId: z.string().nullable(),
  mapUrl: z.string().nullable(),
  externalEventUrl: z.string().nullable(),
  registrationUrl: z.string().nullable(),
  organizerName: z.string().nullable(),
  flyerFullImageId: z.string().nullable(),
  flyerPreviewImageId: z.string().nullable(),
  flyerThumbnailImageId: z.string().nullable(),
  publisherUserId: z.string().nullable(),
  publisherOrgId: z.string().nullable(),
  status: z.enum(["draft", "hidden", "visible", "cancelled"]),
  statusReason: z.string().nullable(),
  isFeatured: z.boolean(),
  /** Server-computed via canModifyEvent (event_service.ts) - the single source of truth for who may edit/moderate this event, so pages render controls from this instead of re-deriving the permission-matrix rule client-side. */
  canEdit: z.boolean(),
  /** Server-computed via canLinkEventOrg (event_service.ts) - stricter than canEdit: only site_admin or the event's own creator may attach/detach its organization, regardless of who else may otherwise edit it. */
  canManageOrgLink: z.boolean(),
});
export type EventJson = z.infer<typeof EventJsonSchema>;

/**
 * canEdit is passed in rather than computed here (which would require
 * importing canModifyEvent from event_service.ts, pulling its postgres/
 * server-only dependency chain into the client bundle - this file is
 * imported directly by client pages, e.g. events/[slug]/edit.tsx). Callers
 * compute it server-side via canModifyEvent(event, actingUser) and pass the
 * plain boolean through.
 */
export function toEventJson(
  event: Event,
  canEdit: boolean,
  canManageOrgLink: boolean,
  municipalityName: string | null = null,
): EventJson {
  return {
    id: event.id.value,
    slug: event.slug,
    titleNl: event.titleNl,
    titleEn: event.titleEn,
    descriptionNl: event.descriptionNl,
    descriptionEn: event.descriptionEn,
    startAt: event.startAt.toISOString(),
    startTimeKnown: event.startTimeKnown,
    endAt: event.endAt?.toISOString() ?? null,
    endTimeKnown: event.endTimeKnown,
    locationKind: event.locationKind,
    placeId: event.placeId,
    municipalityName,
    locationDescription: event.locationDescription,
    locationStreet: event.locationStreet,
    locationHouseNumber: event.locationHouseNumber,
    locationPostcode: event.locationPostcode,
    locationLat: event.locationLat,
    locationLng: event.locationLng,
    locationPdokId: event.locationPdokId,
    mapUrl: event.mapUrl,
    externalEventUrl: event.externalEventUrl,
    registrationUrl: event.registrationUrl,
    organizerName: event.organizerName,
    flyerFullImageId: event.flyerFullImageId,
    flyerPreviewImageId: event.flyerPreviewImageId,
    flyerThumbnailImageId: event.flyerThumbnailImageId,
    publisherUserId: event.publisherUserId?.value ?? null,
    publisherOrgId: event.publisherOrgId?.value ?? null,
    status: event.status,
    statusReason: event.statusReason,
    isFeatured: event.isFeatured,
    canEdit,
    canManageOrgLink,
  };
}

/** Request body shared by create (POST) and update (PATCH). */
export const EventRequestSchema = z.object({
  titleNl: z.string().nullable(),
  titleEn: z.string().nullable(),
  descriptionNl: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  startAt: z.string().datetime(),
  startTimeKnown: z.boolean(),
  endAt: z.string().datetime().nullable(),
  endTimeKnown: z.boolean(),
  locationKind: z.enum(["precise_address", "meeting_point_city_only"]),
  /** Required unless locationKind = precise_address, where the server resolves it from the PDOK lookup instead. */
  placeId: z.string().uuid().nullable(),
  locationDescription: z.string().min(1),
  /** Required when locationKind = precise_address - the selected PDOK suggestion's id. */
  pdokAddressId: z.string().nullable(),
  mapUrl: z.string().nullable(),
  externalEventUrl: z.string().nullable(),
  registrationUrl: z.string().nullable(),
  /** Publish as this org instead of as the caller - the caller must belong to it. Ignored on update (who publishes an event never changes after creation). */
  orgId: z.string().uuid().nullable(),
  /**
   * Which button the publisher clicked (Save as draft / Publish). Required
   * on create; optional on update, where omitting it leaves the event's
   * current status untouched - see event_service.ts's updateEvent for why
   * it's otherwise only honored while the event is still a draft.
   */
  status: z.enum(["draft", "visible"]).optional(),
});
export type EventRequest = z.infer<typeof EventRequestSchema>;
