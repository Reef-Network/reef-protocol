import express from "express";
import cors from "cors";
import { agentsRouter } from "./routes/agents.js";
import { appsRouter } from "./routes/apps.js";
import { statsRouter } from "./routes/stats.js";
import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/agents", agentsRouter);
app.use("/apps", appsRouter);
app.use("/stats", statsRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "reef-directory" });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      details: err.errors,
    });
    return;
  }

  console.error("[error]", err.message);
  res.status(500).json({ error: "Internal server error" });
});
