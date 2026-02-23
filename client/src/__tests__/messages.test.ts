import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadMessages,
  appendMessage,
  clearMessages,
  formatAppActionForAgent,
} from "../messages.js";
import type { InboxMessage } from "../messages.js";

describe("messages", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reef-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no file exists", () => {
    const messages = loadMessages(tmpDir);
    expect(messages).toEqual([]);
  });

  it("appends and loads a message", () => {
    const msg: InboxMessage = {
      id: "test-1",
      from: "0xAlice",
      text: "Hello!",
      timestamp: "2026-02-18T19:57:00.000Z",
    };

    appendMessage(msg, tmpDir);
    const messages = loadMessages(tmpDir);

    expect(messages).toHaveLength(1);
    expect(messages[0].from).toBe("0xAlice");
    expect(messages[0].text).toBe("Hello!");
  });

  it("preserves method field for A2A messages", () => {
    const msg: InboxMessage = {
      id: "test-2",
      from: "0xBob",
      text: '{"jsonrpc":"2.0","method":"message/send"}',
      method: "message/send",
      timestamp: "2026-02-18T20:00:00.000Z",
    };

    appendMessage(msg, tmpDir);
    const messages = loadMessages(tmpDir);

    expect(messages[0].method).toBe("message/send");
  });

  it("caps at 1000 messages, dropping oldest", () => {
    for (let i = 0; i < 1010; i++) {
      appendMessage(
        {
          id: `msg-${i}`,
          from: "0xSender",
          text: `Message ${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
        },
        tmpDir,
      );
    }

    const messages = loadMessages(tmpDir);
    expect(messages).toHaveLength(1000);
    // Oldest should be msg-10 (0-9 dropped)
    expect(messages[0].id).toBe("msg-10");
    expect(messages[999].id).toBe("msg-1009");
  });

  it("clearMessages empties the inbox", () => {
    appendMessage(
      {
        id: "test-3",
        from: "0xAlice",
        text: "Hello!",
        timestamp: "2026-02-18T19:57:00.000Z",
      },
      tmpDir,
    );

    clearMessages(tmpDir);
    const messages = loadMessages(tmpDir);
    expect(messages).toEqual([]);
  });

  it("clearMessages works when no file exists", () => {
    clearMessages(tmpDir);
    const messages = loadMessages(tmpDir);
    expect(messages).toEqual([]);
  });

  it("deduplicates by message ID", () => {
    const msg: InboxMessage = {
      id: "dup-1",
      from: "0xAlice",
      text: "Hello!",
      timestamp: "2026-02-18T19:57:00.000Z",
    };

    appendMessage(msg, tmpDir);
    appendMessage(msg, tmpDir);
    expect(loadMessages(tmpDir)).toHaveLength(1);
  });

  it("deduplicates by content within 60s window", () => {
    const t0 = "2026-02-18T19:57:00.000Z";
    const t10s = "2026-02-18T19:57:10.000Z"; // 10s later

    appendMessage(
      { id: "a1", from: "0xAlice", text: "same text", timestamp: t0 },
      tmpDir,
    );
    // Same from+text, different ID, within 60s → should be deduped
    appendMessage(
      { id: "a2", from: "0xAlice", text: "same text", timestamp: t10s },
      tmpDir,
    );

    expect(loadMessages(tmpDir)).toHaveLength(1);
  });

  it("allows same content after 60s window expires", () => {
    const t0 = "2026-02-18T19:57:00.000Z";
    const t90s = "2026-02-18T19:58:30.000Z"; // 90s later

    appendMessage(
      { id: "b1", from: "0xAlice", text: "same text", timestamp: t0 },
      tmpDir,
    );
    // Same from+text but 90s later → should NOT be deduped
    appendMessage(
      { id: "b2", from: "0xAlice", text: "same text", timestamp: t90s },
      tmpDir,
    );

    expect(loadMessages(tmpDir)).toHaveLength(2);
  });

  it("allows same text from different senders", () => {
    const t0 = "2026-02-18T19:57:00.000Z";
    const t5s = "2026-02-18T19:57:05.000Z";

    appendMessage(
      { id: "c1", from: "0xAlice", text: "hello", timestamp: t0 },
      tmpDir,
    );
    appendMessage(
      { id: "c2", from: "0xBob", text: "hello", timestamp: t5s },
      tmpDir,
    );

    expect(loadMessages(tmpDir)).toHaveLength(2);
  });

  it("stores outbound message with direction and to fields", () => {
    const msg: InboxMessage = {
      id: "out-1",
      from: "0xAlice",
      to: "0xBob",
      text: "Hello Bob!",
      direction: "outbound",
      timestamp: "2026-02-18T20:00:00.000Z",
    };

    appendMessage(msg, tmpDir);
    const messages = loadMessages(tmpDir);

    expect(messages).toHaveLength(1);
    expect(messages[0].direction).toBe("outbound");
    expect(messages[0].to).toBe("0xBob");
  });

  it("loads old messages without direction field (backward compat)", () => {
    const msg: InboxMessage = {
      id: "old-1",
      from: "0xAlice",
      text: "Legacy message",
      timestamp: "2026-02-18T19:00:00.000Z",
    };

    appendMessage(msg, tmpDir);
    const messages = loadMessages(tmpDir);

    expect(messages).toHaveLength(1);
    expect(messages[0].direction).toBeUndefined();
    expect(messages[0].to).toBeUndefined();
  });

  it("does NOT dedup same content with different directions", () => {
    const t0 = "2026-02-18T19:57:00.000Z";
    const t5s = "2026-02-18T19:57:05.000Z";

    // Inbound from Bob
    appendMessage(
      { id: "d1", from: "0xBob", text: "same payload", timestamp: t0 },
      tmpDir,
    );
    // Outbound to Bob (same from for simplicity, different direction)
    appendMessage(
      {
        id: "d2",
        from: "0xBob",
        text: "same payload",
        direction: "outbound",
        timestamp: t5s,
      },
      tmpDir,
    );

    expect(loadMessages(tmpDir)).toHaveLength(2);
  });

  it("deduplicates same content with same direction within window", () => {
    const t0 = "2026-02-18T19:57:00.000Z";
    const t10s = "2026-02-18T19:57:10.000Z";

    appendMessage(
      {
        id: "e1",
        from: "0xAlice",
        text: "outbound msg",
        direction: "outbound",
        timestamp: t0,
      },
      tmpDir,
    );
    appendMessage(
      {
        id: "e2",
        from: "0xAlice",
        text: "outbound msg",
        direction: "outbound",
        timestamp: t10s,
      },
      tmpDir,
    );

    expect(loadMessages(tmpDir)).toHaveLength(1);
  });
});

describe("formatAppActionForAgent", () => {
  it("adds request-specific instructions for request actions", () => {
    const text = '[app-action] tic-tac-toe/request: {"seq":0,"role":"X"}';
    const result = formatAppActionForAgent(text, "0xAlice");

    expect(result).toContain("[Reef app-action from 0xAlice]");
    expect(result).toContain("wants to start");
    expect(result).toContain("reef apps read tic-tac-toe");
    expect(result).toContain("accept");
    expect(result).toContain(text);
  });

  it("adds read-rules instructions for non-request actions", () => {
    const text = '[app-action] tic-tac-toe/move: {"seq":1,"position":4}';
    const result = formatAppActionForAgent(text, "0xBob");

    expect(result).toContain("[Reef app-action from 0xBob]");
    expect(result).toContain("reef apps read tic-tac-toe");
    expect(result).toContain("exactly ONE reef apps send command");
    expect(result).toContain("do NOT echo or re-send");
    expect(result).toContain(text);
  });

  it("returns plain text unchanged", () => {
    const text = "Hello, how are you?";
    expect(formatAppActionForAgent(text, "0xAlice")).toBe(text);
  });
});
