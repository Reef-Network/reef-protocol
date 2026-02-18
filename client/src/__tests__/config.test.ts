import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig, saveConfig } from "../config.js";

describe("config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reef-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    const config = loadConfig(tmpDir);
    expect(config.contactsOnly).toBe(false);
    expect(config.country).toBeUndefined();
  });

  it("roundtrips config through save and load", () => {
    const config = { contactsOnly: true, country: "NO" };
    saveConfig(config, tmpDir);

    const loaded = loadConfig(tmpDir);
    expect(loaded.contactsOnly).toBe(true);
    expect(loaded.country).toBe("NO");
  });

  it("merges partial config with defaults", () => {
    // Write a config with only country, no contactsOnly
    const filePath = path.join(tmpDir, "config.json");
    fs.writeFileSync(filePath, JSON.stringify({ country: "US" }));

    const config = loadConfig(tmpDir);
    expect(config.contactsOnly).toBe(false); // default
    expect(config.country).toBe("US");
  });

  it("creates config directory if it does not exist", () => {
    const nestedDir = path.join(tmpDir, "nested", "dir");
    saveConfig({ contactsOnly: true }, nestedDir);

    expect(fs.existsSync(path.join(nestedDir, "config.json"))).toBe(true);
    const loaded = loadConfig(nestedDir);
    expect(loaded.contactsOnly).toBe(true);
  });
});
