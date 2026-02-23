import { Op, fn, col } from "sequelize";
import { Agent } from "./models/Agent.js";
import { Snapshot } from "./models/Snapshot.js";
import { config } from "./config.js";

/**
 * Compute current network stats and insert a snapshot row.
 */
export async function captureSnapshot(): Promise<void> {
  const totalAgents = await Agent.count();

  const cutoff = new Date(
    Date.now() - config.offlineThresholdMinutes * 60 * 1000,
  );
  const onlineAgents = await Agent.count({
    where: {
      last_heartbeat: { [Op.gte]: cutoff },
      availability: "online",
    },
  });

  const agents = await Agent.findAll({
    attributes: ["skills"],
  });

  const skillCounts = new Map<string, number>();
  for (const agent of agents) {
    if (Array.isArray(agent.skills)) {
      for (const skill of agent.skills) {
        skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);
      }
    }
  }

  const topSkills = [...skillCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill]) => skill);

  // Sum messages_sent across all agents
  const msgResult = (await Agent.findOne({
    attributes: [[fn("COALESCE", fn("SUM", col("messages_sent")), 0), "total"]],
    raw: true,
  })) as unknown as { total: number } | null;
  const messagesReported = Number(msgResult?.total ?? 0);

  await Snapshot.create({
    total_agents: totalAgents,
    online_agents: onlineAgents,
    messages_reported: messagesReported,
    top_skills: topSkills,
    captured_at: new Date(),
  });

  console.log(
    `[snapshot] Captured: ${totalAgents} total, ${onlineAgents} online, ${topSkills.length} skills`,
  );
}

/**
 * Start periodic snapshot capture.
 */
export function startSnapshotCapture(): NodeJS.Timeout {
  captureSnapshot().catch((err) =>
    console.error("[snapshot] Initial capture failed:", err),
  );
  return setInterval(() => {
    captureSnapshot().catch((err) =>
      console.error("[snapshot] Capture failed:", err),
    );
  }, config.snapshotIntervalMs);
}
