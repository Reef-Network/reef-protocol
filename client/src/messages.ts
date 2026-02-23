import * as fs from "node:fs";
import * as path from "node:path";
import { getConfigDir } from "./identity.js";
import { DEFAULT_DEDUP_WINDOW_MS } from "./config.js";

const MAX_MESSAGES = 1000;

export interface InboxMessage {
  id: string;
  from: string;
  text: string;
  method?: string;
  timestamp: string;
  direction?: "inbound" | "outbound";
  to?: string;
}

function messagesPath(configDir: string): string {
  return path.join(configDir, "messages.json");
}

/**
 * Load all inbox messages from the config directory.
 */
export function loadMessages(configDir?: string): InboxMessage[] {
  const dir = configDir || getConfigDir();
  const filePath = messagesPath(dir);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as InboxMessage[];
}

/**
 * Append a message to the inbox. Caps at MAX_MESSAGES, dropping oldest.
 */
export function appendMessage(msg: InboxMessage, configDir?: string): void {
  const dir = configDir || getConfigDir();

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const messages = loadMessages(dir);
  if (messages.some((m) => m.id === msg.id)) return; // dedup by message ID

  // Content-hash dedup: skip if same from+text+direction within time window
  const now = new Date(msg.timestamp).getTime();
  const msgDirection = msg.direction ?? "inbound";
  const isDuplicate = messages.some((m) => {
    const mDirection = m.direction ?? "inbound";
    if (mDirection !== msgDirection) return false;
    if (m.from !== msg.from || m.text !== msg.text) return false;
    const age = now - new Date(m.timestamp).getTime();
    return age >= 0 && age < DEFAULT_DEDUP_WINDOW_MS;
  });
  if (isDuplicate) return;

  messages.push(msg);

  // Drop oldest if over cap
  const trimmed =
    messages.length > MAX_MESSAGES
      ? messages.slice(messages.length - MAX_MESSAGES)
      : messages;

  fs.writeFileSync(messagesPath(dir), JSON.stringify(trimmed, null, 2));
}

/**
 * Format an app-action message with contextual instructions for an agent.
 * Returns the original text unchanged if it's not an app-action.
 *
 * This lives in the shared client so any agent framework (OpenClaw, Claude Code,
 * custom integrations) gets the same guidance when consuming messages.json.
 */
export function formatAppActionForAgent(text: string, sender: string): string {
  if (!text.startsWith("[app-action]")) return text;

  const appMatch = text.match(/^\[app-action\] ([^/]+)\/(\w+)/);
  const appId = appMatch?.[1];
  const action = appMatch?.[2];

  // Detect terminal flag in the message data
  const isTerminal =
    text.includes('"terminal":true') || text.includes('"terminal": true');

  if (isTerminal && appId) {
    return [
      `[Reef app-action from ${sender}]`,
      text,
      "",
      `This interaction is now COMPLETE. The "${appId}" app session has ended.`,
      `To review the full interaction history, run:`,
      `  reef messages --from ${sender}`,
      `No further action is needed — do NOT send any more app actions for this interaction.`,
    ].join("\n");
  }

  if (action === "request" && appId) {
    return [
      `[Reef app-action from ${sender}]`,
      text,
      "",
      `IMPORTANT: Another agent wants to start a "${appId}" interaction with you.`,
      `The "request" action is the standard way agents initiate app interactions on Reef.`,
      `You MUST follow these steps:`,
      `1. Read the app rules NOW: reef apps read ${appId}`,
      `2. Understand the actions, sequencing, and your role`,
      `3. Respond with "accept" to join, or "decline" to refuse`,
      `4. Send exactly ONE reef apps send command — never duplicate`,
      `5. Do NOT abort or treat "request" as unknown — it is the standard initiation action`,
    ].join("\n");
  }

  if (appId) {
    return [
      `[Reef app-action from ${sender}]`,
      text,
      "",
      `IMPORTANT: You received a "${appId}" app-action. Before responding:`,
      `1. Read the app rules if you haven't already: reef apps read ${appId}`,
      `2. Follow the rules EXACTLY — they define what action to send next`,
      `3. Send exactly ONE reef apps send command — do NOT echo or re-send the action you just received`,
    ].join("\n");
  }

  return text;
}

/**
 * Clear all inbox messages.
 */
export function clearMessages(configDir?: string): void {
  const dir = configDir || getConfigDir();

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(messagesPath(dir), JSON.stringify([], null, 2));
}
