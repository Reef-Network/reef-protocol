import { z } from "zod";

// --- A2A Part schemas ---

export const textPartSchema = z.object({
  kind: z.literal("text"),
  text: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export const filePartSchema = z.object({
  kind: z.literal("file"),
  file: z.union([
    z.object({
      bytes: z.string(),
      mimeType: z.string().optional(),
      name: z.string().optional(),
    }),
    z.object({
      uri: z.string(),
      mimeType: z.string().optional(),
      name: z.string().optional(),
    }),
  ]),
  metadata: z.record(z.unknown()).optional(),
});

export const dataPartSchema = z.object({
  kind: z.literal("data"),
  data: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
});

export const partSchema = z.discriminatedUnion("kind", [
  textPartSchema,
  filePartSchema,
  dataPartSchema,
]);

// --- A2A Message schema ---

export const a2aMessageSchema = z.object({
  kind: z.literal("message"),
  messageId: z.string().min(1),
  role: z.enum(["user", "agent"]),
  parts: z.array(partSchema).min(1),
  contextId: z.string().optional(),
  taskId: z.string().optional(),
  referenceTaskIds: z.array(z.string()).optional(),
  extensions: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// --- A2A Task schemas ---

export const taskStatusSchema = z.object({
  state: z.enum([
    "submitted",
    "working",
    "input-required",
    "completed",
    "canceled",
    "failed",
    "rejected",
    "auth-required",
    "unknown",
  ]),
  message: a2aMessageSchema.optional(),
  timestamp: z.string().optional(),
});

export const artifactSchema = z.object({
  artifactId: z.string().min(1),
  parts: z.array(partSchema).min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  extensions: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const taskSchema = z.object({
  kind: z.literal("task"),
  id: z.string().min(1),
  contextId: z.string().min(1),
  status: taskStatusSchema,
  artifacts: z.array(artifactSchema).optional(),
  history: z.array(a2aMessageSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// --- A2A AgentCard schemas ---

export const agentSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()).optional(),
  inputModes: z.array(z.string()).optional(),
  outputModes: z.array(z.string()).optional(),
});

export const agentCardSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  url: z.string().min(1),
  version: z.string(),
  protocolVersion: z.string(),
  skills: z.array(agentSkillSchema),
  capabilities: z.object({
    streaming: z.boolean().optional(),
    pushNotifications: z.boolean().optional(),
    stateTransitionHistory: z.boolean().optional(),
  }),
  defaultInputModes: z.array(z.string()),
  defaultOutputModes: z.array(z.string()),
  preferredTransport: z.string().optional(),
  provider: z
    .object({
      organization: z.string(),
      url: z.string(),
    })
    .optional(),
});

// --- Reef-specific schemas (kept/updated) ---

/** Registration payload — now includes full AgentCard */
export const registerPayloadSchema = z.object({
  address: z.string().min(1),
  agentCard: agentCardSchema,
});

/** Heartbeat request schema */
export const heartbeatPayloadSchema = z.object({
  address: z.string().min(1),
  telemetry: z
    .object({
      messagesHandled: z.number().optional(),
      uptime: z.number().optional(),
    })
    .optional(),
});

/** Contact schema */
export const contactSchema = z.object({
  name: z.string(),
  address: z.string().min(1),
  addedAt: z.string(),
  trusted: z.boolean(),
});

/** Validate a registration payload */
export function validateRegistration(data: unknown) {
  return registerPayloadSchema.parse(data);
}
