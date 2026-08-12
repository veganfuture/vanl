import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, resetConfigCacheForTests } from "./config";

let tempDir: string | undefined;
let previousConfigPath: string | undefined;

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
    `);

    const config = loadConfig();

    expect(config.site.base_url).toBe("https://example.com");
    expect(config.server.host).toBe("0.0.0.0");
    expect(config.server.port).toBe(3000);
    expect(config.logging.level).toBe("info");
  });

  it("rejects a config missing the required site.base_url", () => {
    useConfigFile(`
      [server]
      port = 4000
    `);

    expect(() => loadConfig()).toThrow(/Invalid config file/);
  });

  it("rejects a config with a malformed base_url", () => {
    useConfigFile(`
      [site]
      base_url = "not-a-url"
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
