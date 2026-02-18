import { Router } from "express";
import { Op } from "sequelize";
import {
  registerPayloadSchema,
  heartbeatPayloadSchema,
} from "@reef-protocol/protocol";
import type { AgentCard } from "@a2a-js/sdk";
import { verifyMessage, getAddress } from "viem";
import type { Hex } from "viem";
import { Agent } from "../models/Agent.js";
import { App } from "../models/App.js";
import { toAppReputationInput } from "./apps.js";
import {
  registrationLimiter,
  searchLimiter,
  heartbeatLimiter,
  readLimiter,
} from "../middleware/rateLimit.js";
import {
  computeReputationScore,
  computeReputationComponents,
} from "../reputation.js";
import type { ReputationInput } from "../reputation.js";

export const agentsRouter = Router();

/** Build ReputationInput from an Agent model instance */
function toReputationInput(agent: Agent): ReputationInput {
  return {
    createdAt: agent.created_at ?? new Date(),
    lastHeartbeat: agent.last_heartbeat,
    availability: agent.availability,
    tasksCompleted: agent.tasks_completed ?? 0,
    tasksFailed: agent.tasks_failed ?? 0,
    totalInteractions: agent.total_interactions ?? 0,
    agentCard: agent.agent_card,
    name: agent.name,
    bio: agent.bio,
    skills: agent.skills ?? [],
  };
}

/**
 * POST /agents/register
 * Register or update an agent profile with an AgentCard.
 */
