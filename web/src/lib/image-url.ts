/**
 * Content-addressed, immutable - see src/routes/images/[sha256].ts. No file
 * extension on purpose: the browser gets the real type from the Content-Type
 * header, and a URL ending in a recognized static-asset extension (like
 * .webp) makes `vite dev`'s static-file middleware hard-404 it before it
 * ever reaches this dynamic route - see the sibling route file's comment.
 */
export function imageUrl(sha256: string): string {
  return `/images/${sha256}`;
}
