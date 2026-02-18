import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { newDb } from "pg-mem";
import { Sequelize } from "sequelize";
import supertest from "supertest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { initDb } from "../db.js";
import { app } from "../app.js";

let request: supertest.SuperTest<supertest.Test>;

/** Generate real keypairs for heartbeat signature tests */
const testKey = generatePrivateKey();
const testAccount = privateKeyToAccount(testKey);
const testAddress = testAccount.address;

const coordinatorKey = generatePrivateKey();
const coordinatorAccount = privateKeyToAccount(coordinatorKey);
const coordinatorAddress = coordinatorAccount.address;

/** Helper to build a signed heartbeat payload */
async function signedHeartbeat(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const address = (overrides.address as string) || testAddress;
  const timestamp =
    (overrides.timestamp as number) || Math.floor(Date.now() / 1000);
  const message = `reef-heartbeat:${address}:${timestamp}`;
  const account = overrides._account || testAccount;
  const signature = await (account as typeof testAccount).signMessage({
    message,
  });
  return {
    address,
    timestamp,
    signature,
    ...overrides,
    // Remove internal-only fields
    _account: undefined,
  };
}

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

// Pre-register coordinator agent (used later by heartbeat piggybacking tests)
describe("coordinator agent setup", () => {
  it("registers a coordinator agent", async () => {
    const res = await request.post("/agents/register").send({
      address: coordinatorAddress,
      agentCard: makeAgentCard({ name: "Coordinator Agent" }),
    });
    expect(res.status).toBe(200);
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

  it("includes reputation fields in profile", async () => {
    const res = await request.get("/agents/0xAgent001");

    expect(res.status).toBe(200);
    expect(typeof res.body.reputationScore).toBe("number");
    expect(typeof res.body.tasksCompleted).toBe("number");
    expect(typeof res.body.tasksFailed).toBe("number");
    expect(typeof res.body.totalInteractions).toBe("number");
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
    expect(
      res.body.agents.some((a: { name: string }) => a.name.includes("Test")),
    ).toBe(true);
  });

  it("includes agentCard in search results", async () => {
    const res = await request.get("/agents/search?q=Test");

    expect(res.status).toBe(200);
    expect(res.body.agents[0].agentCard).toBeTruthy();
    expect(res.body.agents[0].agentCard.url).toContain("xmtp://");
  });

  it("includes reputationScore in search results", async () => {
    const res = await request.get("/agents/search?q=Test");

    expect(res.status).toBe(200);
    expect(typeof res.body.agents[0].reputationScore).toBe("number");
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
  // Register the test agent (with a real address for signature verification)
  beforeAll(async () => {
    await request.post("/agents/register").send({
      address: testAddress,
      agentCard: makeAgentCard({ name: "Signed Agent" }),
    });
  });

  it("accepts heartbeat with valid signature", async () => {
    const payload = await signedHeartbeat();

    const res = await request.post("/agents/heartbeat").send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.stats.totalAgents).toBe("number");
    expect(typeof res.body.stats.onlineAgents).toBe("number");
  });

  it("rejects heartbeat with invalid signature", async () => {
    const payload = await signedHeartbeat();
    // Tamper with the signature
    payload.signature = "0x" + "ab".repeat(65);

    const res = await request.post("/agents/heartbeat").send(payload);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid signature");
  });

  it("rejects heartbeat signed by wrong key", async () => {
    const otherKey = generatePrivateKey();
    const otherAccount = privateKeyToAccount(otherKey);

    // Sign with otherAccount but claim to be testAddress
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `reef-heartbeat:${testAddress}:${timestamp}`;
    const signature = await otherAccount.signMessage({ message });

    const res = await request.post("/agents/heartbeat").send({
      address: testAddress,
      timestamp,
      signature,
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid signature");
  });

  it("rejects heartbeat with expired timestamp", async () => {
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const message = `reef-heartbeat:${testAddress}:${expiredTimestamp}`;
    const signature = await testAccount.signMessage({ message });

    const res = await request.post("/agents/heartbeat").send({
      address: testAddress,
      timestamp: expiredTimestamp,
      signature,
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Timestamp out of range");
  });

  it("returns 404 for unregistered agent", async () => {
    const unregKey = generatePrivateKey();
    const unregAccount = privateKeyToAccount(unregKey);
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `reef-heartbeat:${unregAccount.address}:${timestamp}`;
    const signature = await unregAccount.signMessage({ message });

    const res = await request.post("/agents/heartbeat").send({
      address: unregAccount.address,
      timestamp,
      signature,
    });

    expect(res.status).toBe(404);
  });

  it("accumulates task telemetry", async () => {
    const payload = await signedHeartbeat({
      telemetry: { tasksCompleted: 5, tasksFailed: 1 },
    });

    const res = await request.post("/agents/heartbeat").send(payload);

    expect(res.status).toBe(200);

    // Verify counters were accumulated
    const profile = await request.get(`/agents/${testAddress}`);
    expect(profile.body.tasksCompleted).toBe(5);
    expect(profile.body.tasksFailed).toBe(1);
    expect(profile.body.totalInteractions).toBe(6);
  });

  it("rejects missing signature", async () => {
    const res = await request.post("/agents/heartbeat").send({
      address: testAddress,
      timestamp: Math.floor(Date.now() / 1000),
    });

    expect(res.status).toBe(400);
  });
});

describe("GET /agents/:address/reputation", () => {
  it("returns reputation breakdown", async () => {
    const res = await request.get("/agents/0xAgent001/reputation");

    expect(res.status).toBe(200);
    expect(typeof res.body.score).toBe("number");
    expect(res.body.address).toBe("0xAgent001");
    expect(res.body.components).toHaveProperty("uptimeReliability");
    expect(res.body.components).toHaveProperty("profileCompleteness");
    expect(res.body.components).toHaveProperty("taskSuccessRate");
    expect(res.body.components).toHaveProperty("activityLevel");
    expect(typeof res.body.tasksCompleted).toBe("number");
    expect(typeof res.body.tasksFailed).toBe("number");
    expect(typeof res.body.totalInteractions).toBe("number");
  });

  it("returns 404 for unknown agent", async () => {
    const res = await request.get("/agents/0xUnknown/reputation");
    expect(res.status).toBe(404);
  });
});

describe("GET /stats", () => {
  beforeEach(async () => {
    const { clearStatsCache } = await import("../routes/stats.js");
    clearStatsCache();
  });

  it("returns live stats when no snapshot exists", async () => {
    // Delete snapshots to force live computation
    const { Snapshot } = await import("../models/Snapshot.js");
    await Snapshot.destroy({ where: {} });

    const res = await request.get("/stats");

    expect(res.status).toBe(200);
    expect(typeof res.body.totalAgents).toBe("number");
    expect(typeof res.body.onlineAgents).toBe("number");
    expect(Array.isArray(res.body.topSkills)).toBe(true);
    expect(typeof res.body.averageReputationScore).toBe("number");
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

  it("includes app counts in stats", async () => {
    const res = await request.get("/stats");

    expect(res.status).toBe(200);
    expect(typeof res.body.totalApps).toBe("number");
    expect(typeof res.body.availableApps).toBe("number");
  });
});

// ── Apps ────────────────────────────────────────────────────────────

/** Helper to build a minimal AppManifest for testing */
function makeManifest(overrides: Record<string, unknown> = {}) {
  return {
    appId: "test-app",
    name: "Test App",
    description: "A test application",
    version: "0.1.0",
    actions: [{ id: "interact", name: "Interact", description: "Default" }],
    minParticipants: 1,
    ...overrides,
  };
}

describe("POST /apps/register", () => {
  it("registers a P2P app", async () => {
    const res = await request.post("/apps/register").send({
      address: "0xAppOwner1",
      appId: "p2p-chess",
      manifest: makeManifest({
        appId: "p2p-chess",
        name: "P2P Chess",
        minParticipants: 2,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.appNumber).toBe("number");
  });

  it("registers a coordinated app", async () => {
    const res = await request.post("/apps/register").send({
      address: coordinatorAddress,
      appId: "reef-news",
      manifest: makeManifest({
        appId: "reef-news",
        name: "Reef News",
        category: "social",
        coordinatorAddress: coordinatorAddress,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("upserts an existing app", async () => {
    await request.post("/apps/register").send({
      address: "0xUpsertOwner",
      appId: "upsert-app",
      manifest: makeManifest({ appId: "upsert-app", name: "V1" }),
    });

    const res = await request.post("/apps/register").send({
      address: "0xUpsertOwner",
      appId: "upsert-app",
      manifest: makeManifest({ appId: "upsert-app", name: "V2" }),
    });

    expect(res.status).toBe(200);

    const info = await request.get("/apps/upsert-app");
    expect(info.body.name).toBe("V2");
  });

  it("rejects missing manifest", async () => {
    const res = await request
      .post("/apps/register")
      .send({ address: "0xTest", appId: "no-manifest" });

    // 400 from validation, or 429 if rate-limited in test sequence
    expect([400, 429]).toContain(res.status);
  });

  it("rejects invalid appId in manifest", async () => {
    const res = await request.post("/apps/register").send({
      address: "0xTest",
      appId: "Bad App",
      manifest: makeManifest({ appId: "Bad App" }),
    });

    // 400 from validation, or 429 if rate-limited in test sequence
    expect([400, 429]).toContain(res.status);
  });
});

describe("GET /apps/:appId", () => {
  it("returns a registered app", async () => {
    const res = await request.get("/apps/p2p-chess");

    expect(res.status).toBe(200);
    expect(res.body.appId).toBe("p2p-chess");
    expect(res.body.name).toBe("P2P Chess");
    expect(res.body.type).toBe("p2p");
    expect(res.body.availability).toBe("available");
    expect(typeof res.body.reputationScore).toBe("number");
    expect(res.body.manifest).toBeTruthy();
  });

  it("returns coordinated type for coordinated app", async () => {
    const res = await request.get("/apps/reef-news");

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("coordinated");
    expect(res.body.coordinatorAddress).toBe(coordinatorAddress);
  });

  it("returns 404 for unknown app", async () => {
    const res = await request.get("/apps/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("GET /apps/search", () => {
  it("searches by query text", async () => {
    const res = await request.get("/apps/search?q=Chess");

    expect(res.status).toBe(200);
    expect(res.body.apps.length).toBeGreaterThan(0);
    expect(res.body.apps[0].name).toContain("Chess");
  });

  it("filters by category", async () => {
    const res = await request.get("/apps/search?category=social");

    expect(res.status).toBe(200);
    for (const app of res.body.apps) {
      expect(app.category).toBe("social");
    }
  });

  it("filters by type p2p", async () => {
    const res = await request.get("/apps/search?type=p2p");

    expect(res.status).toBe(200);
    for (const app of res.body.apps) {
      expect(app.type).toBe("p2p");
      expect(app.coordinatorAddress).toBeNull();
    }
  });

  it("filters by type coordinated", async () => {
    const res = await request.get("/apps/search?type=coordinated");

    expect(res.status).toBe(200);
    expect(res.body.apps.length).toBeGreaterThan(0);
    for (const app of res.body.apps) {
      expect(app.type).toBe("coordinated");
    }
  });

  it("filters by availability", async () => {
    const res = await request.get("/apps/search?available=true");

    expect(res.status).toBe(200);
    for (const app of res.body.apps) {
      expect(app.availability).toBe("available");
    }
  });

  it("returns empty array for no matches", async () => {
    const res = await request.get("/apps/search?q=zzzznonexistent");

    expect(res.status).toBe(200);
    expect(res.body.apps).toEqual([]);
  });
});

describe("GET /apps/:appId/reputation", () => {
  it("returns reputation breakdown", async () => {
    const res = await request.get("/apps/p2p-chess/reputation");

    expect(res.status).toBe(200);
    expect(res.body.appId).toBe("p2p-chess");
    expect(typeof res.body.score).toBe("number");
    expect(res.body.components).toHaveProperty("uptimeReliability");
    expect(res.body.components).toHaveProperty("profileCompleteness");
    expect(res.body.components).toHaveProperty("taskSuccessRate");
    expect(res.body.components).toHaveProperty("activityLevel");
    expect(typeof res.body.tasksCompleted).toBe("number");
    expect(typeof res.body.tasksFailed).toBe("number");
    expect(typeof res.body.totalInteractions).toBe("number");
  });

  it("returns 404 for unknown app", async () => {
    const res = await request.get("/apps/nonexistent/reputation");
    expect(res.status).toBe(404);
  });
});

describe("heartbeat piggybacking for coordinated apps", () => {
  it("refreshes coordinated app on agent heartbeat", async () => {
    // coordinatorAddress was registered in "coordinator agent setup" above
    const payload = await signedHeartbeat({
      address: coordinatorAddress,
      _account: coordinatorAccount,
      telemetry: { tasksCompleted: 3, tasksFailed: 0 },
    });

    const hbRes = await request.post("/agents/heartbeat").send(payload);
    expect(hbRes.status).toBe(200);

    // Verify the coordinated app was refreshed
    const appRes = await request.get("/apps/reef-news");
    expect(appRes.status).toBe(200);
    expect(appRes.body.availability).toBe("available");
    expect(appRes.body.tasksCompleted).toBe(3);
    expect(appRes.body.totalInteractions).toBe(3);
  });

  it("does not piggyback on unrelated agent heartbeat", async () => {
    // testAddress is not a coordinator — p2p-chess should be unaffected
    const before = await request.get("/apps/p2p-chess");

    const payload = await signedHeartbeat({
      telemetry: { tasksCompleted: 10, tasksFailed: 0 },
    });
    await request.post("/agents/heartbeat").send(payload);

    const after = await request.get("/apps/p2p-chess");
    expect(after.body.tasksCompleted).toBe(before.body.tasksCompleted);
  });
});

describe("app ownership", () => {
  it("allows owner to update their app", async () => {
    const res = await request.post("/apps/register").send({
      address: "0xAppOwner1",
      appId: "p2p-chess",
      manifest: makeManifest({
        appId: "p2p-chess",
        name: "P2P Chess Updated",
        minParticipants: 2,
      }),
    });
    // Accept 200 or 429 (rate-limited)
    expect([200, 429]).toContain(res.status);
  });

  it("rejects update from different address with 403", async () => {
    const res = await request.post("/apps/register").send({
      address: "0xIntruder",
      appId: "p2p-chess",
      manifest: makeManifest({ appId: "p2p-chess", name: "Hijacked" }),
    });
    expect([403, 429]).toContain(res.status);
  });

  it("includes registeredBy in app profile", async () => {
    const res = await request.get("/apps/p2p-chess");
    expect(res.status).toBe(200);
    expect(res.body.registeredBy).toBe("0xAppOwner1");
  });

  it("includes registeredBy in search results", async () => {
    const res = await request.get("/apps/search?q=Chess");
    expect(res.status).toBe(200);
    const chess = res.body.apps.find(
      (a: { appId: string }) => a.appId === "p2p-chess",
    );
    expect(chess).toBeTruthy();
    expect(chess.registeredBy).toBe("0xAppOwner1");
  });
});
