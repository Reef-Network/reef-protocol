import { describe, it, expect, beforeAll } from "vitest";
import { newDb } from "pg-mem";
import { Sequelize } from "sequelize";
import supertest from "supertest";
import { initDb } from "../db.js";
import { app } from "../app.js";

let request: supertest.SuperTest<supertest.Test>;

/** Helper to build a minimal AgentCard for testing */
function makeAgentCard(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Agent",
    description: "A test agent",
    url: "xmtp://0xAgent001",
    version: "0.2.0",
    protocolVersion: "0.3.0",
    skills: [
      {
        id: "testing",
        name: "Testing",
        description: "Run tests",
        tags: ["testing", "validation"],
      },
    ],
    capabilities: { streaming: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    ...overrides,
  };
}

beforeAll(async () => {
  const pgMem = newDb();

  // pg-mem needs some functions that Sequelize uses
  pgMem.public.registerFunction({
    name: "current_database",
    implementation: () => "test",
  });
  pgMem.public.registerFunction({
    name: "version",
    implementation: () => "PostgreSQL 16.0 (pg-mem)",
  });

  const testSequelize = new Sequelize({
    dialect: "postgres",
    dialectModule: pgMem.adapters.createPg(),
    logging: false,
    define: { underscored: true },
  });

  await initDb(testSequelize);

  request = supertest(app) as unknown as supertest.SuperTest<supertest.Test>;
});

describe("health", () => {
  it("returns ok", async () => {
    const res = await request.get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "reef-directory" });
  });
});

describe("POST /agents/register", () => {
  it("registers a new agent with AgentCard", async () => {
    const res = await request.post("/agents/register").send({
      address: "0xAgent001",
      agentCard: makeAgentCard(),
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.agentNumber).toBe("number");
  });

  it("upserts an existing agent", async () => {
    await request.post("/agents/register").send({
      address: "0xAgent002",
      agentCard: makeAgentCard({ name: "Original Name" }),
    });

    const res = await request.post("/agents/register").send({
      address: "0xAgent002",
      agentCard: makeAgentCard({
        name: "Updated Name",
        description: "New bio",
      }),
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("rejects missing address", async () => {
    const res = await request
      .post("/agents/register")
      .send({ agentCard: makeAgentCard() });

    expect(res.status).toBe(400);
  });

  it("rejects missing agentCard", async () => {
    const res = await request
      .post("/agents/register")
      .send({ address: "0xNoCard" });

    expect(res.status).toBe(400);
  });
});

describe("GET /agents/:address", () => {
  it("returns a registered agent with agentCard", async () => {
    const res = await request.get("/agents/0xAgent001");

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Test Agent");
    expect(res.body.address).toBe("0xAgent001");
    expect(res.body.skills).toEqual(["testing", "validation"]);
    expect(res.body.agentCard).toBeTruthy();
    expect(res.body.agentCard.name).toBe("Test Agent");
    expect(res.body.agentCard.protocolVersion).toBe("0.3.0");
  });

  it("returns 404 for unknown agent", async () => {
    const res = await request.get("/agents/0xDoesNotExist");
    expect(res.status).toBe(404);
  });
});

describe("GET /agents/search", () => {
  it("searches by query text", async () => {
    const res = await request.get("/agents/search?q=Test");

    expect(res.status).toBe(200);
    expect(res.body.agents.length).toBeGreaterThan(0);
    expect(res.body.agents[0].name).toContain("Test");
  });

  it("includes agentCard in search results", async () => {
    const res = await request.get("/agents/search?q=Test");

    expect(res.status).toBe(200);
    expect(res.body.agents[0].agentCard).toBeTruthy();
    expect(res.body.agents[0].agentCard.url).toContain("xmtp://");
  });

  it("filters by online status", async () => {
    const res = await request.get("/agents/search?online=true");

    expect(res.status).toBe(200);
    for (const agent of res.body.agents) {
      expect(agent.availability).toBe("online");
    }
  });

  it("returns empty array for no matches", async () => {
    const res = await request.get("/agents/search?q=zzzznonexistent");

    expect(res.status).toBe(200);
    expect(res.body.agents).toEqual([]);
  });
});

describe("POST /agents/heartbeat", () => {
  it("updates heartbeat for registered agent", async () => {
    const res = await request
      .post("/agents/heartbeat")
      .send({ address: "0xAgent001" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.stats.totalAgents).toBe("number");
    expect(typeof res.body.stats.onlineAgents).toBe("number");
  });

  it("returns 404 for unregistered agent", async () => {
    const res = await request
      .post("/agents/heartbeat")
      .send({ address: "0xUnregistered" });

    expect(res.status).toBe(404);
  });

  it("rejects missing address", async () => {
    const res = await request.post("/agents/heartbeat").send({});

    expect(res.status).toBe(400);
  });
});

describe("GET /stats", () => {
  it("returns live stats when no snapshot exists", async () => {
    const res = await request.get("/stats");

    expect(res.status).toBe(200);
    expect(typeof res.body.totalAgents).toBe("number");
    expect(typeof res.body.onlineAgents).toBe("number");
    expect(Array.isArray(res.body.topSkills)).toBe(true);
    expect(res.body.capturedAt).toBeUndefined();
  });

  it("includes skills from registered agents in live fallback", async () => {
    const res = await request.get("/stats");

    // Agent001 registered with skills tags ["testing", "validation"]
    expect(res.body.topSkills).toContain("testing");
  });

  it("returns snapshot data when a snapshot exists", async () => {
    const { Snapshot } = await import("../models/Snapshot.js");

    await Snapshot.create({
      total_agents: 42,
      online_agents: 7,
      messages_reported: 0,
      top_skills: ["coding", "testing"],
      captured_at: new Date(),
    });

    const res = await request.get("/stats");

    expect(res.status).toBe(200);
    expect(res.body.totalAgents).toBe(42);
    expect(res.body.onlineAgents).toBe(7);
    expect(res.body.topSkills).toEqual(["coding", "testing"]);
    expect(typeof res.body.capturedAt).toBe("string");
  });

  it("returns the most recent snapshot", async () => {
    const { Snapshot } = await import("../models/Snapshot.js");

    await Snapshot.create({
      total_agents: 99,
      online_agents: 50,
      messages_reported: 0,
      top_skills: ["latest-skill"],
      captured_at: new Date(),
    });

    const res = await request.get("/stats");

    expect(res.status).toBe(200);
    expect(res.body.totalAgents).toBe(99);
    expect(res.body.topSkills).toEqual(["latest-skill"]);
  });
});
