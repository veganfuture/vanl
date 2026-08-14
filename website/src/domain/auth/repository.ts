import { z } from "zod";
import { sql } from "~/lib/db";
import {
  parseAccountName,
  parseSignalAci,
  parseUserId,
  type AccountName,
  type SignalAci,
  type User,
  type UserId,
} from "./types";

/**
 * Repositories are the only code in this project allowed to write SQL.
 * Every query result is validated into its declared TypeScript type here —
 * callers never see a raw driver row. Postgres unique constraints (not
 * application-level pre-checks) are the actual enforcement for things like
 * "one user per Signal ACI" — races are only ever resolved correctly at the
 * database layer.
 */

const UserRowSchema = z.object({
  id: z.string(),
  signal_aci: z.string(),
  account_name: z.string(),
  email: z.string(),
  display_name: z.string(),
  affiliations_note: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  deleted_at: z.coerce.date().nullable(),
});

function mapUserRow(row: unknown): User {
  const parsed = UserRowSchema.parse(row);
  return {
    id: parseUserId(parsed.id),
    signalAci: parseSignalAci(parsed.signal_aci),
    accountName: parseAccountName(parsed.account_name),
    email: parsed.email,
    displayName: parsed.display_name,
    affiliationsNote: parsed.affiliations_note,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
    deletedAt: parsed.deleted_at,
  };
}

export type NewUserInput = {
  signalAci: SignalAci;
  accountName: AccountName;
  email: string;
  displayName: string;
  affiliationsNote: string | null;
};

/**
 * Atomically consumes a signup nonce and creates the account. The nonce
 * insert and the user insert happen in one transaction so a double-submit of
 * the same signup link can never create two accounts.
 *
 * Returns: the new user, or "nonce_already_used" if this link was already
 * consumed (by a concurrent request or an earlier visit).
 */
export async function createUserFromSignup(
  input: NewUserInput,
  nonce: string,
): Promise<User | "nonce_already_used"> {
  return sql.begin(async (tx) => {
    const nonceRows = await tx`
      insert into signup_nonces (nonce) values (${nonce})
      on conflict (nonce) do nothing
      returning nonce
    `;
    if (nonceRows.length === 0) {
      return "nonce_already_used" as const;
    }

    const rows = await tx`
      insert into users (signal_aci, account_name, email, display_name, affiliations_note)
      values (
        ${input.signalAci}, ${input.accountName}, ${input.email},
        ${input.displayName}, ${input.affiliationsNote}
      )
      returning *
    `;
    return mapUserRow(rows[0]);
  });
}

export async function findUserByAccountName(accountName: string): Promise<User | null> {
  const rows = await sql`
    select * from users where account_name = ${accountName} and deleted_at is null
  `;
  return rows[0] ? mapUserRow(rows[0]) : null;
}

export async function findUserById(id: UserId): Promise<User | null> {
  const rows = await sql`select * from users where id = ${id} and deleted_at is null`;
  return rows[0] ? mapUserRow(rows[0]) : null;
}

export async function findUserBySignalAci(aci: SignalAci): Promise<User | null> {
  const rows = await sql`
    select * from users where signal_aci = ${aci} and deleted_at is null
  `;
  return rows[0] ? mapUserRow(rows[0]) : null;
}

export async function isSignupNonceUsed(nonce: string): Promise<boolean> {
  const rows = await sql`select 1 from signup_nonces where nonce = ${nonce}`;
  return rows.length > 0;
}

// --- Global roles ---

export async function ensureGlobalRole(userId: UserId, role: "site_admin"): Promise<void> {
  await sql`
    insert into global_roles (user_id, role) values (${userId}, ${role})
    on conflict (user_id, role) do nothing
  `;
}

export async function isSiteAdmin(userId: UserId): Promise<boolean> {
  const rows = await sql`
    select 1 from global_roles where user_id = ${userId} and role = 'site_admin'
  `;
  return rows.length > 0;
}

// --- Sessions ---

export type NewSession = { userId: UserId; tokenHash: string; expiresAt: Date };

export async function insertSession(input: NewSession): Promise<void> {
  await sql`
    insert into sessions (user_id, token_hash, expires_at)
    values (${input.userId}, ${input.tokenHash}, ${input.expiresAt})
  `;
}

export type ActiveSession = { userId: UserId; expiresAt: Date };

export async function findActiveSessionByTokenHash(
  tokenHash: string,
): Promise<ActiveSession | null> {
  const rows = await sql`
    select user_id, expires_at from sessions
    where token_hash = ${tokenHash} and revoked_at is null and expires_at > now()
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return { userId: parseUserId(row.user_id as string), expiresAt: row.expires_at as Date };
}

export async function revokeSessionByTokenHash(tokenHash: string): Promise<void> {
  await sql`
    update sessions set revoked_at = now()
    where token_hash = ${tokenHash} and revoked_at is null
  `;
}

// --- Login challenges (OTP) ---

export type NewLoginChallenge = { userId: UserId; codeHash: string; expiresAt: Date };

export async function insertLoginChallenge(input: NewLoginChallenge): Promise<string> {
  const rows = await sql`
    insert into login_challenges (user_id, code_hash, expires_at)
    values (${input.userId}, ${input.codeHash}, ${input.expiresAt})
    returning id
  `;
  return rows[0].id as string;
}

export type ActiveLoginChallenge = {
  id: string;
  codeHash: string;
  attemptsRemaining: number;
  expiresAt: Date;
};

/** Most recent still-usable (unexpired, attempts remaining) challenge for this user. */
export async function findLatestActiveLoginChallenge(
  userId: UserId,
): Promise<ActiveLoginChallenge | null> {
  const rows = await sql`
    select id, code_hash, attempts_remaining, expires_at from login_challenges
    where user_id = ${userId} and expires_at > now() and attempts_remaining > 0
    order by created_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id as string,
    codeHash: row.code_hash as string,
    attemptsRemaining: row.attempts_remaining as number,
    expiresAt: row.expires_at as Date,
  };
}

/** Atomically decrements and returns the new remaining-attempts count. */
export async function decrementLoginChallengeAttempts(id: string): Promise<number> {
  const rows = await sql`
    update login_challenges set attempts_remaining = attempts_remaining - 1
    where id = ${id}
    returning attempts_remaining
  `;
  return rows[0].attempts_remaining as number;
}
