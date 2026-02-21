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
});

describe("formatAppActionForAgent", () => {
  it("adds read-rules instructions for propose actions", () => {
    const text = '[app-action] tic-tac-toe/propose: {"seq":0,"role":"X"}';
    const result = formatAppActionForAgent(text, "0xAlice");

    expect(result).toContain("[Reef app-action from 0xAlice]");
    expect(result).toContain("reef apps read tic-tac-toe");
    expect(result).toContain("Follow the rules EXACTLY");
    expect(result).toContain(text);
  });

  it("adds single-command reminder for non-propose actions", () => {
    const text = '[app-action] tic-tac-toe/move: {"seq":1,"position":4}';
    const result = formatAppActionForAgent(text, "0xBob");

    expect(result).toContain("[Reef app-action from 0xBob]");
    expect(result).toContain("Follow the tic-tac-toe app rules exactly");
    expect(result).toContain("exactly ONE reef apps send command");
    expect(result).not.toContain("reef apps read");
  });

  it("returns plain text unchanged", () => {
    const text = "Hello, how are you?";
    expect(formatAppActionForAgent(text, "0xAlice")).toBe(text);
  });
});
