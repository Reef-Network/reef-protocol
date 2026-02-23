import * as fs from "node:fs";
import * as path from "node:path";
import { loadIdentity, getConfigDir } from "../identity.js";
import { loadContacts } from "../contacts.js";
import {
  REEF_VERSION,
  A2A_PROTOCOL_VERSION,
  DEFAULT_DIRECTORY_URL,
} from "@reef-protocol/protocol";

/** Query the local daemon's /status endpoint for pending task counts */
async function queryDaemonStatus(
  configDir: string,
): Promise<{ tasksCompleted: number; tasksFailed: number } | null> {
  const lockPath = path.join(configDir, "daemon.lock");
  if (!fs.existsSync(lockPath)) return null;
  try {
    const port = fs.readFileSync(lockPath, "utf-8").trim();
    const res = await fetch(`http://127.0.0.1:${port}/status`);
    if (!res.ok) return null;
    return (await res.json()) as {
      tasksCompleted: number;
      tasksFailed: number;
    };
  } catch {
    return null;
  }
}

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

    // Show pending local task counts from daemon
    const daemonStatus = await queryDaemonStatus(configDir);
    if (daemonStatus) {
      const pending = daemonStatus.tasksCompleted + daemonStatus.tasksFailed;
      if (pending > 0) {
        console.log(`\nDaemon (pending):`);
        console.log(`  Tasks done:     +${daemonStatus.tasksCompleted}`);
        console.log(`  Tasks failed:   +${daemonStatus.tasksFailed}`);
        console.log(`  (will sync to directory on next heartbeat)`);
      }
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
