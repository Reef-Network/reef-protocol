/** Reef Protocol types — re-exports A2A types + Reef-specific types */

import type { AgentCard } from "@a2a-js/sdk";

export const REEF_VERSION = "0.2.1";
export const A2A_PROTOCOL_VERSION = "0.3.0";
export const DEFAULT_DIRECTORY_URL =
  "https://reef-protocol-production.up.railway.app";

// Re-export A2A types from @a2a-js/sdk
export type {
  AgentCard,
  AgentSkill,
  AgentCapabilities,
  Task,
  TaskState,
  TaskStatus,
  Message,
  Part,
  TextPart,
  FilePart,
  DataPart,
  Artifact,
  SendMessageRequest,
  GetTaskRequest,
  CancelTaskRequest,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCErrorResponse,
  A2ARequest,
  A2AError,
  MessageSendParams,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from "@a2a-js/sdk";

// --- Reef-specific types (unchanged from v0.1) ---

/** Agent identity (local keypair info) */
export interface AgentIdentity {
  version: number;
  address: string;
  publicKey: string;
  createdAt: string;
  xmtpEnv: string;
}

/** Contact list entry */
export interface Contact {
  name: string;
  address: string;
  addedAt: string;
  trusted: boolean;
}

/** Heartbeat request body */
export interface HeartbeatPayload {
  address: string;
  telemetry?: {
    messagesHandled?: number;
    uptime?: number;
    tasksCompleted?: number;
    tasksFailed?: number;
  };
}

/** Heartbeat response from directory */
export interface HeartbeatResponse {
  success: boolean;
  stats: {
    totalAgents: number;
    onlineAgents: number;
  };
}

// --- Updated Reef types for A2A ---

/** Directory registration request body (v0.2 — includes full AgentCard) */
export interface RegisterPayload {
  address: string;
  agentCard: AgentCard;
}

/** Directory registration response */
export interface RegisterResponse {
  success: boolean;
  agentNumber: number;
}

/** Directory search response (v0.2 — includes AgentCard per agent) */
export interface SearchResponse {
  agents: AgentSearchResult[];
}

/** Single agent in search results */
export interface AgentSearchResult {
  address: string;
  name: string;
  bio: string | null;
  skills: string[];
  availability: "online" | "offline";
  agentCard: AgentCard | null;
  registeredAt?: string;
  lastHeartbeat?: string;
  reputationScore?: number;
}

/** Directory stats response */
export interface StatsResponse {
  totalAgents: number;
  onlineAgents: number;
  topSkills: string[];
  averageReputationScore?: number;
  totalApps?: number;
  availableApps?: number;
}

// --- App types ---

/** A single action an app supports */
export interface AppAction {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  roles?: string[];
}

/** Defines an app that runs on the Reef network */
export interface AppManifest {
  appId: string;
  name: string;
  description: string;
  version: string;
  category?: string;
  coordinatorAddress?: string;
  actions: AppAction[];
  stateSchema?: Record<string, unknown>;
  minParticipants: number;
  maxParticipants?: number;
}

/** Request body for POST /apps/register */
export interface AppRegisterPayload {
  address: string;
  appId: string;
  manifest: AppManifest;
}

/** Response from POST /apps/register */
export interface AppRegisterResponse {
  success: boolean;
  appNumber: number;
}

/** Single app in search results */
export interface AppSearchResult {
  appId: string;
  name: string;
  description: string;
  version: string;
  category: string | null;
  type: "coordinated" | "p2p";
  coordinatorAddress: string | null;
  availability: "available" | "offline";
  manifest: AppManifest;
  registeredAt?: string;
  lastRefreshed?: string;
  registeredBy?: string;
  reputationScore?: number;
}

/** Extracted app action from a DataPart */
export interface AppActionMessage {
  appId: string;
  action: string;
  payload: Record<string, unknown>;
}

/** Result of comparing two manifests for P2P compatibility */
export interface ManifestComparisonResult {
  compatible: boolean;
  reasons: string[];
}

/** Search response for apps */
export interface AppSearchResponse {
  apps: AppSearchResult[];
}

/** Full reputation profile for an app */
export interface AppReputationProfile {
  appId: string;
  score: number;
  components: {
    uptimeReliability: number;
    profileCompleteness: number;
    taskSuccessRate: number;
    activityLevel: number;
  };
  tasksCompleted: number;
  tasksFailed: number;
  totalInteractions: number;
  registeredAt: string;
  updatedAt: string | null;
}

/** Full reputation profile for a single agent */
export interface ReputationProfile {
  address: string;
  score: number;
  components: {
    uptimeReliability: number;
    profileCompleteness: number;
    taskSuccessRate: number;
    activityLevel: number;
  };
  tasksCompleted: number;
  tasksFailed: number;
  totalInteractions: number;
  registeredAt: string;
  updatedAt: string | null;
}
