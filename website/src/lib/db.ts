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
