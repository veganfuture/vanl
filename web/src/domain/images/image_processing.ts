import { createHash } from "node:crypto";
import { errAsync, ResultAsync } from "neverthrow";
import sharp from "sharp";

/**
 * Decodes, validates, and resizes an uploaded image into each requested
 * variant, re-encoding every variant to webp. Implements
 * docs/threat-model.md's upload mitigations: size-capped before this runs
 * (caller's job - see the route handler), decode-and-verify genuine type,
 * reject absurd pixel dimensions, and strip all EXIF (including GPS) by
 * simply never calling .withMetadata() on the sharp pipeline - sharp drops
 * source metadata by default on output unless asked to keep it.
 */

export type ImageVariantSpec = { readonly maxWidth: number };

export type ProcessedVariant = {
  readonly sha256: string;
  readonly bytes: Buffer;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
};

export type ImageProcessingError = { readonly message: string; readonly cause?: unknown };

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
/** Generous but bounded - guards against decompression-bomb-style inputs (huge dimensions, tiny file). */
const MAX_INPUT_PIXELS = 40_000_000;
const ALLOWED_INPUT_FORMATS = new Set(["jpeg", "png", "webp"]);
const WEBP_QUALITY = 82;

/**
 * Shared by both the flyer and logo upload pipelines so an event's own
 * flyer thumbnail and its publishing org's logo thumbnail (the fallback
 * shown when the event has none - see EventThumbnail) are the same pixel
 * size.
 */
export const THUMBNAIL_MAX_WIDTH = 160;

type ImageMetadata = Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;

function processingError(message: string, cause?: unknown): ImageProcessingError {
  return { message, cause };
}

function readMetadata(bytes: Buffer): ResultAsync<ImageMetadata, ImageProcessingError> {
  return ResultAsync.fromPromise(
    sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata(),
    (cause): ImageProcessingError => processingError("Not a valid image", cause),
  );
}

function resizeVariant(
  bytes: Buffer,
  variant: ImageVariantSpec,
): ResultAsync<ProcessedVariant, ImageProcessingError> {
  return ResultAsync.fromPromise(
    sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize(variant.maxWidth, null, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true }),
    (cause): ImageProcessingError => processingError("Failed to resize/encode image", cause),
  ).map(({ data, info }): ProcessedVariant => ({
    sha256: createHash("sha256").update(data).digest("hex"),
    bytes: data,
    mime: "image/webp",
    width: info.width,
    height: info.height,
  }));
}

export function processUpload(
  bytes: Buffer,
  variants: readonly ImageVariantSpec[],
): ResultAsync<ProcessedVariant[], ImageProcessingError> {
  if (bytes.length === 0) {
    return errAsync(processingError("Empty upload"));
  }
  if (bytes.length > MAX_INPUT_BYTES) {
    return errAsync(
      processingError(`Upload too large: ${bytes.length} bytes (max ${MAX_INPUT_BYTES})`),
    );
  }

  return readMetadata(bytes).andThen((metadata) => {
    if (!metadata.format || !ALLOWED_INPUT_FORMATS.has(metadata.format)) {
      return errAsync<ProcessedVariant[], ImageProcessingError>(
        processingError(`Unsupported image format: ${metadata.format ?? "unknown"}`),
      );
    }
    return ResultAsync.combine(variants.map((variant) => resizeVariant(bytes, variant)));
  });
}
