import { err, ok, type Result } from "neverthrow";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UserIdParseError = {
  readonly message: string;
};

/** Immutable wrapper around a validated user id (a UUID). */
export class UserId {
  private constructor(readonly value: string) {}

  static from_string(value: string): Result<UserId, UserIdParseError> {
    if (!UUID_RE.test(value)) {
      return err({ message: `Not a valid user id (expected a UUID): ${value}` });
    }
    return ok(new UserId(value.toLowerCase()));
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
