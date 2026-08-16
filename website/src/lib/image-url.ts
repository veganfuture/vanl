/** Content-addressed, immutable - see src/routes/images/[sha256].ts. */
export function imageUrl(sha256: string): string {
  return `/images/${sha256}.webp`;
}
