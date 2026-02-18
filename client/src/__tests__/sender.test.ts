import { describe, it, expect, vi } from "vitest";
import type { Agent } from "@xmtp/agent-sdk";
import {
  sendTextMessage,
  sendGetTaskRequest,
  sendCancelTaskRequest,
  sendTextMessageToGroup,
  sendRawToConversation,
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

describe("sendTextMessageToGroup", () => {
  it("sends a message/send request to a group conversation", async () => {
    const groupMessages: string[] = [];
    const mockGroup = {
      sendText: vi.fn(async (text: string) => {
        groupMessages.push(text);
      }),
    };

    const agent = {
      client: {
        conversations: {
          getConversationById: vi.fn(async () => mockGroup),
        },
      },
    } as unknown as Agent;

    await sendTextMessageToGroup(agent, "group-1", "Hello group!");

    expect(groupMessages).toHaveLength(1);
    const parsed = JSON.parse(groupMessages[0]);
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.method).toBe("message/send");
    expect(parsed.params.message.parts[0].text).toBe("Hello group!");
  });

  it("throws if group not found", async () => {
    const agent = {
      client: {
        conversations: {
          getConversationById: vi.fn(async () => undefined),
        },
      },
    } as unknown as Agent;

    await expect(
      sendTextMessageToGroup(agent, "nonexistent", "Hello"),
    ).rejects.toThrow("Group not found");
  });
});

describe("sendRawToConversation", () => {
  it("sends encoded payload to any conversation", async () => {
    const messages: string[] = [];
    const mockConversation = {
      sendText: vi.fn(async (text: string) => {
        messages.push(text);
      }),
    };

    await sendRawToConversation(mockConversation as never, {
      jsonrpc: "2.0",
      id: "test-1",
      method: "tasks/get",
      params: { id: "t1" },
    });

    expect(messages).toHaveLength(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.method).toBe("tasks/get");
  });
});
