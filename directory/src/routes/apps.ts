import { Router } from "express";
import { Op } from "sequelize";
import { appRegisterPayloadSchema } from "@reef-protocol/protocol";
import { App } from "../models/App.js";
import {
  registrationLimiter,
  searchLimiter,
  readLimiter,
} from "../middleware/rateLimit.js";
import { computeReputationComponents } from "../reputation.js";
import type { ReputationInput } from "../reputation.js";

export const appsRouter = Router();

/** Build ReputationInput from an App model instance */
export function toAppReputationInput(app: App): ReputationInput {
  return {
    createdAt: app.created_at ?? new Date(),
    lastHeartbeat: app.last_refreshed,
    availability: app.availability,
    tasksCompleted: app.tasks_completed ?? 0,
    tasksFailed: app.tasks_failed ?? 0,
    totalInteractions: app.total_interactions ?? 0,
    agentCard: app.manifest,
    name: app.name,
    bio: app.description,
    skills: app.manifest?.actions?.map((a) => a.id) ?? [],
  };
}

/**
 * POST /apps/register
 * Register or update an app with its manifest.
 */
appsRouter.post("/register", registrationLimiter, async (req, res, next) => {
  try {
    const body = appRegisterPayloadSchema.parse(req.body);
    const addr = body.address.toLowerCase();
    const manifest = body.manifest;
    const coordinatorAddr = manifest.coordinatorAddress?.toLowerCase() || null;

    const isCoordinated = !!manifest.coordinatorAddress;

    let app = await App.findByPk(body.appId);

    if (app) {
      // Ownership check: reject if app is owned by a different address
      if (app.registered_by && app.registered_by !== addr) {
        res
          .status(403)
          .json({ error: "Forbidden: app is owned by a different address" });
        return;
      }

      await app.update({
        name: manifest.name,
        description: manifest.description || null,
        version: manifest.version,
        category: manifest.category || null,
        coordinator_address: coordinatorAddr,
        availability: "available",
        manifest,
        last_refreshed: isCoordinated ? new Date() : null,
        registered_by: app.registered_by ?? addr,
      });
    } else {
      app = await App.create({
        app_id: body.appId,
        name: manifest.name,
        description: manifest.description || null,
        version: manifest.version,
        category: manifest.category || null,
        coordinator_address: coordinatorAddr,
        registered_by: addr,
        availability: "available",
        manifest,
        reputation_score: 0.5,
        tasks_completed: 0,
        tasks_failed: 0,
        total_interactions: 0,
        reputation_updated_at: null,
        last_refreshed: isCoordinated ? new Date() : null,
      });
    }

    const totalApps = await App.count();

    res.json({ success: true, appNumber: totalApps });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /apps/search
 * Search apps by query text, category, type, or availability.
 */
appsRouter.get("/search", searchLimiter, async (req, res, next) => {
  try {
    const { q, category, type, available, sortBy } = req.query;
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit as string) || 20),
      100,
    );
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
    const where: Record<string, unknown> = {};

    if (q && typeof q === "string") {
      where[Op.or as unknown as string] = [
        { name: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
      ];
    }

    if (category && typeof category === "string") {
      where.category = category;
    }

    if (type === "p2p") {
      where.coordinator_address = null;
    } else if (type === "coordinated") {
      where.coordinator_address = { [Op.ne]: null };
    }

    if (available === "true") {
      where.availability = "available";
    }

    const order: [string, string][] =
      sortBy === "reputation"
        ? [["reputation_score", "DESC"]]
        : [["created_at", "DESC"]];

    const { rows: apps, count: total } = await App.findAndCountAll({
      where,
      order,
      limit,
      offset,
    });

    res.json({
      apps: apps.map((a) => ({
        appId: a.app_id,
        name: a.name,
        description: a.description,
        version: a.version,
        category: a.category,
        type: a.coordinator_address ? "coordinated" : "p2p",
        coordinatorAddress: a.coordinator_address,
        availability: a.availability,
        manifest: a.manifest,
        registeredBy: a.registered_by,
        registeredAt: a.created_at?.toISOString(),
        lastRefreshed: a.last_refreshed?.toISOString(),
        reputationScore: a.reputation_score,
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
 * GET /apps/:appId/reputation
 * Get full reputation breakdown for an app.
 */
appsRouter.get("/:appId/reputation", readLimiter, async (req, res, next) => {
  try {
    const app = await App.findByPk(req.params.appId as string);
    if (!app) {
      res.status(404).json({ error: "App not found" });
      return;
    }

    const input = toAppReputationInput(app);
    const components = computeReputationComponents(input);

    res.json({
      appId: app.app_id,
      score: app.reputation_score,
      components,
      tasksCompleted: app.tasks_completed,
      tasksFailed: app.tasks_failed,
      totalInteractions: app.total_interactions,
      registeredAt: app.created_at?.toISOString(),
      updatedAt: app.reputation_updated_at?.toISOString() ?? null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /apps/:appId
 * Get a single app profile.
 */
appsRouter.get("/:appId", readLimiter, async (req, res, next) => {
  try {
    const app = await App.findByPk(req.params.appId as string);
    if (!app) {
      res.status(404).json({ error: "App not found" });
      return;
    }

    res.json({
      appId: app.app_id,
      name: app.name,
      description: app.description,
      version: app.version,
      category: app.category,
      type: app.coordinator_address ? "coordinated" : "p2p",
      coordinatorAddress: app.coordinator_address,
      availability: app.availability,
      manifest: app.manifest,
      registeredBy: app.registered_by,
      registeredAt: app.created_at?.toISOString(),
      lastRefreshed: app.last_refreshed?.toISOString(),
      reputationScore: app.reputation_score,
      tasksCompleted: app.tasks_completed,
      tasksFailed: app.tasks_failed,
      totalInteractions: app.total_interactions,
    });
  } catch (err) {
    next(err);
  }
});
