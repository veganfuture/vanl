import { createHash } from "node:crypto";
import { ResultAsync } from "neverthrow";
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

function processingError(message: string, cause?: unknown): ImageProcessingError {
  return { message, cause };
}

async function processUploadOrThrow(
  bytes: Buffer,
  variants: readonly ImageVariantSpec[],
): Promise<ProcessedVariant[]> {
  if (bytes.length === 0) {
    throw processingError("Empty upload");
  }
  if (bytes.length > MAX_INPUT_BYTES) {
    throw processingError(`Upload too large: ${bytes.length} bytes (max ${MAX_INPUT_BYTES})`);
  }

  const metadata = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .metadata()
    .catch((cause: unknown) => {
      throw processingError("Not a valid image", cause);
    });

  if (!metadata.format || !ALLOWED_INPUT_FORMATS.has(metadata.format)) {
    throw processingError(`Unsupported image format: ${metadata.format ?? "unknown"}`);
  }

  const processed: ProcessedVariant[] = [];
  for (const variant of variants) {
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
      .resize(variant.maxWidth, null, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true })
      .catch((cause: unknown) => {
        throw processingError("Failed to resize/encode image", cause);
      });
    processed.push({
      sha256: createHash("sha256").update(data).digest("hex"),
      bytes: data,
      mime: "image/webp",
      width: info.width,
      height: info.height,
    });
  }
  return processed;
}

export function processUpload(
  bytes: Buffer,
  variants: readonly ImageVariantSpec[],
): ResultAsync<ProcessedVariant[], ImageProcessingError> {
  return ResultAsync.fromPromise(
    processUploadOrThrow(bytes, variants),
    (cause): ImageProcessingError =>
      cause && typeof cause === "object" && "message" in cause
        ? (cause as ImageProcessingError)
        : processingError("Failed to process image", cause),
  );
}
