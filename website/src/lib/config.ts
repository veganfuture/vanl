import { readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";

/**
 * All non-secret configuration lives in one TOML file (path from VANL_CONFIG_PATH).
 * Field names mirror the TOML keys 1:1 — no separate camelCase mapping layer to
 * get out of sync with the file.
 */
const ConfigSchema = z.object({
  server: z
    .object({
      host: z.string().default("0.0.0.0"),
      port: z.number().int().positive().default(3000),
    })
    .default({}),
  site: z.object({
    base_url: z.string().url(),
  }),
  logging: z
    .object({
      level: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    })
    .default({}),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG_PATH = "configs/dev.toml";

function resolveConfigPath(): string {
  return process.env.VANL_CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
}

let cachedConfig: AppConfig | undefined;

export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const path = resolveConfigPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (cause) {
    throw new Error(`Config file not found: ${path}`, { cause });
  }

  const parsed = parseToml(raw);
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid config file ${path}: ${result.error.message}`);
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/** Test-only: clears the cached config so a test can load a different file. */
export function resetConfigCacheForTests(): void {
  cachedConfig = undefined;
}
