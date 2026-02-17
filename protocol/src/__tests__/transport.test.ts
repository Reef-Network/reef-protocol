import { describe, it, expect } from "vitest";
import {
  encodeA2AMessage,
  decodeA2AMessage,
  isA2ARequest,
  isA2AResponse,
} from "../index.js";

describe("encodeA2AMessage", () => {
  it("serializes an object to JSON string", () => {
    const msg = {
      jsonrpc: "2.0" as const,
      id: "1",
      method: "message/send",
      params: {},
    };
    const encoded = encodeA2AMessage(msg);
    expect(JSON.parse(encoded)).toEqual(msg);
  });
});

describe("decodeA2AMessage", () => {
  it("decodes valid JSON-RPC 2.0 messages", () => {
    const raw = JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "message/send",
      params: { message: {} },
    });
    const result = decodeA2AMessage(raw);
    expect(result).not.toBeNull();
    expect(result!.jsonrpc).toBe("2.0");
    expect(result!.method).toBe("message/send");
  });

  it("returns null for invalid JSON", () => {
    expect(decodeA2AMessage("not json")).toBeNull();
  });

  it("returns null for non-JSON-RPC objects", () => {
    expect(decodeA2AMessage(JSON.stringify({ foo: "bar" }))).toBeNull();
  });

  it("returns null for JSON-RPC 1.0 messages", () => {
    expect(
      decodeA2AMessage(JSON.stringify({ jsonrpc: "1.0", method: "test" })),
    ).toBeNull();
  });

  it("returns null for primitive JSON values", () => {
    expect(decodeA2AMessage("42")).toBeNull();
    expect(decodeA2AMessage('"hello"')).toBeNull();
    expect(decodeA2AMessage("null")).toBeNull();
  });

  it("round-trips with encodeA2AMessage", () => {
    const original = {
      jsonrpc: "2.0" as const,
      id: "test-1",
      method: "tasks/get",
      params: { id: "task-123" },
    };
    const encoded = encodeA2AMessage(original);
    const decoded = decodeA2AMessage(encoded);
    expect(decoded).toEqual(original);
  });
});

describe("isA2ARequest", () => {
  it("returns true for objects with method field", () => {
    expect(
      isA2ARequest({ jsonrpc: "2.0", id: "1", method: "message/send" }),
    ).toBe(true);
  });

  it("returns false for objects without method field", () => {
    expect(
      isA2ARequest({ jsonrpc: "2.0", id: "1", result: { kind: "task" } }),
    ).toBe(false);
  });
});

describe("isA2AResponse", () => {
  it("returns true for objects with result field", () => {
    expect(
      isA2AResponse({ jsonrpc: "2.0", id: "1", result: { kind: "task" } }),
    ).toBe(true);
  });

  it("returns true for objects with error field", () => {
    expect(
      isA2AResponse({
        jsonrpc: "2.0",
        id: "1",
        error: { code: -32600, message: "Invalid" },
      }),
    ).toBe(true);
  });

  it("returns false for request objects", () => {
    expect(
      isA2AResponse({ jsonrpc: "2.0", id: "1", method: "message/send" }),
    ).toBe(false);
  });
});
