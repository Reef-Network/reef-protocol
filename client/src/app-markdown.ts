/** Parse and serialize app markdown files (YAML frontmatter + rules body) */

import type { AppManifest, AppAction } from "@reef-protocol/protocol";
import { REEF_VERSION } from "@reef-protocol/protocol";

/**
 * Parse a YAML-frontmatter app markdown into an AppManifest.
 *
 * Format:
 * ```
 * ---
 * appId: tic-tac-toe
 * name: Tic-Tac-Toe
 * ...
 * actions:
 *   - id: move
 *     description: Place your mark
 * ---
 *
 * # Rules body (becomes `rules`)
 * ```
 */
export function parseAppMarkdown(markdown: string): AppManifest {
  const trimmed = markdown.trim();
  if (!trimmed.startsWith("---")) {
    throw new Error("Invalid app markdown: missing frontmatter delimiter");
  }

  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) {
    throw new Error(
      "Invalid app markdown: missing closing frontmatter delimiter",
    );
  }

  const frontmatter = trimmed.slice(3, endIdx).trim();
  const body = trimmed.slice(endIdx + 3).trim();

  const fields = parseFrontmatter(frontmatter);

  const appId = requireString(fields, "appId");
  const name = requireString(fields, "name");
  const description = requireString(fields, "description");

  const manifest: AppManifest = {
    appId,
    name,
    description,
    version: getString(fields, "version") ?? REEF_VERSION,
    type: (getString(fields, "type") as "p2p" | "coordinated") ?? "p2p",
    actions: parseActions(fields.actions),
    minParticipants: getNumber(fields, "minParticipants") ?? 2,
  };

  const category = getString(fields, "category");
  if (category) manifest.category = category;

  const coordinatorAddress = getString(fields, "coordinatorAddress");
  if (coordinatorAddress) manifest.coordinatorAddress = coordinatorAddress;

  const maxParticipants = getNumber(fields, "maxParticipants");
  if (maxParticipants !== undefined) manifest.maxParticipants = maxParticipants;

  if (body) manifest.rules = body;

  return manifest;
}

/**
 * Serialize an AppManifest to a markdown string with YAML frontmatter.
 */
export function serializeAppMarkdown(manifest: AppManifest): string {
  const lines: string[] = ["---"];

  lines.push(`appId: ${manifest.appId}`);
  lines.push(`name: ${manifest.name}`);
  lines.push(`description: ${manifest.description}`);
  lines.push(`version: "${manifest.version}"`);
  lines.push(`type: ${manifest.type}`);

  if (manifest.category) {
    lines.push(`category: ${manifest.category}`);
  }
  if (manifest.coordinatorAddress) {
    lines.push(`coordinatorAddress: ${manifest.coordinatorAddress}`);
  }

  lines.push(`minParticipants: ${manifest.minParticipants}`);
  if (manifest.maxParticipants !== undefined) {
    lines.push(`maxParticipants: ${manifest.maxParticipants}`);
  }

  if (manifest.actions.length > 0) {
    lines.push("actions:");
    for (const action of manifest.actions) {
      lines.push(`  - id: ${action.id}`);
      lines.push(`    description: ${action.description}`);
      if (action.terminal) {
        lines.push(`    terminal: true`);
      }
    }
  }

  lines.push("---");

  if (manifest.rules) {
    lines.push("");
    lines.push(manifest.rules);
  }

  return lines.join("\n") + "\n";
}

// ── Internal parsers ────────────────────────────────────────────────

interface FrontmatterMap {
  [key: string]: string | FrontmatterMap[] | undefined;
}

/**
 * Minimal YAML-like frontmatter parser.
 * Handles flat key: value pairs and a single `actions:` array of objects.
 */
function parseFrontmatter(text: string): FrontmatterMap {
  const result: FrontmatterMap = {};
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip blank lines
    if (!trimmedLine) {
      i++;
      continue;
    }

    // Check for `key: value` or `key:`
    const colonIdx = trimmedLine.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = trimmedLine.slice(0, colonIdx).trim();
    const rawValue = trimmedLine.slice(colonIdx + 1).trim();

    if (key === "actions" && !rawValue) {
      // Parse array of objects
      const items: FrontmatterMap[] = [];
      i++;
      while (i < lines.length) {
        const itemLine = lines[i];
        if (!itemLine.match(/^\s+-\s/)) break;

        // Start of a new array item
        const item: FrontmatterMap = {};
        const firstField = itemLine.replace(/^\s+-\s*/, "").trim();
        const firstColon = firstField.indexOf(":");
        if (firstColon !== -1) {
          item[firstField.slice(0, firstColon).trim()] = unquote(
            firstField.slice(firstColon + 1).trim(),
          );
        }
        i++;

        // Read continuation lines (indented, no dash)
        while (i < lines.length) {
          const contLine = lines[i];
          if (
            contLine.match(/^\s+-\s/) || // next array item
            !contLine.match(/^\s/) || // back to top-level
            !contLine.trim()
          ) {
            break;
          }
          const contTrimmed = contLine.trim();
          const contColon = contTrimmed.indexOf(":");
          if (contColon !== -1) {
            item[contTrimmed.slice(0, contColon).trim()] = unquote(
              contTrimmed.slice(contColon + 1).trim(),
            );
          }
          i++;
        }

        items.push(item);
      }
      result[key] = items;
    } else {
      result[key] = unquote(rawValue);
      i++;
    }
  }

  return result;
}

function unquote(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function requireString(fields: FrontmatterMap, key: string): string {
  const val = fields[key];
  if (typeof val !== "string" || !val) {
    throw new Error(`Missing required field: ${key}`);
  }
  return val;
}

function getString(fields: FrontmatterMap, key: string): string | undefined {
  const val = fields[key];
  return typeof val === "string" ? val : undefined;
}

function getNumber(fields: FrontmatterMap, key: string): number | undefined {
  const val = fields[key];
  if (typeof val !== "string") return undefined;
  const n = parseInt(val, 10);
  return isNaN(n) ? undefined : n;
}

function parseActions(raw: string | FrontmatterMap[] | undefined): AppAction[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item) => {
    const action: AppAction = {
      id: (item.id as string) || "",
      name: (item.name as string) || (item.id as string) || "",
      description: (item.description as string) || "",
    };
    if ((item.terminal as string) === "true") {
      action.terminal = true;
    }
    return action;
  });
}
