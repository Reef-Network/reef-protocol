import { describe, it, expect } from "vitest";
import { encodeEnvelope, decodeEnvelope, REEF_VERSION } from "../index.js";

describe("envelope", () => {
  it("encodes and decodes a text message", () => {
    const json = encodeEnvelope("text", "0xabc123", {
      text: "Hello, Reef!",
    });

    const envelope = decodeEnvelope(json);

    expect(envelope.reef).toBe(REEF_VERSION);
    expect(envelope.type).toBe("text");
    expect(envelope.from).toBe("0xabc123");
    expect(envelope.payload).toEqual({ text: "Hello, Reef!" });
    expect(envelope.ts).toBeDefined();
  });

  it("encodes and decodes a ping message", () => {
    const json = encodeEnvelope("ping", "0xdef456", null);
    const envelope = decodeEnvelope(json);

    expect(envelope.type).toBe("ping");
    expect(envelope.from).toBe("0xdef456");
  });

  it("encodes and decodes a pong message", () => {
    const json = encodeEnvelope("pong", "0xdef456", {
      originalTs: "2026-01-01T00:00:00Z",
    });
    const envelope = decodeEnvelope(json);

    expect(envelope.type).toBe("pong");
    expect((envelope.payload as { originalTs: string }).originalTs).toBe(
      "2026-01-01T00:00:00Z",
    );
  });

  it("encodes and decodes a profile message", () => {
    const json = encodeEnvelope("profile", "0x123", {
      name: "TestAgent",
      bio: "A test agent",
      skills: ["testing", "validation"],
    });
    const envelope = decodeEnvelope(json);

    expect(envelope.type).toBe("profile");
    const payload = envelope.payload as {
      name: string;
      skills: string[];
    };
    expect(payload.name).toBe("TestAgent");
    expect(payload.skills).toEqual(["testing", "validation"]);
  });

  it("encodes and decodes skill_request", () => {
    const json = encodeEnvelope("skill_request", "0x111", {
      skill: "calendar",
      input: { date: "2026-03-01" },
      requestId: "req-001",
    });
    const envelope = decodeEnvelope(json);
    expect(envelope.type).toBe("skill_request");
  });

  it("sets reef version and timestamp automatically", () => {
    const before = Date.now();
    const json = encodeEnvelope("text", "0xaaa", { text: "test" });
    const envelope = decodeEnvelope(json);

    expect(envelope.reef).toBe("0.1.0");
    const ts = new Date(envelope.ts).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now());
  });

  it("throws on invalid JSON", () => {
    expect(() => decodeEnvelope("not json")).toThrow();
  });

  it("throws on missing required fields", () => {
    expect(() => decodeEnvelope(JSON.stringify({ reef: "0.1.0" }))).toThrow();
  });

  it("throws on invalid message type", () => {
    expect(() =>
      decodeEnvelope(
        JSON.stringify({
          reef: "0.1.0",
          type: "invalid_type",
          from: "0xabc",
          payload: null,
          ts: new Date().toISOString(),
        }),
      ),
    ).toThrow();
  });

  it("throws on empty from field", () => {
    expect(() =>
      decodeEnvelope(
        JSON.stringify({
          reef: "0.1.0",
          type: "text",
          from: "",
          payload: null,
          ts: new Date().toISOString(),
        }),
      ),
    ).toThrow();
  });
});
