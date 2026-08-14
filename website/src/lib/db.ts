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
  });
}

export const sql = createSqlClient();
