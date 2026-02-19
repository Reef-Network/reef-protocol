import { createUser } from "@xmtp/agent-sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { keccak256, toBytes } from "viem";
import type { AgentIdentity } from "@reef-protocol/protocol";

const DEFAULT_CONFIG_DIR = path.join(process.env.HOME || "~", ".reef");

export function getConfigDir(): string {
  return process.env.REEF_CONFIG_DIR || DEFAULT_CONFIG_DIR;
}

function ensureConfigDir(configDir: string): void {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

export interface GenerateOptions {
  force?: boolean;
  seed?: string;
}

/**
 * Generate (or return existing) agent identity.
 *
 * Idempotent by default: if identity.json already exists, returns it without
 * overwriting. Pass `force: true` to regenerate (also deletes xmtp.db).
 *
 * Supports deterministic generation via `options.seed` or the `REEF_SEED`
 * env var — same seed always produces the same identity.
 */
export function generateIdentity(
  configDir?: string,
  options?: GenerateOptions,
): AgentIdentity {
  const dir = configDir || getConfigDir();
  ensureConfigDir(dir);

  // Idempotent: return existing identity unless force is set
  if (!options?.force) {
    const existing = loadIdentity(dir);
    if (existing) return existing;
  }

  // When forcing regeneration, clean up stale XMTP state
  if (options?.force) {
    for (const file of ["xmtp.db", "xmtp.db-shm", "xmtp.db-wal"]) {
      const p = path.join(dir, file);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }

  // Derive key from seed (deterministic) or generate random
  const seedString = options?.seed || process.env.REEF_SEED;
  const user = seedString
    ? createUser(keccak256(toBytes(seedString)))
    : createUser();

  const xmtpEnv = process.env.REEF_XMTP_ENV || "production";

  const identity: AgentIdentity = {
    version: 1,
    address: user.account.address,
    publicKey: user.key,
    createdAt: new Date().toISOString(),
    xmtpEnv,
  };

  fs.writeFileSync(
    path.join(dir, "identity.json"),
    JSON.stringify(identity, null, 2),
  );

  // Generate XMTP DB encryption key if not present
  ensureEncryptionKey(dir);

  // Save the private key separately (not in identity.json)
  fs.writeFileSync(path.join(dir, "wallet-key"), user.key);

  return identity;
}

/**
 * Load an existing identity from the config directory.
 * Returns null if no identity exists.
 */
export function loadIdentity(configDir?: string): AgentIdentity | null {
  const dir = configDir || getConfigDir();
  const identityPath = path.join(dir, "identity.json");

  if (!fs.existsSync(identityPath)) {
    return null;
  }

  const raw = fs.readFileSync(identityPath, "utf-8");
  return JSON.parse(raw) as AgentIdentity;
}

/**
 * Load existing identity or generate a new one.
 */
export function getOrCreateIdentity(configDir?: string): AgentIdentity {
  const dir = configDir || getConfigDir();
  const existing = loadIdentity(dir);
  if (existing) return existing;
  return generateIdentity(dir);
}

/**
 * Load the wallet private key from the config directory.
 */
export function loadWalletKey(configDir?: string): string | null {
  const dir = configDir || getConfigDir();
  const keyPath = path.join(dir, "wallet-key");

  if (!fs.existsSync(keyPath)) {
    return null;
  }

  return fs.readFileSync(keyPath, "utf-8").trim();
}

/**
 * Ensure XMTP DB encryption key exists in the config directory .env file.
 */
function ensureEncryptionKey(configDir: string): void {
  const envPath = path.join(configDir, ".env");
  let envContent = "";

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
    if (
      envContent.includes("XMTP_DB_ENCRYPTION_KEY=") &&
      !envContent.includes("XMTP_DB_ENCRYPTION_KEY=\n")
    ) {
      return; // Key already set
    }
  }

  const key = crypto.randomBytes(32).toString("hex");
  const line = `XMTP_DB_ENCRYPTION_KEY=${key}\n`;

  if (envContent.includes("XMTP_DB_ENCRYPTION_KEY=")) {
    envContent = envContent.replace(/XMTP_DB_ENCRYPTION_KEY=\n?/, line);
  } else {
    envContent += line;
  }

  fs.writeFileSync(envPath, envContent);
}

/**
 * Load the XMTP DB encryption key from the config .env.
 */
export function loadEncryptionKey(configDir?: string): string | null {
  const dir = configDir || getConfigDir();
  const envPath = path.join(dir, ".env");

  if (!fs.existsSync(envPath)) return null;

  const content = fs.readFileSync(envPath, "utf-8");
  const match = content.match(/XMTP_DB_ENCRYPTION_KEY=(.+)/);
  return match ? match[1].trim() : null;
}
