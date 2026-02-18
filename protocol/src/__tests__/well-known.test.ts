import { describe, it, expect } from "vitest";
import {
  TTT_MANIFEST,
  WELL_KNOWN_APPS,
  getWellKnownManifest,
  listWellKnownApps,
  appManifestSchema,
  compareManifests,
} from "../index.js";

describe("TTT_MANIFEST", () => {
  it("passes appManifestSchema validation", () => {
    const result = appManifestSchema.parse(TTT_MANIFEST);
    expect(result.appId).toBe("tic-tac-toe");
  });

  it("has the correct appId", () => {
    expect(TTT_MANIFEST.appId).toBe("tic-tac-toe");
  });

  it("has category 'game'", () => {
    expect(TTT_MANIFEST.category).toBe("game");
  });

  it("requires exactly 2 participants", () => {
    expect(TTT_MANIFEST.minParticipants).toBe(2);
    expect(TTT_MANIFEST.maxParticipants).toBe(2);
  });

  it("has 'move' and 'result' actions", () => {
    const actionIds = TTT_MANIFEST.actions.map((a) => a.id).sort();
    expect(actionIds).toEqual(["move", "result"]);
  });

  it("move action has inputSchema with position field", () => {
    const move = TTT_MANIFEST.actions.find((a) => a.id === "move");
    expect(move).toBeDefined();
    expect(move!.inputSchema).toBeDefined();
    const props = move!.inputSchema!.properties as Record<string, unknown>;
    const position = props.position as Record<string, unknown>;
    expect(position.type).toBe("integer");
    expect(position.minimum).toBe(0);
    expect(position.maximum).toBe(8);
  });

  it("is frozen (immutable)", () => {
    expect(Object.isFrozen(TTT_MANIFEST)).toBe(true);
  });

  it("is self-compatible via compareManifests", () => {
    const result = compareManifests(TTT_MANIFEST, TTT_MANIFEST);
    expect(result.compatible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("is not a coordinated app", () => {
    expect(TTT_MANIFEST.coordinatorAddress).toBeUndefined();
  });
});

describe("WELL_KNOWN_APPS registry", () => {
  it("contains tic-tac-toe", () => {
    expect(WELL_KNOWN_APPS.has("tic-tac-toe")).toBe(true);
  });

  it("getWellKnownManifest returns manifest for known appId", () => {
    const manifest = getWellKnownManifest("tic-tac-toe");
    expect(manifest).toBe(TTT_MANIFEST);
  });

  it("getWellKnownManifest returns undefined for unknown appId", () => {
    expect(getWellKnownManifest("nonexistent")).toBeUndefined();
  });

  it("listWellKnownApps includes tic-tac-toe", () => {
    expect(listWellKnownApps()).toContain("tic-tac-toe");
  });

  it("registry size matches listed apps", () => {
    expect(WELL_KNOWN_APPS.size).toBe(listWellKnownApps().length);
  });
});
