import { execFileSync } from "node:child_process";

/**
 * Runs once before any test file, applying migrations to configs/test.toml's
 * vanl_test database (idempotent - migrate.ts tracks applied files in
 * _migrations). Deliberately does NOT reuse vitest.config.ts's `test.env` by
 * relying on inherited process.env - passed explicitly so this also works if
 * globalSetup ever runs outside that env injection.
 */
export default function setup(): void {
  execFileSync("bun", ["run", "scripts/migrate.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      VANL_CONFIG_PATH: "configs/test.toml",
      VANL_DATABASE_PASSWORD: "",
    },
  });
}
