import { err, ok, type Result } from "neverthrow";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SignalAciParseError = {
  readonly message: string;
};

/** Immutable wrapper around a validated Signal ACI (a UUID). */
export class SignalAci {
  private constructor(readonly value: string) {}

  static from_string(value: string): Result<SignalAci, SignalAciParseError> {
    if (!UUID_RE.test(value)) {
      return err({ message: `Not a valid Signal ACI (expected a UUID): ${value}` });
    }
    return ok(new SignalAci(value.toLowerCase()));
  }

  equals(other: SignalAci): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
