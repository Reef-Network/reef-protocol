import { describe, it, expect } from "vitest";
import {
  partSchema,
  a2aMessageSchema,
  taskStatusSchema,
  taskSchema,
  artifactSchema,
  agentSkillSchema,
  agentCardSchema,
  registerPayloadSchema,
  heartbeatPayloadSchema,
  contactSchema,
  validateRegistration,
  appActionSchema,
  appManifestSchema,
  appRegisterPayloadSchema,
  validateAppRegistration,
  buildAppActionDataPart,
  buildAppAction,
  buildAppManifest,
  extractAppAction,
  compareManifests,
} from "../index.js";

describe("partSchema", () => {
  it("validates a text part", () => {
    const result = partSchema.parse({ kind: "text", text: "hello" });
    expect(result.kind).toBe("text");
  });

  it("validates a data part", () => {
    const result = partSchema.parse({
      kind: "data",
      data: { key: "value" },
    });
    expect(result.kind).toBe("data");
  });

  it("validates a file part with bytes", () => {
    const result = partSchema.parse({
      kind: "file",
      file: { bytes: "base64data", mimeType: "text/plain" },
    });
    expect(result.kind).toBe("file");
  });

  it("validates a file part with uri", () => {
    const result = partSchema.parse({
      kind: "file",
      file: { uri: "https://example.com/file.txt" },
    });
    expect(result.kind).toBe("file");
  });

  it("rejects invalid kind", () => {
    expect(() => partSchema.parse({ kind: "invalid", text: "x" })).toThrow();
  });
});

describe("a2aMessageSchema", () => {
  it("validates a valid message", () => {
    const result = a2aMessageSchema.parse({
      kind: "message",
      messageId: "msg-1",
      role: "user",
      parts: [{ kind: "text", text: "Hello" }],
    });
    expect(result.role).toBe("user");
    expect(result.parts).toHaveLength(1);
  });

  it("rejects message without parts", () => {
    expect(() =>
      a2aMessageSchema.parse({
        kind: "message",
        messageId: "msg-1",
        role: "user",
        parts: [],
      }),
    ).toThrow();
  });

  it("rejects invalid role", () => {
    expect(() =>
      a2aMessageSchema.parse({
        kind: "message",
        messageId: "msg-1",
        role: "system",
        parts: [{ kind: "text", text: "Hello" }],
      }),
    ).toThrow();
  });
});

describe("taskStatusSchema", () => {
  it("validates a valid status", () => {
    const result = taskStatusSchema.parse({ state: "submitted" });
    expect(result.state).toBe("submitted");
  });

  it("validates all task states", () => {
    const states = [
      "submitted",
      "working",
      "input-required",
      "completed",
      "canceled",
      "failed",
      "rejected",
      "auth-required",
      "unknown",
    ];
    for (const state of states) {
      expect(taskStatusSchema.parse({ state }).state).toBe(state);
    }
  });

  it("rejects invalid state", () => {
    expect(() => taskStatusSchema.parse({ state: "pending" })).toThrow();
  });
});

describe("artifactSchema", () => {
  it("validates a valid artifact", () => {
    const result = artifactSchema.parse({
      artifactId: "art-1",
      parts: [{ kind: "text", text: "output" }],
    });
    expect(result.artifactId).toBe("art-1");
  });
});

describe("taskSchema", () => {
  it("validates a valid task", () => {
    const result = taskSchema.parse({
      kind: "task",
      id: "task-1",
      contextId: "ctx-1",
      status: { state: "working" },
    });
    expect(result.id).toBe("task-1");
    expect(result.status.state).toBe("working");
  });

  it("validates a task with artifacts", () => {
    const result = taskSchema.parse({
      kind: "task",
      id: "task-2",
      contextId: "ctx-2",
      status: { state: "completed" },
      artifacts: [
        {
          artifactId: "art-1",
          parts: [{ kind: "text", text: "result" }],
        },
      ],
    });
    expect(result.artifacts).toHaveLength(1);
  });
});

describe("agentSkillSchema", () => {
  it("validates a valid skill", () => {
    const result = agentSkillSchema.parse({
      id: "chess",
      name: "Chess",
      description: "Play chess",
      tags: ["game", "strategy"],
    });
    expect(result.id).toBe("chess");
    expect(result.tags).toEqual(["game", "strategy"]);
  });

  it("rejects skill without id", () => {
    expect(() =>
      agentSkillSchema.parse({
        name: "Chess",
        description: "Play chess",
        tags: [],
      }),
    ).toThrow();
  });
});