agentsRouter.post("/register", registrationLimiter, async (req, res, next) => {
  try {
    const body = registerPayloadSchema.parse(req.body);
    const agentCard: AgentCard = body.agentCard;

    // Extract flat fields from AgentCard for search/stats compat
    const name = agentCard.name;
    const description = agentCard.description || null;
    const skillTags = agentCard.skills.flatMap((s) => s.tags);
    const version = agentCard.version || null;

    let agent = await Agent.findByPk(body.address);

    if (agent) {
      await agent.update({
        name,
        bio: description,
        skills: skillTags,
        version,
        reef_version: agentCard.protocolVersion ?? agent.reef_version,
        availability: "online",
        last_heartbeat: new Date(),
        agent_card: agentCard,
      });
    } else {
      agent = await Agent.create({
        address: body.address,
        name,
        bio: description,
        skills: skillTags,
        availability: "online",
        version,
        reef_version: agentCard.protocolVersion || null,
        last_heartbeat: new Date(),
        agent_card: agentCard,
        reputation_score: 0.5,
        tasks_completed: 0,
        tasks_failed: 0,
        total_interactions: 0,
        reputation_updated_at: null,
      });
    }

    const totalAgents = await Agent.count();

    res.json({ success: true, agentNumber: totalAgents });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /agents/search
 * Search agents by query text, skill, or online status.
 */
agentsRouter.get("/search", searchLimiter, async (req, res, next) => {
  try {
    const { q, skill, online, sortBy } = req.query;
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit as string) || 20),
      100,
    );
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const where: Record<string, unknown> = {};

    if (q && typeof q === "string") {
      where[Op.or as unknown as string] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { bio: { [Op.iLike]: `%${q}%` } },
      ];
    }

    if (skill && typeof skill === "string") {
      // PostgreSQL JSON contains — search skills array
      where.skills = { [Op.contains]: [skill] };
    }

    if (online === "true") {
      where.availability = "online";
    }

    const order: [string, string][] =
      sortBy === "reputation"
        ? [["reputation_score", "DESC"]]
        : [["created_at", "DESC"]];

    const { rows: agents, count: total } = await Agent.findAndCountAll({
      where,
      order,
      limit,
      offset,
    });

    res.json({
      agents: agents.map((a) => ({
        address: a.address,
        name: a.name,
        bio: a.bio,
        skills: a.skills,
        availability: a.availability,
        agentCard: a.agent_card,
        registeredAt: a.created_at?.toISOString(),
        lastHeartbeat: a.last_heartbeat?.toISOString(),
        reputationScore: a.reputation_score,
        country: a.country ?? null,
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /agents/heartbeat
 * Update agent heartbeat timestamp.
 */
agentsRouter.post("/heartbeat", heartbeatLimiter, async (req, res, next) => {
  try {
    const body = heartbeatPayloadSchema.parse(req.body);

    // Verify timestamp is within 5-minute window
    const nowSeconds = Math.floor(Date.now() / 1000);
    const MAX_TIMESTAMP_DRIFT_SECONDS = 300;
    if (Math.abs(nowSeconds - body.timestamp) > MAX_TIMESTAMP_DRIFT_SECONDS) {
      res.status(401).json({ error: "Timestamp out of range" });
      return;
    }

    // Verify signature proves ownership of the address
    const message = `reef-heartbeat:${body.address}:${body.timestamp}`;
    let valid = false;
    try {
      valid = await verifyMessage({
        address: getAddress(body.address) as Hex,
        message,
        signature: body.signature as Hex,
      });
    } catch {
      // viem throws on malformed signatures
    }
    if (!valid) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    const agent = await Agent.findByPk(body.address);
    if (!agent) {
      res.status(404).json({ error: "Agent not registered" });
      return;
    }

    // Accumulate task telemetry if provided (clamped to prevent manipulation)
    const MAX_TASKS_PER_HEARTBEAT = 100;
    const telemetry = body.telemetry;
    const completedDelta = Math.min(
      Math.max(0, telemetry?.tasksCompleted ?? 0),
      MAX_TASKS_PER_HEARTBEAT,
    );
    const failedDelta = Math.min(
      Math.max(0, telemetry?.tasksFailed ?? 0),
      MAX_TASKS_PER_HEARTBEAT,
    );

    // Update heartbeat and recompute reputation
    const now = new Date();

    const updatedFields: Record<string, unknown> = {
      last_heartbeat: now,
      availability: "online",
      tasks_completed: agent.tasks_completed + completedDelta,
      tasks_failed: agent.tasks_failed + failedDelta,
      total_interactions:
        agent.total_interactions + completedDelta + failedDelta,
    };

    // Update country if provided
    if (telemetry?.country) {
      updatedFields.country = telemetry.country;
    }

    // Compute reputation with the new values
    const inputForScore = toReputationInput({
      ...agent.get({ plain: true }),
      tasks_completed: agent.tasks_completed + completedDelta,
      tasks_failed: agent.tasks_failed + failedDelta,
      total_interactions:
        agent.total_interactions + completedDelta + failedDelta,
      created_at: agent.created_at ?? now,
    } as Agent);

    updatedFields.reputation_score = computeReputationScore(inputForScore, now);
    updatedFields.reputation_updated_at = now;

    await agent.update(updatedFields);

    // Piggyback: refresh any coordinated apps owned by this agent
    const coordinatedApps = await App.findAll({
      where: { coordinator_address: body.address },
    });

    for (const coordApp of coordinatedApps) {
      const appFields: Record<string, unknown> = {
        availability: "available",
        last_refreshed: now,
        tasks_completed: coordApp.tasks_completed + completedDelta,
        tasks_failed: coordApp.tasks_failed + failedDelta,
        total_interactions:
          coordApp.total_interactions + completedDelta + failedDelta,
      };

      const appInput = toAppReputationInput({
        ...coordApp.get({ plain: true }),
        tasks_completed: coordApp.tasks_completed + completedDelta,
        tasks_failed: coordApp.tasks_failed + failedDelta,
        total_interactions:
          coordApp.total_interactions + completedDelta + failedDelta,
        created_at: coordApp.created_at ?? now,
      } as App);

      appFields.reputation_score = computeReputationScore(appInput, now);
      appFields.reputation_updated_at = now;
      await coordApp.update(appFields);
    }

    const totalAgents = await Agent.count();
    const onlineAgents = await Agent.count({
      where: { availability: "online" },
    });

    res.json({
      success: true,
      stats: { totalAgents, onlineAgents },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /agents/:address
 * Get a single agent profile by address.
 */
/**
 * GET /agents/:address/reputation
 * Get full reputation breakdown for an agent.
 */
agentsRouter.get(
  "/:address/reputation",
  readLimiter,
  async (req, res, next) => {
    try {
      const agent = await Agent.findByPk(req.params.address as string);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const input = toReputationInput(agent);
      const components = computeReputationComponents(input);

      res.json({
        address: agent.address,
        score: agent.reputation_score,
        components,
        tasksCompleted: agent.tasks_completed,
        tasksFailed: agent.tasks_failed,
        totalInteractions: agent.total_interactions,
        registeredAt: agent.created_at?.toISOString(),
        updatedAt: agent.reputation_updated_at?.toISOString() ?? null,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /agents/:address
 * Get a single agent profile by address.
 */
agentsRouter.get("/:address", readLimiter, async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.address as string);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    res.json({
      address: agent.address,
      name: agent.name,
      bio: agent.bio,
      skills: agent.skills,
      availability: agent.availability,
      agentCard: agent.agent_card,
      registeredAt: agent.created_at?.toISOString(),
      lastHeartbeat: agent.last_heartbeat?.toISOString(),
      reputationScore: agent.reputation_score,
      tasksCompleted: agent.tasks_completed,
      tasksFailed: agent.tasks_failed,
      totalInteractions: agent.total_interactions,
      country: agent.country ?? null,
    });
  } catch (err) {
    next(err);
  }
});
