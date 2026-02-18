import { Op } from "sequelize";
import { Agent } from "./models/Agent.js";
import { App } from "./models/App.js";
import { config } from "./config.js";

/**
 * Mark agents as offline if their last heartbeat is older than the threshold.
 */
export async function sweepStaleAgents(): Promise<void> {
  const cutoff = new Date(
    Date.now() - config.offlineThresholdMinutes * 60 * 1000,
  );

  const [count] = await Agent.update(
    { availability: "offline" },
    {
      where: {
        availability: "online",
        last_heartbeat: { [Op.lt]: cutoff },
      },
    },
  );

  if (count > 0) {
    console.log(`[sweep] Marked ${count} agent(s) as offline`);
  }
}

/**
 * Mark coordinated apps as offline if their coordinator hasn't refreshed recently.
 * P2P apps (coordinator_address IS NULL) are never swept.
 */
export async function sweepStaleApps(): Promise<void> {
  const cutoff = new Date(
    Date.now() - config.offlineThresholdMinutes * 60 * 1000,
  );

  const [count] = await App.update(
    { availability: "offline" },
    {
      where: {
        availability: "available",
        coordinator_address: { [Op.ne]: null },
        last_refreshed: { [Op.lt]: cutoff },
      },
    },
  );

  if (count > 0) {
    console.log(`[sweep] Marked ${count} app(s) as offline`);
  }
}

/**
 * Start the periodic stale-agent and stale-app sweep.
 */
export function startSweep(): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      await sweepStaleAgents();
      await sweepStaleApps();
    } catch (err) {
      console.error("[sweep] Error:", (err as Error).message);
    }
  }, config.sweepIntervalMs);
}
