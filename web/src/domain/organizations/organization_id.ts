import { err, ok, type Result } from "neverthrow";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OrganizationIdParseError = {
  readonly message: string;
};

/** Immutable wrapper around a validated organization id (a UUID). */
export class OrganizationId {
  private constructor(readonly value: string) {}

  static from_string(value: string): Result<OrganizationId, OrganizationIdParseError> {
    if (!UUID_RE.test(value)) {
      return err({ message: `Not a valid organization id (expected a UUID): ${value}` });
    }
    return ok(new OrganizationId(value.toLowerCase()));
  }

  equals(other: OrganizationId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
