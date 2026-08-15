import type { UserId } from "../auth/user_id";
import type { EventId } from "./event_id";

export type EventLocationKind = "precise_address" | "meeting_point_city_only";

export type EventStatus = "hidden" | "visible" | "cancelled";

export type EventSource = "manual" | "signal_import" | "partner_import";

export type Event = {
  id: EventId;
  slug: string;
  /** Bilingual: a publisher fills in either language or both - never both null. */
  titleNl: string | null;
  titleEn: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  startAt: Date;
  endAt: Date | null;
  locationKind: EventLocationKind;
  /** Canonical woonplaats. A foreign key, not wrapped in a value class - see Place. */
  placeId: string;
  locationDescription: string;
  /** PDOK Locatieserver result; always set for locationKind = precise_address, always null otherwise. */
  locationStreet: string | null;
  locationHouseNumber: string | null;
  locationPostcode: string | null;
  locationLat: number | null;
  locationLng: number | null;
  locationPdokId: string | null;
  mapUrl: string | null;
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
