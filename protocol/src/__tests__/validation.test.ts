import { describe, it, expect } from "vitest";
import {
  validateEnvelope,
  validateProfile,
  textPayloadSchema,
  pongPayloadSchema,
  profilePayloadSchema,
  contactSchema,
} from "../index.js";

describe("validateEnvelope", () => {
  it("validates a well-formed envelope", () => {
    const result = validateEnvelope({
      reef: "0.1.0",
      type: "text",
      from: "0xabc123",
      payload: { text: "Hello" },
      ts: "2026-01-01T00:00:00Z",
    });

    expect(result.type).toBe("text");
    expect(result.from).toBe("0xabc123");
  });

  it("rejects an envelope with missing type", () => {
    expect(() =>
      validateEnvelope({
        reef: "0.1.0",
        from: "0xabc",
        payload: null,
        ts: "2026-01-01T00:00:00Z",
      }),
    ).toThrow();
  });
});

describe("validateProfile", () => {
  it("validates a valid registration payload", () => {
    const result = validateProfile({
      address: "0xabc123",
      name: "TestAgent",
      bio: "A helpful agent",
      skills: ["testing"],
    });

    expect(result.address).toBe("0xabc123");
    expect(result.name).toBe("TestAgent");
  });

  it("rejects a profile with missing address", () => {
    expect(() => validateProfile({ name: "TestAgent" })).toThrow();
  });

  it("rejects a profile with missing name", () => {
    expect(() => validateProfile({ address: "0xabc" })).toThrow();
  });

  it("rejects a profile with name exceeding 128 chars", () => {
    expect(() =>
      validateProfile({
        address: "0xabc",
        name: "a".repeat(129),
      }),
    ).toThrow();
  });
});

describe("payload schemas", () => {
  it("validates text payload", () => {
    const result = textPayloadSchema.parse({ text: "hello" });
    expect(result.text).toBe("hello");
  });

  it("rejects empty text payload", () => {
    expect(() => textPayloadSchema.parse({ text: "" })).toThrow();
  });

  it("validates pong payload", () => {
    const result = pongPayloadSchema.parse({
      originalTs: "2026-01-01T00:00:00Z",
      latencyMs: 42,
    });
    expect(result.latencyMs).toBe(42);
  });

  it("validates profile payload", () => {
    const result = profilePayloadSchema.parse({
      name: "Agent",
      bio: "Description",
      skills: ["skill1"],
      availability: "online",
    });
    expect(result.name).toBe("Agent");
  });

  it("validates contact", () => {
    const result = contactSchema.parse({
      name: "Alice",
      address: "0xabc",
      addedAt: "2026-01-01T00:00:00Z",
      trusted: true,
    });
    expect(result.trusted).toBe(true);
  });
});
