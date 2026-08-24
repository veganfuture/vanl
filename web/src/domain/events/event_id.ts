import { err, ok, type Result } from "neverthrow";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EventIdParseError = {
  readonly message: string;
};

/** Immutable wrapper around a validated event id (a UUID). */
export class EventId {
  private constructor(readonly value: string) {}

  static from_string(value: string): Result<EventId, EventIdParseError> {
    if (!UUID_RE.test(value)) {
      return err({ message: `Not a valid event id (expected a UUID): ${value}` });
    }
    return ok(new EventId(value.toLowerCase()));
  }

  equals(other: EventId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
