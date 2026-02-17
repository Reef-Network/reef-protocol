import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleA2AMessage, type AgentLogicHandler } from "../handler.js";
import type { Task } from "@a2a-js/sdk";
import type { Agent } from "@xmtp/agent-sdk";
import { encodeA2AMessage } from "@reef-protocol/protocol";

// Mock XMTP agent
function createMockAgent() {
  const sentMessages: { address: string; text: string }[] = [];
  const mockDm = {
    sendText: vi.fn(async (text: string) => {
      sentMessages.push({ address: "", text });
    }),
  };
  return {
    agent: {
      createDmWithAddress: vi.fn(async (addr: string) => {
        mockDm.sendText = vi.fn(async (text: string) => {
          sentMessages.push({ address: addr, text });
        });
        return mockDm;
      }),
    } as unknown as Agent,
    sentMessages,
  };
}

// Mock TaskStore
function createMockTaskStore() {
  const tasks = new Map<string, Task>();
  return {
    store: {
      async load(taskId: string) {
        return tasks.get(taskId);
      },
      async save(task: Task) {
        tasks.set(task.id, task);
      },
    },
    tasks,
  };
}

// Default logic handler that echoes back
function createTestLogicHandler(): AgentLogicHandler {
  return {
    async handleMessage(_msg): Promise<Task> {
      return {
        kind: "task",
        id: "task-1",
        contextId: "ctx-1",
        status: {
          state: "completed",
          message: {
            kind: "message",
            messageId: "reply-1",
            role: "agent",
            parts: [{ kind: "text", text: "Echo" }],
          },
          timestamp: new Date().toISOString(),
        },
      };
    },
  };
}

describe("handleA2AMessage", () => {
  let mockAgent: ReturnType<typeof createMockAgent>;
  let mockTaskStore: ReturnType<typeof createMockTaskStore>;
  let logicHandler: AgentLogicHandler;

  beforeEach(() => {
    mockAgent = createMockAgent();
    mockTaskStore = createMockTaskStore();
    logicHandler = createTestLogicHandler();
  });

  it("handles message/send request", async () => {
    const raw = encodeA2AMessage({
      jsonrpc: "2.0",
      id: "req-1",
      method: "message/send",
      params: {
        message: {
          kind: "message",
          messageId: "msg-1",
          role: "user",
          parts: [{ kind: "text", text: "Hello" }],
        },
      },
    });

    await handleA2AMessage(
      raw,
      "0xSender",
      mockAgent.agent,
      mockTaskStore.store,
      logicHandler,
    );

    // Should have sent a response
    expect(mockAgent.sentMessages).toHaveLength(1);
    const response = JSON.parse(mockAgent.sentMessages[0].text);
    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe("req-1");
    expect(response.result.kind).toBe("task");

    // Should have stored the task
    expect(mockTaskStore.tasks.has("task-1")).toBe(true);
  });

  it("handles tasks/get request", async () => {
    // Pre-store a task
    const task: Task = {
      kind: "task",
      id: "existing-task",
      contextId: "ctx-1",
      status: { state: "working" },
    };
    await mockTaskStore.store.save(task);

    const raw = encodeA2AMessage({
      jsonrpc: "2.0",
      id: "req-2",
      method: "tasks/get",
      params: { id: "existing-task" },
    });

    await handleA2AMessage(
      raw,
      "0xSender",
      mockAgent.agent,
      mockTaskStore.store,
      logicHandler,
    );

    expect(mockAgent.sentMessages).toHaveLength(1);
    const response = JSON.parse(mockAgent.sentMessages[0].text);
    expect(response.result.id).toBe("existing-task");
    expect(response.result.status.state).toBe("working");
  });

  it("returns error for tasks/get with unknown task", async () => {
    const raw = encodeA2AMessage({
      jsonrpc: "2.0",
      id: "req-3",
      method: "tasks/get",
      params: { id: "nonexistent" },
    });

    await handleA2AMessage(
      raw,
      "0xSender",
      mockAgent.agent,
      mockTaskStore.store,
      logicHandler,
    );

    expect(mockAgent.sentMessages).toHaveLength(1);
    const response = JSON.parse(mockAgent.sentMessages[0].text);
    expect(response.error.code).toBe(-32001);
    expect(response.error.message).toBe("Task not found");
  });

  it("handles tasks/cancel when supported", async () => {
    const canceledTask: Task = {
      kind: "task",
      id: "task-to-cancel",
      contextId: "ctx-1",
      status: { state: "canceled" },
    };

    logicHandler.cancelTask = vi.fn(async () => canceledTask);

    const raw = encodeA2AMessage({
      jsonrpc: "2.0",
      id: "req-4",
      method: "tasks/cancel",
      params: { id: "task-to-cancel" },
    });

    await handleA2AMessage(
      raw,
      "0xSender",
      mockAgent.agent,
      mockTaskStore.store,
      logicHandler,
    );

    expect(mockAgent.sentMessages).toHaveLength(1);
    const response = JSON.parse(mockAgent.sentMessages[0].text);
    expect(response.result.status.state).toBe("canceled");
    expect(logicHandler.cancelTask).toHaveBeenCalledWith("task-to-cancel");
  });

  it("returns error for tasks/cancel when not supported", async () => {
    // logicHandler.cancelTask is undefined by default from createTestLogicHandler

    const raw = encodeA2AMessage({
      jsonrpc: "2.0",
      id: "req-5",
      method: "tasks/cancel",
      params: { id: "task-1" },
    });

    await handleA2AMessage(
      raw,
      "0xSender",
      mockAgent.agent,
      mockTaskStore.store,
      logicHandler,
    );

    expect(mockAgent.sentMessages).toHaveLength(1);
    const response = JSON.parse(mockAgent.sentMessages[0].text);
    expect(response.error.code).toBe(-32004);
  });

  it("returns method not found for unknown methods", async () => {
    const raw = encodeA2AMessage({
      jsonrpc: "2.0",
      id: "req-6",
      method: "unknown/method",
      params: {},
    });

    await handleA2AMessage(
      raw,
      "0xSender",
      mockAgent.agent,
      mockTaskStore.store,
      logicHandler,
    );

    expect(mockAgent.sentMessages).toHaveLength(1);
    const response = JSON.parse(mockAgent.sentMessages[0].text);
    expect(response.error.code).toBe(-32601);
  });

  it("logs plain text messages without responding", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handleA2AMessage(
      "Hello, this is plain text",
      "0xSender",
      mockAgent.agent,
      mockTaskStore.store,
      logicHandler,
    );

    expect(mockAgent.sentMessages).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("(plain)"));

    consoleSpy.mockRestore();
  });

  it("logs JSON-RPC responses without responding", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const raw = encodeA2AMessage({
      jsonrpc: "2.0",
      id: "resp-1",
      result: { kind: "task", id: "t1" },
    });

    await handleA2AMessage(
      raw,
      "0xSender",
      mockAgent.agent,
      mockTaskStore.store,
      logicHandler,
    );

    expect(mockAgent.sentMessages).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Response from"),
      expect.anything(),
    );

    consoleSpy.mockRestore();
  });
});
