import {
  getOrCreateIdentity,
  loadIdentity,
  generateIdentity,
  getConfigDir,
} from "../identity.js";

export function identityCommand(options: { generate?: boolean }): void {
  const configDir = getConfigDir();

  if (options.generate) {
    const identity = generateIdentity(configDir);
    console.log("Generated new identity:");
    console.log(`  Address:    ${identity.address}`);
    console.log(`  Public Key: ${identity.publicKey}`);
    console.log(`  XMTP Env:   ${identity.xmtpEnv}`);
    console.log(`  Created:    ${identity.createdAt}`);
    return;
  }

  const existing = loadIdentity(configDir);
  if (existing) {
    console.log("Current identity:");
    console.log(`  Address:    ${existing.address}`);
    console.log(`  Public Key: ${existing.publicKey}`);
    console.log(`  XMTP Env:   ${existing.xmtpEnv}`);
    console.log(`  Created:    ${existing.createdAt}`);
  } else {
    const identity = getOrCreateIdentity(configDir);
    console.log("Created new identity:");
    console.log(`  Address:    ${identity.address}`);
    console.log(`  Public Key: ${identity.publicKey}`);
    console.log(`  XMTP Env:   ${identity.xmtpEnv}`);
    console.log(`  Created:    ${identity.createdAt}`);
  }
}
