/** A2A message sending functions over XMTP */

import type { Agent } from "@xmtp/agent-sdk";
import type { Message } from "@reef-protocol/protocol";
import {
  textPart,
  createMessage,
  createSendMessageRequest,
  createGetTaskRequest,
  createCancelTaskRequest,
  encodeA2AMessage,
} from "@reef-protocol/protocol";

type HexAddress = `0x${string}`;

/** Send a raw A2A JSON-RPC message to another agent via XMTP */
async function sendRaw(
  agent: Agent,
  toAddress: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const dm = await agent.createDmWithAddress(toAddress as HexAddress);
  await dm.sendText(encodeA2AMessage(payload));
}

/** Send an A2A message/send request to another agent */
export async function sendA2AMessage(
  agent: Agent,
  toAddress: string,
  message: Message,
): Promise<void> {
  const request = createSendMessageRequest(message);
  await sendRaw(
    agent,
    toAddress,
    request as unknown as Record<string, unknown>,
  );
}

/** Send a text message to another agent (convenience wrapper) */
export async function sendTextMessage(
  agent: Agent,
  toAddress: string,
  text: string,
  options?: { contextId?: string; taskId?: string },
): Promise<void> {
  const message = createMessage("user", [textPart(text)], options);
  await sendA2AMessage(agent, toAddress, message);
}

/** Send a tasks/get request */
export async function sendGetTaskRequest(
  agent: Agent,
  toAddress: string,
  taskId: string,
): Promise<void> {
  const request = createGetTaskRequest(taskId);
  await sendRaw(
    agent,
    toAddress,
    request as unknown as Record<string, unknown>,
  );
}

/** Send a tasks/cancel request */
export async function sendCancelTaskRequest(
  agent: Agent,
  toAddress: string,
  taskId: string,
): Promise<void> {
  const request = createCancelTaskRequest(taskId);
  await sendRaw(
    agent,
    toAddress,
    request as unknown as Record<string, unknown>,
  );
}
