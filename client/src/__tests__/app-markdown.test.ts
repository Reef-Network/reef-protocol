import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAppMarkdown, serializeAppMarkdown } from "../app-markdown.js";

const BUNDLED_APPS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "apps",
);

const SAMPLE_MARKDOWN = `---
appId: test-game
name: Test Game
description: A test game for testing
version: "0.2.1"
type: p2p
category: game
minParticipants: 2
maxParticipants: 4
actions:
  - id: move
    description: Make a move
  - id: resign
    description: Resign the game
---

# Test Game

This is a test game with simple rules.

## How to Play

Take turns making moves.
`;

describe("parseAppMarkdown", () => {
  it("parses frontmatter and body", () => {
    const manifest = parseAppMarkdown(SAMPLE_MARKDOWN);
    expect(manifest.appId).toBe("test-game");
    expect(manifest.name).toBe("Test Game");
    expect(manifest.description).toBe("A test game for testing");
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.type).toBe("p2p");
    expect(manifest.category).toBe("game");
    expect(manifest.minParticipants).toBe(2);
    expect(manifest.maxParticipants).toBe(4);
  });

  it("parses actions", () => {
    const manifest = parseAppMarkdown(SAMPLE_MARKDOWN);
    expect(manifest.actions).toHaveLength(2);
    expect(manifest.actions[0].id).toBe("move");
    expect(manifest.actions[0].description).toBe("Make a move");
    expect(manifest.actions[1].id).toBe("resign");
  });

  it("parses rules from body", () => {
    const manifest = parseAppMarkdown(SAMPLE_MARKDOWN);
    expect(manifest.rules).toContain("# Test Game");
    expect(manifest.rules).toContain("## How to Play");
  });

  it("handles coordinated type", () => {
    const md = `---
appId: news-feed
name: News Feed
description: A news aggregator
version: "1.0.0"
type: coordinated
coordinatorAddress: 0xCoordinator
minParticipants: 1
actions:
  - id: submit
    description: Submit an article
---

# News Feed Rules
`;
    const manifest = parseAppMarkdown(md);
    expect(manifest.type).toBe("coordinated");
    expect(manifest.coordinatorAddress).toBe("0xCoordinator");
  });

  it("defaults type to p2p", () => {
    const md = `---
appId: simple
name: Simple
description: A simple app
---
`;
    const manifest = parseAppMarkdown(md);
    expect(manifest.type).toBe("p2p");
  });

  it("handles no body (rules undefined)", () => {
    const md = `---
appId: no-rules
name: No Rules
description: An app without rules
type: p2p
---`;
    const manifest = parseAppMarkdown(md);
    expect(manifest.rules).toBeUndefined();
  });

  it("throws on missing frontmatter delimiter", () => {
    expect(() => parseAppMarkdown("no frontmatter here")).toThrow(
      "missing frontmatter delimiter",
    );
  });

  it("throws on missing closing delimiter", () => {
    expect(() => parseAppMarkdown("---\nappId: test\n")).toThrow(
      "missing closing frontmatter delimiter",
    );
  });

  it("throws on missing required fields", () => {
    expect(() => parseAppMarkdown("---\nname: Test\n---\n")).toThrow(
      "Missing required field: appId",
    );
  });

  it("handles quoted version strings", () => {
    const md = `---
appId: quoted
name: Quoted
description: Test
version: "1.2.3"
type: p2p
---
`;
    const manifest = parseAppMarkdown(md);
    expect(manifest.version).toBe("1.2.3");
  });
});

describe("serializeAppMarkdown", () => {
  it("serializes a manifest to markdown", () => {
    const manifest = parseAppMarkdown(SAMPLE_MARKDOWN);
    const output = serializeAppMarkdown(manifest);

    expect(output).toContain("appId: test-game");
    expect(output).toContain("name: Test Game");
    expect(output).toContain("type: p2p");
    expect(output).toContain("category: game");
    expect(output).toContain("  - id: move");
    expect(output).toContain("# Test Game");
  });

  it("round-trips parse -> serialize -> parse", () => {
    const original = parseAppMarkdown(SAMPLE_MARKDOWN);
    const serialized = serializeAppMarkdown(original);
    const roundTripped = parseAppMarkdown(serialized);

    expect(roundTripped.appId).toBe(original.appId);
    expect(roundTripped.name).toBe(original.name);
    expect(roundTripped.type).toBe(original.type);
    expect(roundTripped.actions).toHaveLength(original.actions.length);
    expect(roundTripped.minParticipants).toBe(original.minParticipants);
    expect(roundTripped.maxParticipants).toBe(original.maxParticipants);
  });

  it("parses bundled tic-tac-toe.md correctly", () => {
    const raw = fs.readFileSync(
      path.join(BUNDLED_APPS_DIR, "tic-tac-toe.md"),
      "utf-8",
    );
    const manifest = parseAppMarkdown(raw);
    expect(manifest.appId).toBe("tic-tac-toe");
    expect(manifest.type).toBe("p2p");
    expect(manifest.category).toBe("game");
    expect(manifest.actions.map((a) => a.id).sort()).toEqual([
      "accept",
      "move",
      "request",
      "result",
    ]);
    expect(manifest.rules).toContain("# Tic-Tac-Toe");
  });

  it("omits optional fields when not set", () => {
    const output = serializeAppMarkdown({
      appId: "minimal",
      name: "Minimal",
      description: "Test",
      version: "1.0.0",
      type: "p2p",
      actions: [],
      minParticipants: 2,
    });
    expect(output).not.toContain("category:");
    expect(output).not.toContain("coordinatorAddress:");
    expect(output).not.toContain("maxParticipants:");
  });
});
