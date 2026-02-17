import type { Agent } from "@xmtp/agent-sdk";
import {
  decodeEnvelope,
  encodeEnvelope,
  type ReefEnvelope,
} from "@reef-protocol/protocol";
import { isContact } from "./contacts.js";

type HexAddress = `0x${string}`;

/**
 * Handle an inbound Reef message by routing based on envelope type.
 */
export async function handleMessage(
  envelope: ReefEnvelope,
  agent: Agent,
  configDir: string,
): Promise<void> {
  const { type, from, payload } = envelope;

  switch (type) {
    case "text": {
      const trusted = isContact(from, configDir);
      const text = (payload as { text?: string })?.text || "(empty)";

      if (trusted) {
        console.log(`[msg] ${from}: ${text}`);
      } else {
        console.log(`[msg] (unknown) ${from}: ${text}`);
        // Auto-respond to unknown senders
        try {
          const dm = await agent.createDmWithAddress(from as HexAddress);
          const reply = encodeEnvelope("text", agent.address || from, {
            text: "I received your message. You are not in my contacts yet.",
          });
          await dm.sendText(reply);
        } catch (err) {
          console.error("[router] Failed to auto-respond:", err);
        }
      }
      break;
    }

    case "ping": {
      console.log(`[ping] from ${from}`);
      try {
        const dm = await agent.createDmWithAddress(from as HexAddress);
        const pong = encodeEnvelope("pong", agent.address || from, {
          originalTs: envelope.ts,
        });
        await dm.sendText(pong);
      } catch (err) {
        console.error("[router] Failed to send pong:", err);
      }
      break;
    }

    case "pong": {
      const pongPayload = payload as {
        originalTs?: string;
        latencyMs?: number;
      };
      if (pongPayload?.originalTs) {
        const latency = Date.now() - new Date(pongPayload.originalTs).getTime();
        console.log(`[pong] from ${from} — ${latency}ms round-trip`);
      } else {
        console.log(`[pong] from ${from}`);
      }
      break;
    }

    case "profile": {
      const profile = payload as {
        name?: string;
        bio?: string;
        skills?: string[];
      };
      console.log(
        `[profile] ${from}: ${profile?.name || "unknown"} — ${profile?.bio || "no bio"}`,
      );
      break;
    }

    case "skill_request": {
      console.log(`[skill_request] from ${from}:`, payload);
      break;
    }

    case "skill_response": {
      console.log(`[skill_response] from ${from}:`, payload);
      break;
    }

    default:
      console.log(`[unknown] type="${type}" from ${from}`);
  }
}

/**
 * Try to decode a raw message string as a Reef envelope.
 * Returns null if it's not a valid Reef message.
 */
export function tryDecodeReefMessage(raw: string): ReefEnvelope | null {
  try {
    return decodeEnvelope(raw);
  } catch {
    return null;
  }
}
