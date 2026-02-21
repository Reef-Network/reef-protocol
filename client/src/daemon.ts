import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import {
  buildReefAgentCard,
  buildSkill,
  DEFAULT_DIRECTORY_URL,
} from "@reef-protocol/protocol";
import type { TaskState } from "@reef-protocol/protocol";
import { InMemoryTaskStore } from "@a2a-js/sdk/server";
import {
  getOrCreateIdentity,
  getConfigDir,
  loadWalletKey,
} from "./identity.js";
import { createReefAgent } from "./agent.js";
import { handleA2AMessage } from "./handler.js";
import { createDefaultLogicHandler } from "./logic.js";
import { decodeA2AMessage, isA2ARequest } from "@reef-protocol/protocol";
import { appendMessage } from "./messages.js";
import { AppRouter } from "./app-router.js";
import { installWellKnownApps } from "./app-store.js";
import { startHeartbeat } from "./heartbeat.js";
import { loadConfig, DEFAULT_DEDUP_WINDOW_MS } from "./config.js";
import { isContact } from "./contacts.js";

import type { MessageContext } from "@xmtp/agent-sdk";

const DIRECTORY_URL = process.env.REEF_DIRECTORY_URL || DEFAULT_DIRECTORY_URL;

export interface DaemonOptions {
  name?: string;
  bio?: string;
}

/**
 * Start the Reef daemon — long-running process that listens for messages,
 * sends heartbeats, and registers with the directory.
 */
