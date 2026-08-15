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
  title: z.string(),
  description: z.string(),
  startAt: z.string(),
  endAt: z.string().nullable(),
  locationKind: z.enum(["precise_address", "city_only", "meeting_point_city_only", "location_tbd"]),
  placeId: z.string(),
  locationDescription: z.string(),
  locationStreet: z.string().nullable(),
  locationHouseNumber: z.string().nullable(),
  locationPostcode: z.string().nullable(),
  locationLat: z.number().nullable(),
  locationLng: z.number().nullable(),
  locationPdokId: z.string().nullable(),
  mapUrl: z.string().nullable(),
  contactInfo: z.string().nullable(),
  registrationInstructions: z.string().nullable(),
  externalEventUrl: z.string().nullable(),
  registrationUrl: z.string().nullable(),
  publisherUserId: z.string(),
  status: z.enum(["hidden", "visible", "cancelled"]),
  cancelReason: z.string().nullable(),
  isFeatured: z.boolean(),
});
export type EventJson = z.infer<typeof EventJsonSchema>;

export function toEventJson(event: Event): EventJson {
  return {
    id: event.id.value,
    slug: event.slug,
    title: event.title,
    description: event.description,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt?.toISOString() ?? null,
    locationKind: event.locationKind,
    placeId: event.placeId,
    locationDescription: event.locationDescription,
    locationStreet: event.locationStreet,
    locationHouseNumber: event.locationHouseNumber,
    locationPostcode: event.locationPostcode,
    locationLat: event.locationLat,
    locationLng: event.locationLng,
    locationPdokId: event.locationPdokId,
    mapUrl: event.mapUrl,
    contactInfo: event.contactInfo,
    registrationInstructions: event.registrationInstructions,
    externalEventUrl: event.externalEventUrl,
    registrationUrl: event.registrationUrl,
    publisherUserId: event.publisherUserId.value,
    status: event.status,
    cancelReason: event.cancelReason,
    isFeatured: event.isFeatured,
  };
}

/** Request body shared by create (POST) and update (PATCH). */
export const EventRequestSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable(),
  locationKind: z.enum(["precise_address", "city_only", "meeting_point_city_only", "location_tbd"]),
  placeId: z.string().uuid(),
  locationDescription: z.string().min(1),
  /** Only meaningful when locationKind = precise_address; the selected PDOK suggestion's id. */
  pdokAddressId: z.string().nullable(),
  mapUrl: z.string().nullable(),
  contactInfo: z.string().nullable(),
  registrationInstructions: z.string().nullable(),
  externalEventUrl: z.string().nullable(),
  registrationUrl: z.string().nullable(),
});
export type EventRequest = z.infer<typeof EventRequestSchema>;
