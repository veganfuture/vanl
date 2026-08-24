import { defineHandler, getRouterParam } from "h3";
import { imageRepository } from "~/domain/images/image_repository";

const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Deliberately a nitro-native serverDir route (not a SolidStart
 * src/routes/**.ts one) - a SolidStart route for this path gets funneled
 * through SolidStart's own generic `/**` nitro handler rather than
 * registering as a concrete nitro route, which makes nitro's dev-server
 * middleware treat any request with a non-navigation `Sec-Fetch-Dest`
 * (`image`, `script`, `style`, `font`, ... - i.e. every real `<img src>`
 * fetch) as a missing static asset and 404 it before SolidStart's router
 * ever sees it. A concrete nitro route bypasses that heuristic entirely
 * (see nitroDevMiddlewarePre in nitro's vite.dev build) and is unaffected
 * in production either way. See image-url.ts's imageUrl() for the URL
 * shape (deliberately extension-less, for an unrelated reason).
 */
export default defineHandler(async (event) => {
  const sha256 = getRouterParam(event, "sha256") ?? "";
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
});
