/** Convenience builders for A2A messages, Agent Cards, skills, and apps */

import { randomUUID } from "node:crypto";
import type {
  TextPart,
  DataPart,
  Message,
  AgentCard,
  AgentSkill,
  SendMessageRequest,
  GetTaskRequest,
  CancelTaskRequest,
} from "@a2a-js/sdk";
import { A2A_PROTOCOL_VERSION, REEF_VERSION } from "./types.js";
import type { AppManifest, AppAction, AppActionMessage } from "./types.js";

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
  options?: { iconUrl?: string; fundingAddress?: string },
): AgentCard {
  const card: AgentCard = {
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
  if (options?.iconUrl) {
    (card as unknown as Record<string, unknown>).iconUrl = options.iconUrl;
  }
  if (options?.fundingAddress) {
    (card as unknown as Record<string, unknown>).fundingAddress =
      options.fundingAddress;
  }
  return card;
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

/** Build an AppAction */
export function buildAppAction(
  id: string,
  name: string,
  description: string,
  options?: {
    inputSchema?: Record<string, unknown>;
    roles?: string[];
    terminal?: boolean;
  },
): AppAction {
  return {
    id,
    name,
    description,
    inputSchema: options?.inputSchema,
    roles: options?.roles,
    terminal: options?.terminal,
  };
}

/** Build an AppManifest */
export function buildAppManifest(
  appId: string,
  name: string,
  description: string,
  actions: AppAction[],
  options?: {
    version?: string;
    type?: "p2p" | "coordinated";
    category?: string;
    iconUrl?: string;
    coordinatorAddress?: string;
    rules?: string;
    stateSchema?: Record<string, unknown>;
    minParticipants?: number;
    maxParticipants?: number;
  },
): AppManifest {
  return {
    appId,
    name,
    description,
    version: options?.version ?? REEF_VERSION,
    type: options?.type ?? "p2p",
    category: options?.category,
    iconUrl: options?.iconUrl,
    coordinatorAddress: options?.coordinatorAddress,
    actions,
    rules: options?.rules,
    stateSchema: options?.stateSchema,
    minParticipants: options?.minParticipants ?? 2,
    maxParticipants: options?.maxParticipants,
  };
}

/** Build a DataPart that carries an app action */
export function buildAppActionDataPart(
  appId: string,
  action: string,
  payload: Record<string, unknown> = {},
  options?: { terminal?: boolean },
): DataPart {
  const data: Record<string, unknown> = { appId, action, payload };
  if (options?.terminal) {
    data.terminal = true;
  }
  return {
    kind: "data",
    data,
  };
}

/** Extract an AppActionMessage from a DataPart, or null if not an app action */
export function extractAppAction(part: DataPart): AppActionMessage | null {
  const data = part.data as Record<string, unknown>;
  if (typeof data.appId === "string" && typeof data.action === "string") {
    const result: AppActionMessage = {
      appId: data.appId,
      action: data.action,
      payload: (data.payload as Record<string, unknown>) ?? {},
    };
    if (data.terminal === true) {
      result.terminal = true;
    }
    return result;
  }
  return null;
}
