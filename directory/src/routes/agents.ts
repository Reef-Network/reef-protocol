import { Router } from "express";
import { Op } from "sequelize";
import {
  registerPayloadSchema,
  heartbeatPayloadSchema,
} from "@reef-protocol/protocol";
import type { AgentCard } from "@a2a-js/sdk";
import { Agent } from "../models/Agent.js";
import { registrationLimiter, searchLimiter } from "../middleware/rateLimit.js";

export const agentsRouter = Router();

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
    const { q, skill, online } = req.query;
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

    const agents = await Agent.findAll({ where });

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
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /agents/heartbeat
 * Update agent heartbeat timestamp.
 */
agentsRouter.post("/heartbeat", async (req, res, next) => {
  try {
    const body = heartbeatPayloadSchema.parse(req.body);

    const agent = await Agent.findByPk(body.address);
    if (!agent) {
      res.status(404).json({ error: "Agent not registered" });
      return;
    }

    await agent.update({
      last_heartbeat: new Date(),
      availability: "online",
    });

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
agentsRouter.get("/:address", async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.address);
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
    });
  } catch (err) {
    next(err);
  }
});
