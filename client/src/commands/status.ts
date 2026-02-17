import { loadIdentity, getConfigDir } from "../identity.js";
import { loadContacts } from "../contacts.js";
import { REEF_VERSION, A2A_PROTOCOL_VERSION } from "@reef-protocol/protocol";

const DEFAULT_DIRECTORY_URL = "http://localhost:3000";

export async function statusCommand(): Promise<void> {
  const configDir = getConfigDir();
  const identity = loadIdentity(configDir);

  console.log("=== Reef Status ===\n");
  console.log(`Reef version:     ${REEF_VERSION}`);
  console.log(`A2A protocol:     ${A2A_PROTOCOL_VERSION}`);

  if (identity) {
    console.log("\nIdentity:");
    console.log(`  Address:  ${identity.address}`);
    console.log(`  XMTP Env: ${identity.xmtpEnv}`);
    console.log(`  Created:  ${identity.createdAt}`);
  } else {
    console.log("\nIdentity: Not created yet");
    console.log("  Run 'reef identity' to generate one.\n");
  }

  const contacts = loadContacts(configDir);
  console.log(`\nContacts: ${contacts.length}`);

  // Fetch network stats from directory
  const directoryUrl = process.env.REEF_DIRECTORY_URL || DEFAULT_DIRECTORY_URL;

  try {
    const res = await fetch(`${directoryUrl}/stats`);
    if (res.ok) {
      const stats = (await res.json()) as {
        totalAgents: number;
        onlineAgents: number;
        topSkills: string[];
      };
      console.log(`\nNetwork:`);
      console.log(`  Total agents:  ${stats.totalAgents}`);
      console.log(`  Online agents: ${stats.onlineAgents}`);
      if (stats.topSkills.length > 0) {
        console.log(`  Top skills:    ${stats.topSkills.join(", ")}`);
      }
    } else {
      console.log(`\nNetwork: Could not reach directory`);
    }
  } catch {
    console.log(`\nNetwork: Directory unavailable`);
  }
}
