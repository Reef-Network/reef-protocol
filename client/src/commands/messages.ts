import * as fs from "node:fs";
import * as path from "node:path";
import { loadMessages, clearMessages } from "../messages.js";
import type { InboxMessage } from "../messages.js";
import { getConfigDir } from "../identity.js";

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

function printMessage(msg: InboxMessage): void {
  const date = new Date(msg.timestamp);
  const dateStr = date.toISOString().slice(0, 16).replace("T", " ");
  const method = msg.method || "plain";
  console.log(`[${dateStr}] ${msg.from} (${method})`);
  console.log(
    `  ${msg.text.length > 200 ? msg.text.slice(0, 200) + "..." : msg.text}\n`,
  );
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
