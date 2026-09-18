import { err, ok, type Result } from "neverthrow";

/**
 * A UUID (a places/organizations/events primary key, etc.) - branded so a
 * plain string (or a Sha256, or any other branded id) can't be passed where
 * a Uuid is expected without going through parseUuid or an explicit,
 * reviewable `as Uuid` cast. Every producer of a Uuid that doesn't call
 * parseUuid directly (a DB row already constrained `uuid` at the column
 * level, an id class's own from_string, ...) casts at that one construction
 * site instead.
 */
export type Uuid = string & { readonly __brand: "Uuid" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UuidParseError = { readonly message: string };

/**
 * Validates a caller-supplied string as a UUID before it reaches a
 * repository - a malformed id sent straight into a `uuid`-typed column
 * comparison fails at the database with a type-cast error rather than
 * simply not matching, which is easy to mistake for something worse than
 * "bad input" if it isn't caught here first. Mirrors the id-wrapper
 * classes' (EventId, OrganizationId, UserId) own from_string, for ids that
 * don't otherwise need a dedicated wrapper's identity/equality methods.
 */
export function parseUuid(value: string): Result<Uuid, UuidParseError> {
  if (!UUID_RE.test(value)) {
    return err({ message: `Not a valid UUID: ${value}` });
  }
  return ok(value.toLowerCase() as Uuid);
}
