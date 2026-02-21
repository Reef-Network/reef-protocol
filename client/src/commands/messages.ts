import * as fs from "node:fs";
import * as path from "node:path";
import { loadMessages, clearMessages } from "../messages.js";
import type { InboxMessage } from "../messages.js";
import { getConfigDir } from "../identity.js";
import {
  decodeA2AMessage,
  isA2ARequest,
  extractAppAction,
} from "@reef-protocol/protocol";

interface MessagesOptions {
  all?: boolean;
  clear?: boolean;
  from?: string;
  since?: string;
  watch?: boolean;
}

export function messagesCommand(options: MessagesOptions): void {
  const configDir = getConfigDir();

  if (options.clear) {
    clearMessages(configDir);
    console.log("Inbox cleared.");
    return;
  }

  if (options.watch) {
    watchMessages(configDir);
    return;
  }

  let messages = loadMessages(configDir);

  // Filter by sender address (case-insensitive prefix match)
  if (options.from) {
    const from = options.from.toLowerCase();
    messages = messages.filter((m) => m.from.toLowerCase().includes(from));
  }

  // Filter by timestamp
  if (options.since) {
    const since = new Date(options.since);
    if (isNaN(since.getTime())) {
      console.error(
        `Invalid date: "${options.since}". Use ISO 8601 (e.g. 2026-02-18) or a date string.`,
      );
      return;
    }
    messages = messages.filter((m) => new Date(m.timestamp) >= since);
  }

  if (messages.length === 0) {
    console.log("No messages in inbox.");
    return;
  }

  const display = options.all ? messages : messages.slice(-20);

  console.log(
    `=== Reef Inbox (${messages.length} message${messages.length === 1 ? "" : "s"}) ===\n`,
  );

  for (const msg of display) {
    printMessage(msg);
  }
}

export function extractReadableText(raw: string): string {
  let decoded: Record<string, unknown> | null;
  try {
    decoded = decodeA2AMessage(raw);
  } catch {
    return raw;
  }
  if (!decoded) return raw;

  // Handle message/send requests
  if (isA2ARequest(decoded) && decoded.method === "message/send") {
    const params = decoded.params as {
      message?: {
        role?: string;
        parts?: Array<Record<string, unknown>>;
      };
    };
    const parts = params?.message?.parts;
    if (Array.isArray(parts) && parts.length > 0) {
      const segments: string[] = [];
      for (const part of parts) {
        if (part.kind === "text" && typeof part.text === "string") {
          segments.push(part.text);
        } else if (part.kind === "data") {
          const appAction = extractAppAction(
            part as { kind: "data"; data: Record<string, unknown> },
          );
          if (appAction) {
            segments.push(
              `[app-action] ${appAction.appId}/${appAction.action}: ${JSON.stringify(appAction.payload)}`,
            );
          }
        }
      }
      if (segments.length > 0) return segments.join("\n");
    }
  }

  // Handle A2A responses (task results)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (decoded as any).result;
  if (result?.status?.message?.parts) {
    const parts = result.status.message.parts as Array<Record<string, unknown>>;
    const segments: string[] = [];
    for (const part of parts) {
      if (part.kind === "text" && typeof part.text === "string") {
        segments.push(part.text);
      }
    }
    if (segments.length > 0) return segments.join("\n");
  }

  return raw;
}

function printMessage(msg: InboxMessage): void {
  const date = new Date(msg.timestamp);
  const dateStr = date.toISOString().slice(0, 16).replace("T", " ");
  const method = msg.method || "plain";
  const text = extractReadableText(msg.text);
  console.log(`[${dateStr}] ${msg.from} (${method})`);
  console.log(`  ${text}\n`);
}

/** Watch the messages file for new entries and print them in real-time */
function watchMessages(configDir: string): void {
  const filePath = path.join(configDir, "messages.json");

  // Ensure the file exists
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(filePath, "[]");
  }

  let lastCount = loadMessages(configDir).length;
  console.log(
    `Watching for new messages (${lastCount} existing)... Press Ctrl+C to stop.\n`,
  );

  const watcher = fs.watch(filePath, () => {
    try {
      const messages = loadMessages(configDir);
      if (messages.length > lastCount) {
        const newMessages = messages.slice(lastCount);
        for (const msg of newMessages) {
          printMessage(msg);
        }
        lastCount = messages.length;
      } else if (messages.length < lastCount) {
        // Inbox was cleared
        lastCount = messages.length;
      }
    } catch {
      // File may be mid-write, skip
    }
  });

  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    watcher.close();
    process.exit(0);
  });
}