describe("agentCardSchema", () => {
  const validCard = {
    name: "Test Agent",
    description: "A test agent",
    url: "xmtp://0xabc123",
    version: "0.2.0",
    protocolVersion: "0.3.0",
    skills: [
      { id: "echo", name: "Echo", description: "Echo messages", tags: [] },
    ],
    capabilities: { streaming: false },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
  };

  it("validates a valid agent card", () => {
    const result = agentCardSchema.parse(validCard);
    expect(result.name).toBe("Test Agent");
    expect(result.skills).toHaveLength(1);
  });

  it("rejects card without name", () => {
    const { name: _, ...noName } = validCard;
    expect(() => agentCardSchema.parse(noName)).toThrow();
  });

  it("rejects card without skills", () => {
    const { skills: _, ...noSkills } = validCard;
    expect(() => agentCardSchema.parse(noSkills)).toThrow();
  });
});

describe("registerPayloadSchema", () => {
  const validPayload = {
    address: "0xabc123",
    agentCard: {
      name: "Test Agent",
      description: "A test agent",
      url: "xmtp://0xabc123",
      version: "0.2.0",
      protocolVersion: "0.3.0",
      skills: [],
      capabilities: {},
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain"],
    },
  };

  it("validates a valid registration payload", () => {
    const result = registerPayloadSchema.parse(validPayload);
    expect(result.address).toBe("0xabc123");
    expect(result.agentCard.name).toBe("Test Agent");
  });

  it("rejects missing address", () => {
    const { address: _, ...noAddr } = validPayload;
    expect(() => registerPayloadSchema.parse(noAddr)).toThrow();
  });

  it("rejects missing agentCard", () => {
    expect(() =>
      registerPayloadSchema.parse({ address: "0xabc123" }),
    ).toThrow();
  });
});

describe("validateRegistration", () => {
  it("returns parsed data for valid input", () => {
    const result = validateRegistration({
      address: "0xabc123",
      agentCard: {
        name: "Agent",
        description: "Desc",
        url: "xmtp://0xabc123",
        version: "0.2.0",
        protocolVersion: "0.3.0",
        skills: [],
        capabilities: {},
        defaultInputModes: ["text/plain"],
        defaultOutputModes: ["text/plain"],
      },
    });
    expect(result.address).toBe("0xabc123");
  });

  it("throws for invalid input", () => {
    expect(() => validateRegistration({})).toThrow();
  });
});

describe("heartbeatPayloadSchema", () => {
  it("validates a heartbeat with address", () => {
    const result = heartbeatPayloadSchema.parse({ address: "0xabc" });
    expect(result.address).toBe("0xabc");
  });

  it("validates a heartbeat with telemetry", () => {
    const result = heartbeatPayloadSchema.parse({
      address: "0xabc",
      telemetry: { messagesHandled: 10, uptime: 3600 },
    });
    expect(result.telemetry?.messagesHandled).toBe(10);
  });

  it("rejects missing address", () => {
    expect(() => heartbeatPayloadSchema.parse({})).toThrow();
  });

  it("validates a heartbeat with country", () => {
    const result = heartbeatPayloadSchema.parse({
      address: "0xabc",
      telemetry: { country: "no" },
    });
    expect(result.telemetry?.country).toBe("NO");
  });

  it("rejects country with wrong length", () => {
    expect(() =>
      heartbeatPayloadSchema.parse({
        address: "0xabc",
        telemetry: { country: "NOR" },
      }),
    ).toThrow();
  });
});

describe("contactSchema", () => {
  it("validates a contact", () => {
    const result = contactSchema.parse({
      name: "Alice",
      address: "0xabc",
      addedAt: "2026-01-01T00:00:00Z",
      trusted: true,
    });
    expect(result.trusted).toBe(true);
  });
});

describe("appActionSchema", () => {
  it("validates a valid action", () => {
    const result = appActionSchema.parse({
      id: "move",
      name: "Make Move",
      description: "Submit a chess move",
    });
    expect(result.id).toBe("move");
  });

  it("accepts optional inputSchema and roles", () => {
    const result = appActionSchema.parse({
      id: "submit",
      name: "Submit",
      description: "Submit content",
      inputSchema: { type: "object" },
      roles: ["contributor"],
    });
    expect(result.roles).toEqual(["contributor"]);
  });
});

describe("appManifestSchema", () => {
  it("validates a valid P2P manifest", () => {
    const result = appManifestSchema.parse({
      appId: "chess",
      name: "P2P Chess",
      description: "Play chess over A2A",
      version: "0.1.0",
      actions: [{ id: "move", name: "Move", description: "Make a move" }],
      minParticipants: 2,
      maxParticipants: 2,
    });
    expect(result.appId).toBe("chess");
    expect(result.coordinatorAddress).toBeUndefined();
  });

  it("validates a coordinated manifest", () => {
    const result = appManifestSchema.parse({
      appId: "reef-news",
      name: "Reef News",
      description: "Decentralized news aggregator",
      version: "0.1.0",
      category: "social",
      coordinatorAddress: "0xCoordinator",
      actions: [
        {
          id: "submit",
          name: "Submit Article",
          description: "Submit a news article",
        },
        {
          id: "get-feed",
          name: "Get Feed",
          description: "Get latest articles",
        },
      ],
      minParticipants: 1,
    });
    expect(result.coordinatorAddress).toBe("0xCoordinator");
    expect(result.category).toBe("social");
  });

  it("rejects uppercase appId", () => {
    expect(() =>
      appManifestSchema.parse({
        appId: "Chess",
        name: "Chess",
        description: "test",
        version: "0.1.0",
        actions: [],
        minParticipants: 2,
      }),
    ).toThrow();
  });

  it("rejects appId with spaces", () => {
    expect(() =>
      appManifestSchema.parse({
        appId: "my app",
        name: "My App",
        description: "test",
        version: "0.1.0",
        actions: [],
        minParticipants: 1,
      }),
    ).toThrow();
  });

  it("accepts appId with hyphens and numbers", () => {
    const result = appManifestSchema.parse({
      appId: "my-app-2",
      name: "My App",
      description: "test",
      version: "0.1.0",
      actions: [],
      minParticipants: 1,
    });
    expect(result.appId).toBe("my-app-2");
  });
});

