import { Show } from "solid-js";
import { imageUrl } from "~/lib/image-url";

/**
 * An event's own flyer thumbnail, falling back to its publishing org's logo
 * thumbnail when the event has none. Both source images are already resized
 * server-side to the same 160px-wide thumbnail variant (see
 * image_processing.ts's THUMBNAIL_MAX_WIDTH), but that only fixes the *width* -
 * their heights still vary with the original art's aspect ratio, so
 * `object-fit: cover` crops client-side to force every thumbnail in a list
 * to the same square footprint. When neither image exists, a branded
 * placeholder keeps that footprint instead of collapsing the row.
 */
export function EventThumbnail(props: {
  flyerThumbnailImageId: string | null;
  orgLogoThumbnailImageId?: string | null;
}) {
  const imageId = () => props.flyerThumbnailImageId ?? props.orgLogoThumbnailImageId ?? null;

  return (
    <Show
      when={imageId()}
      fallback={
        <div class="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-emerald-50 ring-1 ring-black/5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            class="h-8 w-8 text-emerald-300"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
            />
          </svg>
        </div>
      }
    >
      {(id) => (
        <img
          src={imageUrl(id())}
          alt=""
          class="h-20 w-20 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-black/5"
          width={80}
          height={80}
        />
      )}
    </Show>
  );
}
