/** Well-known canonical app manifests — Schelling points for P2P apps */

import type { AppManifest } from "./types.js";
import { buildAppManifest, buildAppAction } from "./builders.js";

// ── Tic-Tac-Toe ────────────────────────────────────────────────────

/**
 * Canonical manifest for Tic-Tac-Toe.
 *
 * Turn-based two-player game on a 3x3 grid (positions 0–8).
 *
 * Actions:
 *   - "move": Place a mark at a position (0–8).
 *   - "result": Declare the game outcome after a winning/drawing move.
 */
export const TTT_MANIFEST: AppManifest = Object.freeze(
  buildAppManifest(
    "tic-tac-toe",
    "Tic-Tac-Toe",
    "Classic two-player tic-tac-toe over A2A",
    [
      buildAppAction("move", "Move", "Place your mark on the board", {
        inputSchema: {
          type: "object",
          properties: {
            position: {
              type: "integer",
              minimum: 0,
              maximum: 8,
              description: "Board position (0=top-left, 8=bottom-right)",
            },
          },
          required: ["position"],
        },
      }),
      buildAppAction("result", "Result", "Declare the game outcome", {
        inputSchema: {
          type: "object",
          properties: {
            outcome: { type: "string", enum: ["win", "lose", "draw"] },
            winner: { type: "string", enum: ["X", "O"] },
          },
          required: ["outcome"],
        },
      }),
    ],
    {
      category: "game",
      minParticipants: 2,
      maxParticipants: 2,
    },
  ),
);

// ── Registry ────────────────────────────────────────────────────────

/** All well-known app manifests, keyed by appId */
export const WELL_KNOWN_APPS: ReadonlyMap<string, AppManifest> = new Map([
  [TTT_MANIFEST.appId, TTT_MANIFEST],
]);

/** Look up a well-known manifest by appId */
export function getWellKnownManifest(appId: string): AppManifest | undefined {
  return WELL_KNOWN_APPS.get(appId);
}

/** List all well-known app IDs */
export function listWellKnownApps(): string[] {
  return Array.from(WELL_KNOWN_APPS.keys());
}
