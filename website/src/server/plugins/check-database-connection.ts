import { definePlugin } from "nitro";
import { checkDatabaseConnection } from "~/lib/db";
import { logger } from "~/lib/logger";

/**
 * Verifies the database is reachable before the server starts accepting
 * requests, rather than letting the first request that happens to touch the
 * database be the one that discovers it's down.
 */
export default definePlugin(() => {
  void checkDatabaseConnection().catch((cause: unknown) => {
    logger.fatal(
      { cause },
      "Could not connect to the database — refusing to start. Is the dev " +
        "Postgres instance running? Start it with `nix run .#devdb-start`. " +
        'See README.md, section "Database", for details.',
    );
    process.exit(1);
  });
});
