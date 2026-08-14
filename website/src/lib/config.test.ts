import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, resetConfigCacheForTests } from "./config";

let tempDir: string | undefined;
let previousConfigPath: string | undefined;

const VALID_DATABASE_AND_AUTH = `
  [database]
  database = "vanl_test"

  [auth]
  bot_api_base_url = "http://127.0.0.1:8787"
  signup_public_key = "afQIoPf6trsqUYAvCUNebfnEdApb1JHnoM_Q0JIHBBE"
`;

function useConfigFile(contents: string): void {
  tempDir = mkdtempSync(join(tmpdir(), "vanl-config-test-"));
  const path = join(tempDir, "app.toml");
  writeFileSync(path, contents, "utf-8");
  previousConfigPath = process.env.VANL_CONFIG_PATH;
  process.env.VANL_CONFIG_PATH = path;
  resetConfigCacheForTests();
}

afterEach(() => {
  if (previousConfigPath === undefined) {
    delete process.env.VANL_CONFIG_PATH;
  } else {
    process.env.VANL_CONFIG_PATH = previousConfigPath;
  }
  resetConfigCacheForTests();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("loadConfig", () => {
  it("parses a valid config and fills in defaults", () => {
    useConfigFile(`
      [site]
      base_url = "https://example.com"
      ${VALID_DATABASE_AND_AUTH}
    `);

    const config = loadConfig();

    expect(config.site.base_url).toBe("https://example.com");
    expect(config.logging.level).toBe("info");
    expect(config.database.database).toBe("vanl_test");
    expect(config.database.host).toBe("127.0.0.1");
    expect(config.database.user).toBe("vanl");
    expect(config.auth.bot_api_base_url).toBe("http://127.0.0.1:8787");
    expect(config.auth.site_admin_account_names).toEqual([]);
  });

  it("rejects a config missing the required site.base_url", () => {
    useConfigFile(VALID_DATABASE_AND_AUTH);

    expect(() => loadConfig()).toThrow(/Invalid config file/);
  });

  it("rejects a config with a malformed base_url", () => {
    useConfigFile(`
      [site]
      base_url = "not-a-url"
      ${VALID_DATABASE_AND_AUTH}
    `);

    expect(() => loadConfig()).toThrow(/Invalid config file/);
  });

  it("rejects a config with a malformed signup public key", () => {
    useConfigFile(`
      [site]
      base_url = "https://example.com"

      [database]
      database = "vanl_test"

      [auth]
      bot_api_base_url = "http://127.0.0.1:8787"
      signup_public_key = "not-a-real-key"
    `);

    expect(() => loadConfig()).toThrow(/Invalid config file/);
  });

  it("throws a clear error when the config file does not exist", () => {
    previousConfigPath = process.env.VANL_CONFIG_PATH;
    process.env.VANL_CONFIG_PATH = "/nonexistent/path/app.toml";
    resetConfigCacheForTests();

    expect(() => loadConfig()).toThrow(/Config file not found/);
  });
});
