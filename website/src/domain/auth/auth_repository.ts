import { err, ok, ResultAsync, type Result } from "neverthrow";
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

export type DbError = { readonly message: string; readonly cause: unknown };

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
 * caller passed bad input. That's a corruption-level bug, surfaced through
 * the same DbError channel as any other repository failure rather than a
 * separate case.
 */
function mapUserRow(row: unknown): Result<User, DbError> {
  const parsedRow = UserRowSchema.safeParse(row);
  if (!parsedRow.success) {
    return err({
      message: `Corrupt users row: ${parsedRow.error.message}`,
      cause: parsedRow.error,
    });
  }
  const parsed = parsedRow.data;

  const idResult = UserId.from_string(parsed.id);
  if (idResult.isErr()) {
    return err({ message: `Corrupt users row: ${idResult.error.message}`, cause: idResult.error });
  }
  const signalAciResult = SignalAci.from_string(parsed.signal_aci);
  if (signalAciResult.isErr()) {
    return err({
      message: `Corrupt users row: ${signalAciResult.error.message}`,
      cause: signalAciResult.error,
    });
  }
  const accountNameResult = AccountName.from_string(parsed.account_name);
  if (accountNameResult.isErr()) {
    return err({
      message: `Corrupt users row: ${accountNameResult.error.message}`,
      cause: accountNameResult.error,
    });
  }

  return ok({
    id: idResult.value,
    signalAci: signalAciResult.value,
    accountName: accountNameResult.value,
    email: parsed.email,
    displayName: parsed.display_name,
    affiliationsNote: parsed.affiliations_note,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
    deletedAt: parsed.deleted_at,
  });
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
   * The very first account ever created becomes site_admin, so there's
   * always a way in on a fresh install without configuring anything. Done
   * in the same transaction as the insert, checking the count immediately
   * after: good enough given how this app is actually used (signups only
   * happen one at a time, DM-gated by the bot) — a true race between two
   * concurrent "first" signups isn't guarded against.
   *
   * Resolves to the new user, or "nonce_already_used" if this link was
   * already consumed (by a concurrent request or an earlier visit) — that's
   * an expected outcome the caller must branch on, not a DbError.
   */
  createUserFromSignup(
    input: NewUserInput,
    nonce: string,
  ): ResultAsync<User | "nonce_already_used", DbError> {
    return ResultAsync.fromPromise(
      this.sql.begin(async (tx) => {
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
        const user = rows[0];

        const [{ count }] = await tx`select count(*)::int as count from users`;
        if (count === 1) {
          await tx`insert into global_roles (user_id, role) values (${user.id}, 'site_admin')`;
        }

        return user;
      }),
      (cause): DbError => ({ message: "Failed to create user from signup", cause }),
    ).andThen((result): Result<User | "nonce_already_used", DbError> =>
      result === "nonce_already_used" ? ok(result) : mapUserRow(result),
    );
  }

  findUserByAccountName(accountName: string): ResultAsync<User | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select * from users where account_name = ${accountName} and deleted_at is null
      `,
      (cause): DbError => ({ message: "Failed to find user by account name", cause }),
    ).andThen((rows): Result<User | null, DbError> => (rows[0] ? mapUserRow(rows[0]) : ok(null)));
  }

  findUserById(id: UserId): ResultAsync<User | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select * from users where id = ${id.value} and deleted_at is null
      `,
      (cause): DbError => ({ message: "Failed to find user by id", cause }),
    ).andThen((rows): Result<User | null, DbError> => (rows[0] ? mapUserRow(rows[0]) : ok(null)));
  }

  findUserBySignalAci(aci: SignalAci): ResultAsync<User | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select * from users where signal_aci = ${aci.value} and deleted_at is null
      `,
      (cause): DbError => ({ message: "Failed to find user by signal aci", cause }),
    ).andThen((rows): Result<User | null, DbError> => (rows[0] ? mapUserRow(rows[0]) : ok(null)));
  }

  isSignupNonceUsed(nonce: string): ResultAsync<boolean, DbError> {
    return ResultAsync.fromPromise(
      this.sql`select 1 from signup_nonces where nonce = ${nonce}`,
      (cause): DbError => ({ message: "Failed to check signup nonce", cause }),
    ).map((rows) => rows.length > 0);
  }

  // --- Global roles ---

  isSiteAdmin(userId: UserId): ResultAsync<boolean, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select 1 from global_roles where user_id = ${userId.value} and role = 'site_admin'
      `,
      (cause): DbError => ({ message: "Failed to check site admin role", cause }),
    ).map((rows) => rows.length > 0);
  }

  // --- Sessions ---

  insertSession(input: NewSession): ResultAsync<void, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        insert into sessions (user_id, token_hash, expires_at)
        values (${input.userId.value}, ${input.tokenHash}, ${input.expiresAt})
      `,
      (cause): DbError => ({ message: "Failed to insert session", cause }),
    ).map(() => undefined);
  }

  findActiveSessionByTokenHash(tokenHash: string): ResultAsync<ActiveSession | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select user_id, expires_at from sessions
        where token_hash = ${tokenHash} and revoked_at is null and expires_at > now()
      `,
      (cause): DbError => ({ message: "Failed to find active session", cause }),
    ).andThen((rows): Result<ActiveSession | null, DbError> => {
      const row = rows[0];
      if (!row) {
        return ok(null);
      }
      const userIdResult = UserId.from_string(row.user_id as string);
      if (userIdResult.isErr()) {
        return err({
          message: `Corrupt sessions row: ${userIdResult.error.message}`,
          cause: userIdResult.error,
        });
      }
      return ok({ userId: userIdResult.value, expiresAt: row.expires_at as Date });
    });
  }

  revokeSessionByTokenHash(tokenHash: string): ResultAsync<void, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        update sessions set revoked_at = now()
        where token_hash = ${tokenHash} and revoked_at is null
      `,
      (cause): DbError => ({ message: "Failed to revoke session", cause }),
    ).map(() => undefined);
  }

  // --- Login challenges (OTP) ---

  insertLoginChallenge(input: NewLoginChallenge): ResultAsync<string, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        insert into login_challenges (user_id, code_hash, expires_at)
        values (${input.userId.value}, ${input.codeHash}, ${input.expiresAt})
        returning id
      `,
      (cause): DbError => ({ message: "Failed to insert login challenge", cause }),
    ).map((rows) => rows[0].id as string);
  }

  /** Most recent still-usable (unexpired, attempts remaining) challenge for this user. */
  findLatestActiveLoginChallenge(
    userId: UserId,
  ): ResultAsync<ActiveLoginChallenge | null, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        select id, code_hash, attempts_remaining, expires_at from login_challenges
        where user_id = ${userId.value} and expires_at > now() and attempts_remaining > 0
        order by created_at desc
        limit 1
      `,
      (cause): DbError => ({ message: "Failed to find active login challenge", cause }),
    ).map((rows) => {
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
    });
  }

  /** Atomically decrements and returns the new remaining-attempts count. */
  decrementLoginChallengeAttempts(id: string): ResultAsync<number, DbError> {
    return ResultAsync.fromPromise(
      this.sql`
        update login_challenges set attempts_remaining = attempts_remaining - 1
        where id = ${id}
        returning attempts_remaining
      `,
      (cause): DbError => ({ message: "Failed to decrement login challenge attempts", cause }),
    ).map((rows) => rows[0].attempts_remaining as number);
  }
}
