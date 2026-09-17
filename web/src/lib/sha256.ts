import { err, ok, type Result } from "neverthrow";

/** Documents that a string is a sha256 hex digest (an images row's content-addressed primary key) - a plain alias, not a branded type, so no runtime cast is needed anywhere it's used. */
export type Sha256 = string;

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
  return ok(value);
}
