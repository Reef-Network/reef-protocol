import { describe, it, expect, vi } from "vitest";
import type { Agent } from "@xmtp/agent-sdk";
import {
  sendTextMessage,
  sendGetTaskRequest,
  sendCancelTaskRequest,
} from "../sender.js";

function createMockAgent() {
  const sentMessages: { address: string; text: string }[] = [];
  return {
    agent: {
      createDmWithAddress: vi.fn(async (addr: string) => ({
        sendText: vi.fn(async (text: string) => {
          sentMessages.push({ address: addr, text });
        }),
      })),
    } as unknown as Agent,
    sentMessages,
  };
}

describe("sendTextMessage", () => {
  it("sends a message/send JSON-RPC request", async () => {
    const { agent, sentMessages } = createMockAgent();

    await sendTextMessage(agent, "0xRecipient", "Hello!");

    expect(sentMessages).toHaveLength(1);
    const parsed = JSON.parse(sentMessages[0].text);
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.method).toBe("message/send");
    expect(parsed.params.message.parts[0].kind).toBe("text");
    expect(parsed.params.message.parts[0].text).toBe("Hello!");
    expect(parsed.params.message.role).toBe("user");
  });

  it("includes contextId when provided", async () => {
    const { agent, sentMessages } = createMockAgent();

    await sendTextMessage(agent, "0xRecipient", "Hello!", {
      contextId: "ctx-123",
    });

    const parsed = JSON.parse(sentMessages[0].text);
    expect(parsed.params.message.contextId).toBe("ctx-123");
  });
});

describe("sendGetTaskRequest", () => {
  it("sends a tasks/get JSON-RPC request", async () => {
    const { agent, sentMessages } = createMockAgent();

    await sendGetTaskRequest(agent, "0xRecipient", "task-42");

    expect(sentMessages).toHaveLength(1);
    const parsed = JSON.parse(sentMessages[0].text);
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.method).toBe("tasks/get");
    expect(parsed.params.id).toBe("task-42");
  });
});

describe("sendCancelTaskRequest", () => {
  it("sends a tasks/cancel JSON-RPC request", async () => {
    const { agent, sentMessages } = createMockAgent();

    await sendCancelTaskRequest(agent, "0xRecipient", "task-99");

    expect(sentMessages).toHaveLength(1);
    const parsed = JSON.parse(sentMessages[0].text);
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.method).toBe("tasks/cancel");
    expect(parsed.params.id).toBe("task-99");
  });
});
