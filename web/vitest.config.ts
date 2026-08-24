import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ["development", "browser"],
    alias: {
      "~": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Force the test suite onto configs/test.toml's vanl_test database
    // regardless of whatever VANL_CONFIG_PATH is already set to in the
    // ambient shell/CI environment - tests truncate tables in beforeEach,
    // and letting that ever land on the interactive dev DB (vanl_dev) has
    // destroyed real manually-created data more than once. globalSetup
    // below applies migrations to vanl_test before any test file runs.
    env: {
      VANL_CONFIG_PATH: "configs/test.toml",
      VANL_DATABASE_PASSWORD: "",
    },
    globalSetup: ["./vitest.global-setup.ts"],
    // Nix/direnv leave build-cache copies of the whole repo under .direnv/ —
    // exclude them alongside vitest's own defaults so stale nested copies
    // never get picked up as duplicate test files.
    exclude: ["**/node_modules/**", "**/.direnv/**", "**/.output/**", "**/.nitro/**"],
    // Several test files share one real Postgres test database and truncate
    // shared tables in beforeEach — running files in parallel lets one file's
    // truncate wipe rows another concurrently-running file just inserted.
    fileParallelism: false,
  },
});
