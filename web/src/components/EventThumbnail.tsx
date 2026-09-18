import { Show } from "solid-js";
import { imageUrl } from "~/lib/image-url";
import type { Sha256 } from "~/lib/sha256";

/**
 * An event's own flyer thumbnail, falling back to its publishing org's logo
 * thumbnail when the event has none. Both source images are already resized
 * server-side to the same 160px-wide thumbnail variant (see
 * image_processing.ts's THUMBNAIL_MAX_WIDTH), but that only fixes the *width* -
 * their heights still vary with the original art's aspect ratio, so
 * `object-fit: cover` crops client-side to force every thumbnail in a list
 * to the same square footprint.
 */
export function EventThumbnail(props: {
  flyerThumbnailImageId: string | null;
  orgLogoThumbnailImageId?: string | null;
}) {
  const imageId = () => props.flyerThumbnailImageId ?? props.orgLogoThumbnailImageId ?? null;

  return (
    <Show when={imageId()}>
      {(id) => (
        <img
          // A JSON-API string here, not a domain Sha256 - the server already
          // vetted it (Event/Organization's own sha256 fields), the client
          // just echoes it back into a URL.
          src={imageUrl(id() as Sha256)}
          alt=""
          class="h-16 w-16 shrink-0 rounded object-cover"
          width={64}
          height={64}
        />
      )}
    </Show>
  );
}
