import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  generateIdentity,
  loadIdentity,
  getOrCreateIdentity,
  loadWalletKey,
  loadEncryptionKey,
} from "../identity.js";

describe("identity", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reef-id-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates a new identity", () => {
    const identity = generateIdentity(tmpDir);

    expect(identity.version).toBe(1);
    expect(identity.address).toBeDefined();
    expect(identity.address.startsWith("0x")).toBe(true);
    expect(identity.publicKey).toBeDefined();
    expect(identity.createdAt).toBeDefined();
    expect(identity.xmtpEnv).toBe("production");
  });

  it("saves identity.json to config dir", () => {
    generateIdentity(tmpDir);

    const filePath = path.join(tmpDir, "identity.json");
    expect(fs.existsSync(filePath)).toBe(true);

    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    expect(raw.version).toBe(1);
    expect(raw.address).toBeDefined();
  });

  it("saves wallet-key to config dir", () => {
    generateIdentity(tmpDir);

    const keyPath = path.join(tmpDir, "wallet-key");
    expect(fs.existsSync(keyPath)).toBe(true);
  });

  it("generates encryption key .env", () => {
    generateIdentity(tmpDir);

    const encKey = loadEncryptionKey(tmpDir);
    expect(encKey).toBeDefined();
    expect(encKey!.length).toBe(64); // 32 bytes hex
  });

  it("loads an existing identity", () => {
    const original = generateIdentity(tmpDir);
    const loaded = loadIdentity(tmpDir);

    expect(loaded).toEqual(original);
  });

  it("returns null when no identity exists", () => {
    const loaded = loadIdentity(tmpDir);
    expect(loaded).toBeNull();
  });

  it("getOrCreateIdentity returns existing", () => {
    const original = generateIdentity(tmpDir);
    const result = getOrCreateIdentity(tmpDir);

    expect(result.address).toBe(original.address);
  });

  it("getOrCreateIdentity creates new when none exists", () => {
    const result = getOrCreateIdentity(tmpDir);

    expect(result.address).toBeDefined();
    expect(result.address.startsWith("0x")).toBe(true);
  });

  it("loads wallet key", () => {
    generateIdentity(tmpDir);

    const key = loadWalletKey(tmpDir);
    expect(key).toBeDefined();
    expect(key!.startsWith("0x")).toBe(true);
  });

  it("returns null for wallet key when not present", () => {
    const key = loadWalletKey(tmpDir);
    expect(key).toBeNull();
  });
});
