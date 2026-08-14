import { err, ok, type Result } from "neverthrow";

const ACCOUNT_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;

export type AccountNameParseError = {
  readonly message: string;
};

/** Immutable wrapper around a validated account name. */
export class AccountName {
  private constructor(readonly value: string) {}

  static from_string(value: string): Result<AccountName, AccountNameParseError> {
    const trimmed = value.trim();
    if (trimmed.length < 3 || trimmed.length > 32) {
      return err({ message: "Account name must be between 3 and 32 characters" });
    }
    if (!ACCOUNT_NAME_RE.test(trimmed)) {
      return err({ message: "Account name may only contain letters, numbers, - and _" });
    }
    return ok(new AccountName(trimmed));
  }

  equals(other: AccountName): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
