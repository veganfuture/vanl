import { err, ok, type Result } from "neverthrow";

/**
 * A sha256 hex digest (an images row's content-addressed primary key) -
 * branded so a plain string (or a Uuid, or any other branded id) can't be
 * passed where a Sha256 is expected without going through parseSha256 or an
 * explicit, reviewable `as Sha256` cast. Every producer of a Sha256 that
 * doesn't call parseSha256 directly (createHash("sha256").digest("hex"), a
 * DB row already constrained at the column level, ...) casts at that one
 * construction site instead.
 */
export type Sha256 = string & { readonly __brand: "Sha256" };

const SHA256_RE = /^[0-9a-f]{64}$/;

export type Sha256ParseError = { readonly message: string };

/**
 * Validates a caller-supplied string as a sha256 hex digest before it's used
 * to look up an image - mirrors parseUuid in uuid.ts (same rationale: catch
 * malformed input here rather than let it reach the database as a
 * never-matching query).
 */
export function parseSha256(value: string): Result<Sha256, Sha256ParseError> {
  if (!SHA256_RE.test(value)) {
    return err({ message: `Not a valid sha256: ${value}` });
  }
  return ok(value as Sha256);
}
