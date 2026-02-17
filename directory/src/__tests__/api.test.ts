import { describe, it, expect, beforeAll } from "vitest";
import { newDb } from "pg-mem";
import { Sequelize } from "sequelize";
import supertest from "supertest";
import { initDb } from "../db.js";
import { app } from "../app.js";

let request: supertest.SuperTest<supertest.Test>;

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
  it("registers a new agent", async () => {
    const res = await request.post("/agents/register").send({
      address: "0xAgent001",
      name: "Test Agent",
      bio: "A test agent",
      skills: ["testing", "validation"],
      reefVersion: "0.1.0",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.agentNumber).toBe("number");
  });

  it("upserts an existing agent", async () => {
    await request.post("/agents/register").send({
      address: "0xAgent002",
      name: "Original Name",
    });

    const res = await request.post("/agents/register").send({
      address: "0xAgent002",
      name: "Updated Name",
      bio: "New bio",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("rejects missing address", async () => {
    const res = await request
      .post("/agents/register")
      .send({ name: "No Address" });

    expect(res.status).toBe(400);
  });

  it("rejects missing name", async () => {
    const res = await request
      .post("/agents/register")
      .send({ address: "0xNoName" });

    expect(res.status).toBe(400);
  });
});

describe("GET /agents/:address", () => {
  it("returns a registered agent", async () => {
    const res = await request.get("/agents/0xAgent001");

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Test Agent");
    expect(res.body.address).toBe("0xAgent001");
    expect(res.body.skills).toEqual(["testing", "validation"]);
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
  it("returns network stats", async () => {
    const res = await request.get("/stats");

    expect(res.status).toBe(200);
    expect(typeof res.body.totalAgents).toBe("number");
    expect(typeof res.body.onlineAgents).toBe("number");
    expect(Array.isArray(res.body.topSkills)).toBe(true);
  });

  it("includes skills from registered agents", async () => {
    const res = await request.get("/stats");

    // Agent001 registered with ["testing", "validation"]
    expect(res.body.topSkills).toContain("testing");
  });
});
