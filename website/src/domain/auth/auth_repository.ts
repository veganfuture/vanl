import type postgres from "postgres";
import { z } from "zod";
import { AccountName } from "./account_name";
import { SignalAci } from "./signal_aci";
import type { User } from "./user";
import { UserId } from "./user_id";

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

/**
 * Rows come from a table whose columns are constrained (CHECKs, not-null,
 * uniqueness) so id/signal_aci/account_name should always be parseable — a
 * failure here means the database and this code have drifted, not that a
 * caller passed bad input. That's a corruption-level bug, so it throws
 * rather than returning a union like the value types' own parsers do.
 */
function mapUserRow(row: unknown): User {
  const parsed = UserRowSchema.parse(row);

  const id = UserId.from_string(parsed.id);
  if (!(id instanceof UserId)) {
    throw new Error(`Corrupt users row: ${id.message}`);
  }
  const signalAci = SignalAci.from_string(parsed.signal_aci);
  if (!(signalAci instanceof SignalAci)) {
    throw new Error(`Corrupt users row: ${signalAci.message}`);
  }
  const accountName = AccountName.from_string(parsed.account_name);
  if (!(accountName instanceof AccountName)) {
    throw new Error(`Corrupt users row: ${accountName.message}`);
  }

  return {
    id,
    signalAci,
    accountName,
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

export type NewSession = { userId: UserId; tokenHash: string; expiresAt: Date };

export type ActiveSession = { userId: UserId; expiresAt: Date };

export type NewLoginChallenge = { userId: UserId; codeHash: string; expiresAt: Date };

export type ActiveLoginChallenge = {
  id: string;
  codeHash: string;
  attemptsRemaining: number;
  expiresAt: Date;
};

export class AuthRepository {
  constructor(private readonly sql: postgres.Sql) {}

  /**
   * Atomically consumes a signup nonce and creates the account. The nonce
   * insert and the user insert happen in one transaction so a double-submit
   * of the same signup link can never create two accounts.
   *
   * Returns: the new user, or "nonce_already_used" if this link was already
   * consumed (by a concurrent request or an earlier visit).
   */
  async createUserFromSignup(
    input: NewUserInput,
    nonce: string,
  ): Promise<User | "nonce_already_used"> {
    return this.sql.begin(async (tx) => {
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
          ${input.signalAci.value}, ${input.accountName.value}, ${input.email},
          ${input.displayName}, ${input.affiliationsNote}
        )
        returning *
      `;
      return mapUserRow(rows[0]);
    });
  }

  async findUserByAccountName(accountName: string): Promise<User | null> {
    const rows = await this.sql`
      select * from users where account_name = ${accountName} and deleted_at is null
    `;
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async findUserById(id: UserId): Promise<User | null> {
    const rows = await this.sql`
      select * from users where id = ${id.value} and deleted_at is null
    `;
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async findUserBySignalAci(aci: SignalAci): Promise<User | null> {
    const rows = await this.sql`
      select * from users where signal_aci = ${aci.value} and deleted_at is null
    `;
    return rows[0] ? mapUserRow(rows[0]) : null;
  }

  async isSignupNonceUsed(nonce: string): Promise<boolean> {
    const rows = await this.sql`select 1 from signup_nonces where nonce = ${nonce}`;
    return rows.length > 0;
  }

  // --- Global roles ---

  async ensureGlobalRole(userId: UserId, role: "site_admin"): Promise<void> {
    await this.sql`
      insert into global_roles (user_id, role) values (${userId.value}, ${role})
      on conflict (user_id, role) do nothing
    `;
  }

  async isSiteAdmin(userId: UserId): Promise<boolean> {
    const rows = await this.sql`
      select 1 from global_roles where user_id = ${userId.value} and role = 'site_admin'
    `;
    return rows.length > 0;
  }

  // --- Sessions ---

  async insertSession(input: NewSession): Promise<void> {
    await this.sql`
      insert into sessions (user_id, token_hash, expires_at)
      values (${input.userId.value}, ${input.tokenHash}, ${input.expiresAt})
    `;
  }

  async findActiveSessionByTokenHash(tokenHash: string): Promise<ActiveSession | null> {
    const rows = await this.sql`
      select user_id, expires_at from sessions
      where token_hash = ${tokenHash} and revoked_at is null and expires_at > now()
    `;
    const row = rows[0];
    if (!row) {
      return null;
    }
    const userId = UserId.from_string(row.user_id as string);
    if (!(userId instanceof UserId)) {
      throw new Error(`Corrupt sessions row: ${userId.message}`);
    }
    return { userId, expiresAt: row.expires_at as Date };
  }

  async revokeSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.sql`
      update sessions set revoked_at = now()
      where token_hash = ${tokenHash} and revoked_at is null
    `;
  }

  // --- Login challenges (OTP) ---

  async insertLoginChallenge(input: NewLoginChallenge): Promise<string> {
    const rows = await this.sql`
      insert into login_challenges (user_id, code_hash, expires_at)
      values (${input.userId.value}, ${input.codeHash}, ${input.expiresAt})
      returning id
    `;
    return rows[0].id as string;
  }

  /** Most recent still-usable (unexpired, attempts remaining) challenge for this user. */
  async findLatestActiveLoginChallenge(userId: UserId): Promise<ActiveLoginChallenge | null> {
    const rows = await this.sql`
      select id, code_hash, attempts_remaining, expires_at from login_challenges
      where user_id = ${userId.value} and expires_at > now() and attempts_remaining > 0
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
  async decrementLoginChallengeAttempts(id: string): Promise<number> {
    const rows = await this.sql`
      update login_challenges set attempts_remaining = attempts_remaining - 1
      where id = ${id}
      returning attempts_remaining
    `;
    return rows[0].attempts_remaining as number;
  }
}
