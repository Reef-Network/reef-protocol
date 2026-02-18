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
import type {
  AppManifest,
  AppAction,
  AppActionMessage,
  ManifestComparisonResult,
} from "./types.js";

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

/** Build an AppAction */
export function buildAppAction(
  id: string,
  name: string,
  description: string,
  options?: {
    inputSchema?: Record<string, unknown>;
    roles?: string[];
  },
): AppAction {
  return {
    id,
    name,
    description,
    inputSchema: options?.inputSchema,
    roles: options?.roles,
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
    category?: string;
    coordinatorAddress?: string;
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
    category: options?.category,
    coordinatorAddress: options?.coordinatorAddress,
    actions,
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
): DataPart {
  return {
    kind: "data",
    data: { appId, action, payload },
  };
}

/** Extract an AppActionMessage from a DataPart, or null if not an app action */
export function extractAppAction(part: DataPart): AppActionMessage | null {
  const data = part.data as Record<string, unknown>;
  if (typeof data.appId === "string" && typeof data.action === "string") {
    return {
      appId: data.appId,
      action: data.action,
      payload: (data.payload as Record<string, unknown>) ?? {},
    };
  }
  return null;
}

/** Compare two manifests for P2P compatibility */
export function compareManifests(
  a: AppManifest,
  b: AppManifest,
): ManifestComparisonResult {
  const reasons: string[] = [];

  if (a.appId !== b.appId) {
    reasons.push(`appId mismatch: "${a.appId}" vs "${b.appId}"`);
  }

  if (a.version !== b.version) {
    reasons.push(`version mismatch: ${a.version} vs ${b.version}`);
  }

  const aActionIds = a.actions.map((act) => act.id).sort();
  const bActionIds = b.actions.map((act) => act.id).sort();
  if (JSON.stringify(aActionIds) !== JSON.stringify(bActionIds)) {
    reasons.push(
      `actions mismatch: [${aActionIds.join(", ")}] vs [${bActionIds.join(", ")}]`,
    );
  }

  if (a.minParticipants !== b.minParticipants) {
    reasons.push(
      `minParticipants mismatch: ${a.minParticipants} vs ${b.minParticipants}`,
    );
  }

  if (a.maxParticipants !== b.maxParticipants) {
    reasons.push(
      `maxParticipants mismatch: ${a.maxParticipants} vs ${b.maxParticipants}`,
    );
  }

  return { compatible: reasons.length === 0, reasons };
}
