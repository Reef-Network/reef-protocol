import "dotenv/config";
import { buildReefAgentCard, buildSkill } from "@reef-protocol/protocol";
import { InMemoryTaskStore } from "@a2a-js/sdk/server";
import { getOrCreateIdentity, getConfigDir } from "./identity.js";
import { createReefAgent } from "./agent.js";
import { handleA2AMessage } from "./handler.js";
import { createDefaultLogicHandler } from "./logic.js";
import { startHeartbeat } from "./heartbeat.js";
import type { MessageContext } from "@xmtp/agent-sdk";

const DIRECTORY_URL = process.env.REEF_DIRECTORY_URL || "http://localhost:3000";

/**
 * Start the Reef daemon — long-running process that listens for messages,
 * sends heartbeats, and registers with the directory.
 */
export async function startDaemon(): Promise<void> {
  const configDir = getConfigDir();
  const identity = getOrCreateIdentity(configDir);

  console.log(`[reef] Starting daemon...`);
  console.log(`[reef] Address: ${identity.address}`);
  console.log(`[reef] XMTP env: ${identity.xmtpEnv}`);
  console.log(`[reef] Config dir: ${configDir}`);

  // Initialize XMTP agent
  const agent = await createReefAgent(configDir);
  console.log(`[reef] XMTP agent initialized`);

  // Build AgentCard from env vars
  const agentName =
    process.env.REEF_AGENT_NAME || `Agent ${identity.address.slice(0, 8)}`;
  const agentDescription = process.env.REEF_AGENT_BIO || "";
  const skillStrings = process.env.REEF_AGENT_SKILLS
    ? process.env.REEF_AGENT_SKILLS.split(",").map((s) => s.trim())
    : [];
  const skills = skillStrings.map((s) =>
    buildSkill(s.toLowerCase().replace(/\s+/g, "-"), s, s, [s]),
  );

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

  // Start heartbeat
  const stopHeartbeat = startHeartbeat(DIRECTORY_URL, identity);

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

    await handleA2AMessage(content, sender, agent, taskStore, logicHandler);
  });

  await agent.start();
  console.log(`[reef] Daemon running. Listening for A2A messages...`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[reef] Shutting down...");
    stopHeartbeat();
    await agent.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Run if executed directly
startDaemon().catch((err) => {
  console.error("[reef] Fatal:", err);
  process.exit(1);
});
