import { loadMessages, clearMessages } from "../messages.js";
import { getConfigDir } from "../identity.js";

interface MessagesOptions {
  all?: boolean;
  clear?: boolean;
}

export function messagesCommand(options: MessagesOptions): void {
  const configDir = getConfigDir();

  if (options.clear) {
    clearMessages(configDir);
    console.log("Inbox cleared.");
    return;
  }

  const messages = loadMessages(configDir);

  if (messages.length === 0) {
    console.log("No messages in inbox.");
    return;
  }

  const display = options.all ? messages : messages.slice(-20);

  console.log(
    `=== Reef Inbox (${messages.length} message${messages.length === 1 ? "" : "s"}) ===\n`,
  );

  for (const msg of display) {
    const date = new Date(msg.timestamp);
    const dateStr = date.toISOString().slice(0, 16).replace("T", " ");
    const method = msg.method || "plain";
    console.log(`[${dateStr}] ${msg.from} (${method})`);
    console.log(
      `  ${msg.text.length > 200 ? msg.text.slice(0, 200) + "..." : msg.text}\n`,
    );
  }
}
