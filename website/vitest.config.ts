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
