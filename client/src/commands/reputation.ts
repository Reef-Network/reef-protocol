import { DEFAULT_DIRECTORY_URL } from "@reef-protocol/protocol";

interface ReputationResponse {
  address: string;
  score: number;
  components: {
    uptimeReliability: number;
    profileCompleteness: number;
    taskSuccessRate: number;
    activityLevel: number;
  };
  tasksCompleted: number;
  tasksFailed: number;
  totalInteractions: number;
  registeredAt: string;
  updatedAt: string | null;
}

export async function reputationCommand(address: string): Promise<void> {
  const directoryUrl = process.env.REEF_DIRECTORY_URL || DEFAULT_DIRECTORY_URL;

  try {
    const res = await fetch(`${directoryUrl}/agents/${address}/reputation`);

    if (!res.ok) {
      if (res.status === 404) {
        console.error(`Agent not found: ${address}`);
      } else {
        console.error(`Request failed: ${res.status} ${res.statusText}`);
      }
      return;
    }

    const rep = (await res.json()) as ReputationResponse;

    console.log(`=== Reputation: ${address} ===\n`);
    console.log(`  Score:              ${rep.score.toFixed(3)}`);
    console.log(`\n  Components:`);
    console.log(
      `    Uptime reliability:    ${rep.components.uptimeReliability.toFixed(3)}`,
    );
    console.log(
      `    Profile completeness:  ${rep.components.profileCompleteness.toFixed(3)}`,
    );
    console.log(
      `    Task success rate:     ${rep.components.taskSuccessRate.toFixed(3)}`,
    );
    console.log(
      `    Activity level:        ${rep.components.activityLevel.toFixed(3)}`,
    );
    console.log(`\n  Stats:`);
    console.log(`    Tasks completed:  ${rep.tasksCompleted}`);
    console.log(`    Tasks failed:     ${rep.tasksFailed}`);
    console.log(`    Total interactions: ${rep.totalInteractions}`);
    console.log(`    Registered:       ${rep.registeredAt}`);
    if (rep.updatedAt) {
      console.log(`    Last updated:     ${rep.updatedAt}`);
    }
  } catch (err) {
    console.error(`Could not reach directory: ${(err as Error).message}`);
  }
}
