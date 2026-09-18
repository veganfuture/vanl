import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    solidStart({ middleware: "src/http-cache-headers.ts" }),
    tailwindcss(),
    nitro({
      serverDir: "src/server",
      preset: "bun",
      routeRules: {
        "/_build/**": { headers: { "cache-control": "public, max-age=31536000, immutable" } },
      },
    }),
  ],
});
