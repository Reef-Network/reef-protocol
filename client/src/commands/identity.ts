import {
  getOrCreateIdentity,
  loadIdentity,
  generateIdentity,
  getConfigDir,
} from "../identity.js";
import type { AgentIdentity } from "@reef-protocol/protocol";

function printIdentity(label: string, identity: AgentIdentity): void {
  console.log(`${label}:`);
  console.log(`  Address:    ${identity.address}`);
  console.log(`  Public Key: ${identity.publicKey}`);
  console.log(`  XMTP Env:   ${identity.xmtpEnv}`);
  console.log(`  Created:    ${identity.createdAt}`);
}

export function identityCommand(options: {
  generate?: boolean;
  force?: boolean;
}): void {
  const configDir = getConfigDir();

  if (options.generate) {
    const existing = loadIdentity(configDir);
    if (existing && !options.force) {
      printIdentity(
        "Identity already exists (use --force to regenerate)",
        existing,
      );
      return;
    }
    const identity = generateIdentity(configDir, { force: options.force });
    printIdentity(
      options.force && existing
        ? "Regenerated identity"
        : "Generated new identity",
      identity,
    );
    return;
  }

  const existing = loadIdentity(configDir);
  if (existing) {
    printIdentity("Current identity", existing);
  } else {
    const identity = getOrCreateIdentity(configDir);
    printIdentity("Created new identity", identity);
  }
}
