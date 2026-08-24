import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadConfig } from "../src/lib/config";

/**
 * Hand-rolled migration runner: applies raw .sql files in order, once each,
 * tracked in a `_migrations` bookkeeping table. Deliberately not a query
 * builder — it only ever executes literal SQL text you wrote yourself.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const sql = postgres({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    username: config.database.user,
    password: process.env.VANL_DATABASE_PASSWORD ?? "",
  });

  try {
    await sql`
      create table if not exists _migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `;

    const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    const appliedRows = await sql<{ filename: string }[]>`select filename from _migrations`;
    const applied = new Set(appliedRows.map((row) => row.filename));

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const contents = readFileSync(join(migrationsDir, file), "utf-8");
      console.log(`Applying migration: ${file}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(contents);
        await tx`insert into _migrations (filename) values (${file})`;
      });
    }

    console.log("Migrations up to date.");
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