describe("appRegisterPayloadSchema", () => {
  it("validates a registration payload with address", () => {
    const result = validateAppRegistration({
      address: "0xOwner",
      appId: "chess",
      manifest: {
        appId: "chess",
        name: "Chess",
        description: "Play chess",
        version: "0.1.0",
        actions: [{ id: "move", name: "Move", description: "Make a move" }],
        minParticipants: 2,
      },
    });
    expect(result.appId).toBe("chess");
    expect(result.address).toBe("0xOwner");
  });

  it("rejects missing address", () => {
    expect(() =>
      appRegisterPayloadSchema.parse({
        appId: "chess",
        manifest: {
          appId: "chess",
          name: "Chess",
          description: "Play chess",
          version: "0.1.0",
          actions: [],
          minParticipants: 2,
        },
      }),
    ).toThrow();
  });

  it("rejects missing manifest", () => {
    expect(() =>
      appRegisterPayloadSchema.parse({ address: "0xOwner", appId: "chess" }),
    ).toThrow();
  });
});

describe("buildAppActionDataPart", () => {
  it("builds a data part with appId and action", () => {
    const part = buildAppActionDataPart("chess", "move", {
      from: "e2",
      to: "e4",
    });
    expect(part.kind).toBe("data");
    expect(part.data.appId).toBe("chess");
    expect(part.data.action).toBe("move");
    expect(part.data.payload).toEqual({ from: "e2", to: "e4" });
  });

  it("defaults payload to empty object", () => {
    const part = buildAppActionDataPart("chess", "resign");
    expect(part.data.payload).toEqual({});
  });
});

describe("extractAppAction", () => {
  it("extracts appId and action from a DataPart", () => {
    const part = {
      kind: "data" as const,
      data: { appId: "chess", action: "move", payload: { from: "e2" } },
    };
    const result = extractAppAction(part);
    expect(result).toEqual({
      appId: "chess",
      action: "move",
      payload: { from: "e2" },
    });
  });

  it("returns null for DataParts without appId", () => {
    const part = { kind: "data" as const, data: { key: "value" } };
    const result = extractAppAction(part);
    expect(result).toBeNull();
  });

  it("returns null for DataParts without action", () => {
    const part = { kind: "data" as const, data: { appId: "chess" } };
    const result = extractAppAction(part);
    expect(result).toBeNull();
  });
});

describe("compareManifests", () => {
  const baseManifest = buildAppManifest(
    "chess",
    "Chess",
    "Play chess",
    [buildAppAction("move", "Move", "Make a move")],
    { version: "0.1.0", minParticipants: 2, maxParticipants: 2 },
  );

  it("reports compatible for identical manifests", () => {
    const result = compareManifests(baseManifest, { ...baseManifest });
    expect(result.compatible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("detects version mismatch", () => {
    const other = { ...baseManifest, version: "0.2.0" };
    const result = compareManifests(baseManifest, other);
    expect(result.compatible).toBe(false);
    expect(result.reasons[0]).toContain("version mismatch");
  });

  it("detects action mismatch", () => {
    const other = {
      ...baseManifest,
      actions: [
        buildAppAction("move", "Move", "Make a move"),
        buildAppAction("resign", "Resign", "Resign"),
      ],
    };
    const result = compareManifests(baseManifest, other);
    expect(result.compatible).toBe(false);
    expect(result.reasons[0]).toContain("actions mismatch");
  });

  it("detects minParticipants mismatch", () => {
    const other = { ...baseManifest, minParticipants: 1 };
    const result = compareManifests(baseManifest, other);
    expect(result.compatible).toBe(false);
    expect(result.reasons[0]).toContain("minParticipants mismatch");
  });

  it("detects appId mismatch", () => {
    const other = { ...baseManifest, appId: "checkers" };
    const result = compareManifests(baseManifest, other);
    expect(result.compatible).toBe(false);
    expect(result.reasons[0]).toContain("appId mismatch");
  });
});
