import { loadIdentity, getConfigDir } from "../identity.js";
import { loadContacts } from "../contacts.js";
import {
  REEF_VERSION,
  A2A_PROTOCOL_VERSION,
  DEFAULT_DIRECTORY_URL,
} from "@reef-protocol/protocol";

export async function statusCommand(): Promise<void> {
  const configDir = getConfigDir();
  const identity = loadIdentity(configDir);
  const directoryUrl = process.env.REEF_DIRECTORY_URL || DEFAULT_DIRECTORY_URL;

  console.log("=== Reef Status ===\n");
  console.log(`Reef version:     ${REEF_VERSION}`);
  console.log(`A2A protocol:     ${A2A_PROTOCOL_VERSION}`);

  if (identity) {
    console.log("\nIdentity:");
    console.log(`  Address:  ${identity.address}`);
    console.log(`  XMTP Env: ${identity.xmtpEnv}`);
    console.log(`  Created:  ${identity.createdAt}`);

    // Fetch own reputation
    try {
      const repRes = await fetch(
        `${directoryUrl}/agents/${identity.address}/reputation`,
      );
      if (repRes.ok) {
        const rep = (await repRes.json()) as {
          score: number;
          tasksCompleted: number;
          tasksFailed: number;
        };
        console.log(`\nReputation:`);
        console.log(`  Score:          ${rep.score.toFixed(3)}`);
        console.log(`  Tasks done:     ${rep.tasksCompleted}`);
        console.log(`  Tasks failed:   ${rep.tasksFailed}`);
      }
    } catch {
      // Directory may be offline — skip reputation display
    }
  } else {
    console.log("\nIdentity: Not created yet");
    console.log("  Run 'reef identity' to generate one.\n");
  }

  const contacts = loadContacts(configDir);
  console.log(`\nContacts: ${contacts.length}`);

  // Fetch network stats from directory
  try {
    const res = await fetch(`${directoryUrl}/stats`);
    if (res.ok) {
      const stats = (await res.json()) as {
        totalAgents: number;
        onlineAgents: number;
        topSkills: string[];
        averageReputationScore?: number;
      };
      console.log(`\nNetwork:`);
      console.log(`  Total agents:  ${stats.totalAgents}`);
      console.log(`  Online agents: ${stats.onlineAgents}`);
      if (stats.topSkills.length > 0) {
        console.log(`  Top skills:    ${stats.topSkills.join(", ")}`);
      }
      if (stats.averageReputationScore != null) {
        console.log(
          `  Avg reputation: ${stats.averageReputationScore.toFixed(3)}`,
        );
      }
    } else {
      console.log(`\nNetwork: Could not reach directory`);
    }
  } catch {
    console.log(`\nNetwork: Directory unavailable`);
  }
}
