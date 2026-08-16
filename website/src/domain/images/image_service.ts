import { ResultAsync } from "neverthrow";
import type { ActingUser } from "~/lib/acting-user";
import { sql } from "~/lib/db";
import { logger } from "~/lib/logger";
import type { Event } from "~/domain/events/event";
import { EventRepository } from "~/domain/events/event_repository";
import type { EventId } from "~/domain/events/event_id";
import { eventService } from "~/domain/events/event_service";
import type { Organization } from "~/domain/organizations/organization";
import { OrganizationRepository } from "~/domain/organizations/organization_repository";
import type { OrganizationId } from "~/domain/organizations/organization_id";
import { organizationService } from "~/domain/organizations/organization_service";
import { ImageRepository } from "./image_repository";
import { processUpload } from "./image_processing";

export type ReplaceEventFlyerError = "not_found" | "forbidden" | "validation" | "internal_error";
export type ReplaceOrganizationLogoError =
  "not_found" | "forbidden" | "validation" | "internal_error";

/**
 * Shared by both pipelines so an event's own flyer thumbnail and its
 * organizer's logo thumbnail (the fallback shown when the event has none -
 * see the event-list thumbnail component) are the same pixel size.
 */
const THUMBNAIL_MAX_WIDTH = 160;

const FLYER_VARIANTS = [
  { maxWidth: 1600 },
  { maxWidth: 600 },
  { maxWidth: THUMBNAIL_MAX_WIDTH },
] as const;
const LOGO_VARIANTS = [{ maxWidth: 400 }, { maxWidth: THUMBNAIL_MAX_WIDTH }] as const;

export class ImageService {
  constructor(
    private readonly imageRepository: ImageRepository,
    private readonly eventRepository: EventRepository,
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  /**
   * Reuses EventService.loadForModification for authorization instead of
   * re-implementing the individual/org_admin/org_editor rules a second
   * time - a flyer upload is subject to exactly the same permission-matrix
   * rows as editing the event itself.
   */
  replaceEventFlyer(
    actingUser: ActingUser,
    eventId: EventId,
    bytes: Buffer,
  ): ResultAsync<Event, ReplaceEventFlyerError> {
    return eventService
      .loadForModification(actingUser, eventId)
      .mapErr((error): ReplaceEventFlyerError => error)
      .andThen(() =>
        processUpload(bytes, FLYER_VARIANTS)
          .mapErr((processingError): ReplaceEventFlyerError => {
            logger.warn({ err: processingError }, "event flyer upload rejected");
            return "validation";
          })
          .andThen(([full, preview, thumbnail]) =>
            ResultAsync.combine([
              this.imageRepository.upsertImage(full),
              this.imageRepository.upsertImage(preview),
              this.imageRepository.upsertImage(thumbnail),
            ])
              .mapErr((dbError): ReplaceEventFlyerError => {
                logger.error({ err: dbError }, "failed to store flyer image variants");
                return "internal_error";
              })
              .andThen(([fullImage, previewImage, thumbnailImage]) =>
                this.eventRepository
                  .setEventFlyer(
                    eventId,
                    fullImage.sha256,
                    previewImage.sha256,
                    thumbnailImage.sha256,
                    actingUser.id,
                  )
                  .mapErr((dbError): ReplaceEventFlyerError => {
                    logger.error({ err: dbError }, "failed to set event flyer");
                    return "internal_error";
                  }),
              ),
          ),
      );
  }

  /** Reuses OrganizationService.requireOrgAdmin - same reasoning as replaceEventFlyer above. */
  replaceOrganizationLogo(
    actingUser: ActingUser,
    orgId: OrganizationId,
    bytes: Buffer,
  ): ResultAsync<Organization, ReplaceOrganizationLogoError> {
    return organizationService
      .requireOrgAdmin(actingUser, orgId, "not_found")
      .mapErr((error): ReplaceOrganizationLogoError => error)
      .andThen(() =>
        processUpload(bytes, LOGO_VARIANTS)
          .mapErr((processingError): ReplaceOrganizationLogoError => {
            logger.warn({ err: processingError }, "organization logo upload rejected");
            return "validation";
          })
          .andThen(([full, thumbnail]) =>
            ResultAsync.combine([
              this.imageRepository.upsertImage(full),
              this.imageRepository.upsertImage(thumbnail),
            ])
              .mapErr((dbError): ReplaceOrganizationLogoError => {
                logger.error({ err: dbError }, "failed to store logo image variants");
                return "internal_error";
              })
              .andThen(([fullImage, thumbnailImage]) =>
                this.organizationRepository
                  .setOrganizationLogo(orgId, fullImage.sha256, thumbnailImage.sha256)
                  .mapErr((dbError): ReplaceOrganizationLogoError => {
                    logger.error({ err: dbError }, "failed to set organization logo");
                    return "internal_error";
                  }),
              ),
          ),
      );
  }
}

export const imageService = new ImageService(
  new ImageRepository(sql),
  new EventRepository(sql),
  new OrganizationRepository(sql),
);
