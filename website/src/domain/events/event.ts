import type { UserId } from "../auth/user_id";
import type { EventId } from "./event_id";

export type EventLocationKind =
  "precise_address" | "city_only" | "meeting_point_city_only" | "location_tbd";

export type EventStatus = "hidden" | "visible" | "cancelled";

export type EventSource = "manual" | "signal_import" | "partner_import";

export type Event = {
  id: EventId;
  slug: string;
  title: string;
  description: string;
  startAt: Date;
  endAt: Date | null;
  locationKind: EventLocationKind;
  /** Canonical woonplaats. A foreign key, not wrapped in a value class - see Place. */
  placeId: string;
  locationDescription: string;
  /** Best-effort PDOK Locatieserver result; only ever set for locationKind = precise_address. */
  locationStreet: string | null;
  locationHouseNumber: string | null;
  locationPostcode: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationPdokId: string | null;
  mapUrl: string | null;
  contactInfo: string | null;
  registrationInstructions: string | null;
  externalEventUrl: string | null;
  registrationUrl: string | null;
  publisherUserId: UserId;
  publisherUserVisible: boolean;
  status: EventStatus;
  cancelReason: string | null;
  isFeatured: boolean;
  source: EventSource;
  externalSourceId: string | null;
  createdBy: UserId;
  updatedBy: UserId;
  createdAt: Date;
  updatedAt: Date;
};
