/** Convenience builders for A2A messages, Agent Cards, and skills */

import { randomUUID } from "node:crypto";
import type {
  TextPart,
  Message,
  AgentCard,
  AgentSkill,
  SendMessageRequest,
  GetTaskRequest,
  CancelTaskRequest,
} from "@a2a-js/sdk";
import { A2A_PROTOCOL_VERSION, REEF_VERSION } from "./types.js";

/** Create a TextPart */
export function textPart(text: string): TextPart {
  return { kind: "text", text };
}

/** Create an A2A Message */
export function createMessage(
  role: "user" | "agent",
  parts: Message["parts"],
  options?: {
    messageId?: string;
    contextId?: string;
    taskId?: string;
  },
): Message {
  return {
    kind: "message",
    messageId: options?.messageId ?? randomUUID(),
    role,
    parts,
    contextId: options?.contextId,
    taskId: options?.taskId,
  };
}

/** Wrap a Message in a JSON-RPC `message/send` request */
export function createSendMessageRequest(
  message: Message,
  id?: string | number,
): SendMessageRequest {
  return {
    jsonrpc: "2.0",
    id: id ?? randomUUID(),
    method: "message/send",
    params: { message },
  };
}

/** Create a JSON-RPC `tasks/get` request */
export function createGetTaskRequest(
  taskId: string,
  id?: string | number,
): GetTaskRequest {
  return {
    jsonrpc: "2.0",
    id: id ?? randomUUID(),
    method: "tasks/get",
    params: { id: taskId },
  };
}

/** Create a JSON-RPC `tasks/cancel` request */
export function createCancelTaskRequest(
  taskId: string,
  id?: string | number,
): CancelTaskRequest {
  return {
    jsonrpc: "2.0",
    id: id ?? randomUUID(),
    method: "tasks/cancel",
    params: { id: taskId },
  };
}

/** Build a Reef AgentCard with XMTP transport */
export function buildReefAgentCard(
  address: string,
  name: string,
  description: string,
  skills: AgentSkill[],
): AgentCard {
  return {
    name,
    description,
    url: `xmtp://${address}`,
    version: REEF_VERSION,
    protocolVersion: A2A_PROTOCOL_VERSION,
    skills,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    preferredTransport: "XMTP",
  };
}

/** Build an AgentSkill */
export function buildSkill(
  id: string,
  name: string,
  description: string,
  tags: string[],
): AgentSkill {
  return { id, name, description, tags };
}
