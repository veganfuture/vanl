import type { APIEvent } from "@solidjs/start/server";
import { imageRepository } from "~/domain/images/image_repository";

const SHA256_RE = /^[0-9a-f]{64}$/;

export async function GET(event: APIEvent): Promise<Response> {
  // URLs are /images/{sha256}.webp (docs/architecture.md) - the router has
  // no extension-stripping of its own, so the ".webp" suffix is still part
  // of the raw param here and has to be trimmed by hand.
  const sha256 = event.params.sha256.replace(/\.webp$/, "");
  if (!SHA256_RE.test(sha256)) {
    return new Response(null, { status: 404 });
  }

  const result = await imageRepository.findImageBySha256(sha256);
  const image = result.match(
    (found) => found,
    () => null,
  );
  if (!image) {
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.mime,
      // Content-addressed - the bytes at this URL can never change.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
