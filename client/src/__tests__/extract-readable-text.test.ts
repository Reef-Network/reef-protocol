import { describe, it, expect } from "vitest";
import {
  encodeA2AMessage,
  textPart,
  createMessage,
  createSendMessageRequest,
} from "@reef-protocol/protocol";
import { extractReadableText } from "../commands/messages.js";

describe("extractReadableText", () => {
  it("returns plain text as-is", () => {
    expect(extractReadableText("Hello world")).toBe("Hello world");
  });

  it("returns non-JSON strings as-is", () => {
    expect(extractReadableText("not { json")).toBe("not { json");
  });

  it("extracts text from a message/send request", () => {
    const msg = createMessage("user", [textPart("Hello from Reef!")]);
    const request = createSendMessageRequest(msg);
    const encoded = encodeA2AMessage(
      request as unknown as Record<string, unknown>,
    );

    expect(extractReadableText(encoded)).toBe("Hello from Reef!");
  });

  it("extracts text from multi-part message/send", () => {
    const msg = createMessage("user", [
      textPart("Part one"),
      textPart("Part two"),
    ]);
    const request = createSendMessageRequest(msg);
    const encoded = encodeA2AMessage(
      request as unknown as Record<string, unknown>,
    );

    expect(extractReadableText(encoded)).toBe("Part one\nPart two");
  });

  it("extracts app-action from data parts", () => {
    const encoded = encodeA2AMessage({
      jsonrpc: "2.0",
      id: "req-1",
      method: "message/send",
      params: {
        message: {
          kind: "message",
          messageId: "m1",
          role: "user",
          parts: [
            {
              kind: "data",
              data: {
                appId: "tic-tac-toe",
                action: "move",
                payload: { position: 4, mark: "X" },
              },
            },
          ],
        },
      },
    });

    expect(extractReadableText(encoded)).toBe(
      '[app-action] tic-tac-toe/move: {"position":4,"mark":"X"}',
    );
  });

  it("extracts text from A2A response (task result)", () => {
    const encoded = encodeA2AMessage({
      jsonrpc: "2.0",
      id: "req-1",
      result: {
        id: "task-1",
        status: {
          state: "completed",
          message: {
            kind: "message",
            messageId: "m1",
            role: "agent",
            parts: [{ kind: "text", text: "Task done!" }],
          },
        },
      },
    });

    expect(extractReadableText(encoded)).toBe("Task done!");
  });

  it("returns raw string for unrecognized A2A structure", () => {
    const encoded = encodeA2AMessage({
      jsonrpc: "2.0",
      id: "req-1",
      method: "tasks/get",
      params: { id: "task-1" },
    });

    expect(extractReadableText(encoded)).toBe(encoded);
  });

  it("returns raw string for message/send with no parts", () => {
    const encoded = encodeA2AMessage({
      jsonrpc: "2.0",
      id: "req-1",
      method: "message/send",
      params: {
        message: {
          kind: "message",
          messageId: "m1",
          role: "user",
          parts: [],
        },
      },
    });

    expect(extractReadableText(encoded)).toBe(encoded);
  });
});
