import type { Agent } from "@xmtp/agent-sdk";
import { encodeEnvelope, type MessageType } from "@reef-protocol/protocol";

type HexAddress = `0x${string}`;

/**
 * Send a Reef-encoded message to another agent.
 */
export async function sendReefMessage(
  agent: Agent,
  toAddress: string,
  type: MessageType,
  payload: unknown,
  fromAddress: string,
): Promise<void> {
  const envelope = encodeEnvelope(type, fromAddress, payload);
  const dm = await agent.createDmWithAddress(toAddress as HexAddress);
  await dm.sendText(envelope);
}

/**
 * Send a text message (convenience wrapper).
 */
export async function sendTextMessage(
  agent: Agent,
  toAddress: string,
  text: string,
  fromAddress: string,
): Promise<void> {
  await sendReefMessage(agent, toAddress, "text", { text }, fromAddress);
}
