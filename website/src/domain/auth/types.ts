/**
 * Branded string types so a raw string can't be passed where a validated
 * SignalAci/UserId/AccountName is expected without going through a parser.
 */
type Brand<T, B extends string> = T & { readonly __brand: B };

export type SignalAci = Brand<string, "SignalAci">;
export type UserId = Brand<string, "UserId">;
export type AccountName = Brand<string, "AccountName">;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSignalAci(value: string): SignalAci {
  if (!UUID_RE.test(value)) {
    throw new Error(`Not a valid Signal ACI (expected a UUID): ${value}`);
  }
  return value.toLowerCase() as SignalAci;
}

export function parseUserId(value: string): UserId {
  if (!UUID_RE.test(value)) {
    throw new Error(`Not a valid user id (expected a UUID): ${value}`);
  }
  return value.toLowerCase() as UserId;
}

const ACCOUNT_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;

export function parseAccountName(value: string): AccountName {
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 32) {
    throw new Error("Account name must be between 3 and 32 characters");
  }
  if (!ACCOUNT_NAME_RE.test(trimmed)) {
    throw new Error("Account name may only contain letters, numbers, - and _");
  }
  return trimmed as AccountName;
}

export type User = {
  id: UserId;
  signalAci: SignalAci;
  accountName: AccountName;
  email: string;
  displayName: string;
  affiliationsNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};