export async function startDaemon(opts?: DaemonOptions): Promise<void> {
  const configDir = getConfigDir();
  const identity = getOrCreateIdentity(configDir);

  console.log(`[reef] Starting daemon...`);
  console.log(`[reef] Address: ${identity.address}`);
  console.log(`[reef] XMTP env: ${identity.xmtpEnv}`);
  console.log(`[reef] Config dir: ${configDir}`);

  // Initialize XMTP agent
  const agent = await createReefAgent(configDir);
  console.log(`[reef] XMTP agent initialized`);

  // Build AgentCard — name from opts > env > error
  const agentName = opts?.name || process.env.REEF_AGENT_NAME;
  if (!agentName) {
    console.error(
      "[reef] No agent name provided. Use --name or set REEF_AGENT_NAME.",
    );
    process.exit(1);
  }
  const agentDescription = opts?.bio || process.env.REEF_AGENT_BIO || "";
  const skillStrings = process.env.REEF_AGENT_SKILLS
    ? process.env.REEF_AGENT_SKILLS.split(",").map((s) => s.trim())
    : [];
  const skills = skillStrings.map((s) =>
    buildSkill(s.toLowerCase().replace(/\s+/g, "-"), s, s, [s]),
  );

  // Install well-known app markdowns and load all apps
  const newApps = installWellKnownApps(configDir);
  if (newApps.length > 0) {
    console.log(`[reef] Installed app markdowns: ${newApps.join(", ")}`);
  }
  const appRouter = new AppRouter();
  const loadedApps = appRouter.autoLoadDefaults(configDir);
  if (loadedApps.length > 0) {
    console.log(`[reef] Loaded apps: ${loadedApps.join(", ")}`);
  }

  // Auto-register app-derived skills (Issue #1)
  for (const appId of appRouter.listApps()) {
    const manifest = appRouter.get(appId);
    if (manifest) {
      skills.push(
        buildSkill(appId, manifest.name, manifest.description, [appId]),
      );
    }
  }

  const agentCard = buildReefAgentCard(
    identity.address,
    agentName,
    agentDescription,
    skills,
  );

  // Register with directory
  try {
    const res = await fetch(`${DIRECTORY_URL}/agents/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: identity.address,
        agentCard,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { agentNumber: number };
      console.log(
        `[reef] Registered with directory (agent #${data.agentNumber})`,
      );
    } else {
      console.warn(`[reef] Directory registration failed: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[reef] Could not reach directory: ${(err as Error).message}`);
  }

  // Task outcome counters for reputation telemetry
  const taskCounters = { completed: 0, failed: 0 };

  const onTaskOutcome = (state: TaskState) => {
    if (state === "completed") {
      taskCounters.completed++;
    } else if (
      state === "failed" ||
      state === "canceled" ||
      state === "rejected"
    ) {
      taskCounters.failed++;
    }
  };

  // Load agent config
  const agentConfig = loadConfig(configDir);
  if (agentConfig.contactsOnly) {
    console.log(`[reef] Contacts-only mode enabled`);
  }
  if (agentConfig.country) {
    console.log(`[reef] Country: ${agentConfig.country}`);
  }

  // Load wallet key for heartbeat signing
  const walletKey = loadWalletKey(configDir);
  if (!walletKey) {
    console.error("[reef] No wallet key found. Run `reef identity -g` first.");
    process.exit(1);
  }

  // Start heartbeat with dynamic telemetry
  const stopHeartbeat = startHeartbeat(DIRECTORY_URL, identity, {
    walletKey,
    getTelemetry: () => {
      // Return current counters and reset them (directory accumulates)
      const snapshot = {
        tasksCompleted: taskCounters.completed,
        tasksFailed: taskCounters.failed,
        country: agentConfig.country,
      };
      taskCounters.completed = 0;
      taskCounters.failed = 0;
      return snapshot;
    },
  });

  // Create task store and logic handler
  const taskStore = new InMemoryTaskStore();
  const logicHandler = createDefaultLogicHandler();

  // Listen for messages
  agent.on("text", async (ctx: MessageContext<string>) => {
    const content = ctx.message.content;
    if (typeof content !== "string") return;

    const sender = await ctx.getSenderAddress();
    if (!sender) return;
    // Skip messages from self
    if (sender === agent.address) return;
    // Contacts-only filtering
    if (agentConfig.contactsOnly && !isContact(sender, configDir)) {
      console.log(`[reef] Blocked message from non-contact: ${sender}`);
      return;
    }

    // Save to inbox
    const decoded = decodeA2AMessage(content);
    appendMessage(
      {
        id: ctx.message.id,
        from: sender,
        text: content,
        method: decoded && isA2ARequest(decoded) ? decoded.method : undefined,
        timestamp: ctx.message.sentAt.toISOString(),
      },
      configDir,
    );

    // Only run built-in handler for protocol ops (tasks/get, tasks/cancel).
    // message/send is handled by the OpenClaw plugin via messages.json.
    const isMessageSend =
      decoded && isA2ARequest(decoded) && decoded.method === "message/send";
    if (!isMessageSend) {
      await handleA2AMessage(
        content,
        sender,
        agent,
        taskStore,
        logicHandler,
        onTaskOutcome,
        ctx.conversation,
        appRouter,
      );
    }
  });

  // Accept all consent states: 0=Unknown, 1=Allowed, 2=Denied
  // The XMTP SDK types for AgentStreamingOptions are narrower than what
  // streamAllMessages actually accepts, so we cast to pass consentStates.
  await agent.start({
    consentStates: [0, 1, 2],
    disableSync: true,
  } as Parameters<typeof agent.start>[0]);
  console.log(`[reef] Daemon running. Listening for A2A messages...`);
  console.log(
    `[reef] TIP: Run \`reef messages --watch\` in another terminal to monitor incoming messages.`,
  );

  // Start local HTTP API so `reef send` can delegate to the daemon

  // Outbound dedup — suppress identical sends within time window.
  // Catches LLMs that run the same `reef apps send` command multiple times per turn.
  const recentSends = new Map<string, number>();

  function isDuplicateSend(address: string, text: string): boolean {
    const key = `${address.toLowerCase()}:${text}`;
    const lastSent = recentSends.get(key);
    const now = Date.now();
    if (lastSent && now - lastSent < DEFAULT_DEDUP_WINDOW_MS) {
      return true;
    }
    recentSends.set(key, now);
    return false;
  }

  // Prune stale dedup entries every 5 minutes
  const dedupCleanup = setInterval(() => {
    const cutoff = Date.now() - DEFAULT_DEDUP_WINDOW_MS;
    for (const [key, ts] of recentSends) {
      if (ts < cutoff) recentSends.delete(key);
    }
  }, 5 * 60_000);
  dedupCleanup.unref();

  const lockPath = path.join(configDir, "daemon.lock");
  const httpServer = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/send") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", async () => {
        try {
          const { address, text } = JSON.parse(body) as {
            address: string;
            text: string;
          };
          if (!address || !text) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "address and text required" }));
            return;
          }
          // Suppress duplicate sends (same recipient + payload within window)
          if (isDuplicateSend(address, text)) {
            console.log(
              `[reef] outbound dedup: suppressed duplicate to ${address}`,
            );
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, deduped: true }));
            return;
          }
          // Relay pre-encoded A2A payload directly (callers encode before sending)
          const dm = await agent.createDmWithAddress(address as `0x${string}`);
          await dm.sendText(text);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  // Listen on a random port, write it to daemon.lock
  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const addr = httpServer.address() as { port: number };
      fs.writeFileSync(lockPath, String(addr.port));
      console.log(`[reef] Local API on port ${addr.port}`);
      resolve();
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[reef] Shutting down...");
    stopHeartbeat();
    httpServer.close();
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // lock file may already be gone
    }
    await agent.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Run if executed directly (not when imported by cli.ts)
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  startDaemon().catch((err) => {
    console.error("[reef] Fatal:", err);
    process.exit(1);
  });
}
