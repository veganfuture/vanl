import postgres from "postgres";
import { loadConfig } from "./config";

/**
 * Single shared connection pool for the process. Repositories are the only
 * code allowed to import this — route handlers and components must go
 * through them, never touch `sql` directly.
 */
function createSqlClient() {
  const config = loadConfig();
  return postgres({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    username: config.database.user,
    password: process.env.VANL_DATABASE_PASSWORD ?? "",
    connect_timeout: 2,
  });
}

export const sql = createSqlClient();

/**
 * Runs a trivial query to confirm the database is actually reachable.
 * `postgres()` connects lazily, so nothing above this line has attempted a
 * real connection yet — used at server startup (see
 * server/plugins/startup-checks.ts) to fail fast with a clear error instead
 * of only discovering the problem on the first request.
 */
export async function checkDatabaseConnection(): Promise<void> {
  await sql`select 1`;
}

/** True when a repository DbError's `cause` is a Postgres unique-constraint violation (code 23505). */
export function isUniqueViolation(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code: unknown }).code === "23505"
  );
}

/**
 * The name of the constraint a unique-violation DbError's `cause` tripped
 * (e.g. `users_signal_aci_key`), or `undefined` if `cause` isn't a unique
 * violation at all. A table can have more than one unique constraint, so the
 * Postgres error code alone (see `isUniqueViolation`) doesn't say which rule
 * was actually broken.
 */
export function uniqueViolationConstraint(cause: unknown): string | undefined {
  if (!isUniqueViolation(cause)) {
    return undefined;
  }
  return (cause as { constraint_name?: string }).constraint_name;
}
