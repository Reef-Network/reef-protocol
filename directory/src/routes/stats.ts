import { Router } from "express";
import { Op, fn, col } from "sequelize";
import { Agent } from "../models/Agent.js";
import { App } from "../models/App.js";
import { Snapshot } from "../models/Snapshot.js";
import { config } from "../config.js";
import { readLimiter } from "../middleware/rateLimit.js";

export const statsRouter = Router();

let statsCache: { data: unknown; expiresAt: number } | null = null;
const STATS_CACHE_TTL_MS = 60_000; // 1 minute

/** Clear the stats cache (used in tests). */
export function clearStatsCache() {
  statsCache = null;
}

/**
 * Compute live stats (fallback when no snapshot exists).
 */
async function computeLiveStats() {
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

  // Compute average reputation score
  const avgResult = (await Agent.findOne({
    attributes: [[fn("AVG", col("reputation_score")), "avgScore"]],
    raw: true,
  })) as unknown as { avgScore: number | null } | null;
  const averageReputationScore = avgResult?.avgScore
    ? Math.round(avgResult.avgScore * 1000) / 1000
    : 0.5;

  const totalApps = await App.count();
  const availableApps = await App.count({
    where: { availability: "available" },
  });

  return {
    totalAgents,
    onlineAgents,
    topSkills,
    averageReputationScore,
    totalApps,
    availableApps,
  };
}

/**
 * GET /stats
 * Network-wide statistics — reads from latest snapshot, falls back to live.
 */
statsRouter.get("/", readLimiter, async (_req, res, next) => {
  try {
    const now = Date.now();
    if (statsCache && now < statsCache.expiresAt) {
      res.json(statsCache.data);
      return;
    }

    let data: unknown;

    const snapshot = await Snapshot.findOne({
      order: [["captured_at", "DESC"]],
    });

    if (snapshot) {
      // Compute live average reputation even when using snapshot for other stats
      const avgResult = (await Agent.findOne({
        attributes: [[fn("AVG", col("reputation_score")), "avgScore"]],
        raw: true,
      })) as unknown as { avgScore: number | null } | null;
      const averageReputationScore = avgResult?.avgScore
        ? Math.round(avgResult.avgScore * 1000) / 1000
        : 0.5;

      // Compute live app counts (not snapshotted)
      const totalApps = await App.count();
      const availableApps = await App.count({
        where: { availability: "available" },
      });

      data = {
        totalAgents: snapshot.total_agents,
        onlineAgents: snapshot.online_agents,
        topSkills: snapshot.top_skills,
        averageReputationScore,
        totalApps,
        availableApps,
        capturedAt: snapshot.captured_at.toISOString(),
      };
    } else {
      data = await computeLiveStats();
    }

    statsCache = { data, expiresAt: now + STATS_CACHE_TTL_MS };
    res.json(data);
  } catch (err) {
    next(err);
  }
});
