import { definePlugin } from "nitro";
import { checkDatabaseConnection } from "~/lib/db";
import { logger } from "~/lib/logger";

const REQUIRED_ENV_VARS = [
  {
    name: "VANL_BOT_API_SHARED_SECRET",
    description:
      "Shared secret sent as a Bearer token when calling the bot's local HTTP API to relay " +
      "OTP login codes over Signal.",
  },
];

/**
 * Runs every startup check before the server starts accepting requests,
 * rather than letting the first request that happens to hit a problem (a
 * missing env var, a down database) be the one that discovers it.
 */
export default definePlugin(() => {
  checkRequiredEnv();

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

function checkRequiredEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((envVar) => !process.env[envVar.name]);
  if (missing.length === 0) {
    return;
  }
  logger.fatal(
    { missing: missing.map((envVar) => envVar.name) },
    "Missing required environment variable(s) — refusing to start:\n" +
      missing.map((envVar) => `  - ${envVar.name}: ${envVar.description}`).join("\n") +
      '\nSee ../bot/README.md, section "Environment Variables", for how to generate these.',
  );
  process.exit(1);
}
