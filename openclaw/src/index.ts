/**
 * Reef Protocol channel plugin for OpenClaw.
 *
 * Bridges the Reef daemon (XMTP) ↔ OpenClaw agent loop by:
 *   - Watching ~/.reef/messages.json for new inbound messages
 *   - Dispatching them into the OpenClaw agent as channel messages
 *   - Auto-sending agent text responses back via the daemon HTTP API
 *
 * Structured app actions (game moves, proposals) are handled by the agent
 * via `reef apps send` bash commands — this plugin only handles text.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  decodeA2AMessage,
  isA2ARequest,
  encodeA2AMessage,
  textPart,
  createMessage,
  createSendMessageRequest,
  extractAppAction,
} from "@reef-protocol/protocol";
import type { InboxMessage } from "@reef-protocol/client/messages";
import { loadMessages } from "@reef-protocol/client/messages";
import { loadIdentity } from "@reef-protocol/client/identity";
import { sendViaDaemon } from "@reef-protocol/client/sender";
import {
  loadConfig as loadReefConfig,
  DEFAULT_MAX_TURNS,
} from "@reef-protocol/client/config";

// ---------------------------------------------------------------------------
// Runtime storage (set during plugin registration)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rt: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setRuntime(runtime: any): void {
  rt = runtime;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRuntime(): any {
  if (!rt) throw new Error("Reef runtime not initialized");
  return rt;
}

// ---------------------------------------------------------------------------
// Message text extraction
// ---------------------------------------------------------------------------

/**
 * Extract text parts from an array of A2A message parts.
 */
function extractParts(parts: Array<Record<string, unknown>>): string[] {
  const segments: string[] = [];

  for (const part of parts) {
    if (part.kind === "text" && typeof part.text === "string") {
      segments.push(part.text);
    } else if (part.kind === "data") {
      const appAction = extractAppAction(
        part as { kind: "data"; data: Record<string, unknown> },
      );
      if (appAction) {
        segments.push(
          `[app-action] ${appAction.appId}/${appAction.action}: ${JSON.stringify(appAction.payload)}`,
        );
      }
    }
  }

  return segments;
}

/**
 * Extract human-readable text from a raw A2A message string.
 *
 * Handles both:
 * - message/send requests → TextParts + DataParts (app actions)
 * - A2A responses (task results) → text from status.message.parts
 */
function extractText(raw: string): string {
  let decoded: Record<string, unknown> | null;
  try {
    decoded = decodeA2AMessage(raw);
  } catch {
    return raw;
  }
  if (!decoded) return raw;

  // Handle message/send requests
  if (isA2ARequest(decoded) && decoded.method === "message/send") {
    const params = decoded.params as {
      message?: { parts?: Array<Record<string, unknown>> };
    };
    const parts = params?.message?.parts;
    if (Array.isArray(parts) && parts.length > 0) {
      const segments = extractParts(parts);
      if (segments.length > 0) return segments.join("\n");
    }
    return raw;
  }

  // Handle A2A responses (task results with text parts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (decoded as any).result;
  if (result?.status?.message?.parts) {
    const parts = result.status.message.parts as Array<Record<string, unknown>>;
    const segments = extractParts(parts);
    if (segments.length > 0) return segments.join("\n");
  }

  return raw;
}

// ---------------------------------------------------------------------------
// Inbound message parsing (dispatch + turn tracking)
// ---------------------------------------------------------------------------

interface ParsedInbound {
  dispatch: boolean;
  role?: string;
  contextId?: string;
  taskId?: string;
  maxTurns?: number;
  terminalState?: boolean;
}

/**
 * Parse an inbound A2A message for dispatch decisions and turn tracking.
 *
 * - `message/send` with `role: "user"` or `role: "agent"` → dispatch: true
 * - JSON-RPC responses with terminal task states → terminalState: true
 * - Everything else → dispatch: false
 */
function parseInbound(raw: string): ParsedInbound {
  let decoded: Record<string, unknown> | null;
  try {
    decoded = decodeA2AMessage(raw);
  } catch {
    return { dispatch: true }; // plain text
  }
  if (!decoded) return { dispatch: true };

  // JSON-RPC responses may carry terminal task states → signal reset
  if (!isA2ARequest(decoded)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (decoded as any).result;
    const state = result?.status?.state;
    const isTerminal = ["completed", "failed", "canceled", "rejected"].includes(
      state,
    );
    return {
      dispatch: false,
      contextId: result?.contextId,
      taskId: result?.id,
      terminalState: isTerminal,
    };
  }

  // Only handle message/send
  if (decoded.method !== "message/send") return { dispatch: false };

  const params = decoded.params as {
    message?: {
      role?: string;
      contextId?: string;
      taskId?: string;
      metadata?: Record<string, unknown>;
    };
  };
  const msg = params?.message;
  if (!msg) return { dispatch: false };

  return {
    dispatch: msg.role === "user" || msg.role === "agent",
    role: msg.role,
    contextId: msg.contextId,
    taskId: msg.taskId,
    maxTurns:
      typeof msg.metadata?.maxTurns === "number"
        ? msg.metadata.maxTurns
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Plugin types
// ---------------------------------------------------------------------------

export interface ReefAccountConfig {
  enabled: boolean;
  configDir?: string;
}

interface ReefPluginConfig {
  channels?: {
    reef?: {
      accounts?: Record<string, ReefAccountConfig>;
      dmPolicy?: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Channel definition
// ---------------------------------------------------------------------------

const reefChannel = {
  id: "reef",

  meta: {
    id: "reef",
    label: "Reef Protocol",
    selectionLabel: "Reef Protocol (A2A agent messaging)",
    docsPath: "/channels/reef",
    blurb: "Agent-to-agent encrypted messaging over XMTP.",
    aliases: ["reef", "a2a", "xmtp"],
  },

  capabilities: {
    chatTypes: ["direct"],
  },

  config: {
    listAccountIds(cfg: ReefPluginConfig): string[] {
      const accounts = cfg?.channels?.reef?.accounts;
      if (!accounts) return [];
      return Object.keys(accounts).filter((k) => accounts[k]?.enabled);
    },

    resolveAccount(
      cfg: ReefPluginConfig,
      accountId?: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): any {
      return (
        cfg?.channels?.reef?.accounts?.[accountId ?? "default"] ?? {
          accountId,
        }
      );
    },
  },

  // -------------------------------------------------------------------------
  // Gateway — inbound message handling
  // -------------------------------------------------------------------------

  gateway: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    startAccount: async (ctx: any) => {
      const account = ctx.account;
      const configDir =
        account?.configDir ?? path.join(process.env.HOME || "~", ".reef");
      const messagesPath = path.join(configDir, "messages.json");

      // Load identity to filter out self-messages
      const identity = loadIdentity(configDir);
      if (!identity) {
        ctx.log?.warn?.(
          "[reef] No identity found — daemon not started yet. " +
            "Gateway will start watching once messages.json appears.",
        );
      }
      const ownAddress = identity?.address?.toLowerCase() ?? "";

      // Track last seen message ID so we only process new ones
      let lastSeenId: string | null = null;
      try {
        const existing = loadMessages(configDir);
        if (existing.length > 0) {
          lastSeenId = existing[existing.length - 1].id;
        }
      } catch {
        // messages.json might not exist yet
      }

      // Debounce timer for fs.watch events
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      // Per-conversation turn tracker (keyed by "peer:contextId")
      const IDLE_RESET_MS = 5 * 60 * 1000; // 5 minutes
      const turnTracker = new Map<
        string,
        { count: number; lastActivity: number }
      >();

      function getTurnKey(peer: string, contextId?: string): string {
        return `${peer}:${contextId ?? "default"}`;
      }

      function recordTurn(key: string): number {
        const entry = turnTracker.get(key);
        const now = Date.now();
        if (!entry || now - entry.lastActivity > IDLE_RESET_MS) {
          turnTracker.set(key, { count: 1, lastActivity: now });
          return 1;
        }
        entry.count += 1;
        entry.lastActivity = now;
        return entry.count;
      }

      function getTurnCount(key: string): number {
        const entry = turnTracker.get(key);
        if (!entry) return 0;
        if (Date.now() - entry.lastActivity > IDLE_RESET_MS) {
          turnTracker.delete(key);
          return 0;
        }
        return entry.count;
      }

      function resetTurns(key: string): void {
        turnTracker.delete(key);
      }

      const processNewMessages = async () => {
        let messages: InboxMessage[];
        try {
          messages = loadMessages(configDir);
        } catch {
          return; // File might be mid-write or missing
        }

        // Find new messages after lastSeenId
        let startIdx = 0;
        if (lastSeenId) {
          const idx = messages.findIndex((m) => m.id === lastSeenId);
          startIdx = idx >= 0 ? idx + 1 : 0;
        }

        const newMessages = messages.slice(startIdx);
        if (newMessages.length === 0) return;

        const runtime = getRuntime();
        const cfg = runtime.config.loadConfig();
        const accountId = ctx.accountId ?? "default";

        for (const msg of newMessages) {
          // Skip messages from ourselves
          if (msg.from.toLowerCase() === ownAddress) continue;

          // Parse the A2A message for dispatch + turn tracking info
          const parsed = parseInbound(msg.text);

          // Reset turn counter when a task reaches a terminal state
          if (parsed.terminalState && (parsed.contextId || parsed.taskId)) {
            const resetKey = getTurnKey(
              msg.from,
              parsed.contextId ?? parsed.taskId,
            );
            resetTurns(resetKey);
            ctx.log?.info?.(
              `[reef] task completed — reset turns for ${msg.from}`,
            );
          }

          if (!parsed.dispatch) continue;

          // Load maxTurns from Reef config
          const reefConfig = loadReefConfig(configDir);
          const configMax = reefConfig.maxTurns ?? DEFAULT_MAX_TURNS;
          const effectiveMax = parsed.maxTurns
            ? Math.min(parsed.maxTurns, configMax)
            : configMax;

          // Check turn limit for agent-role messages (circuit breaker)
          const turnKey = getTurnKey(msg.from, parsed.contextId);
          if (parsed.role === "agent") {
            const currentTurns = getTurnCount(turnKey);
            if (currentTurns >= effectiveMax) {
              ctx.log?.info?.(
                `[reef] max turns (${effectiveMax}) reached for ${msg.from} — skipping dispatch`,
              );
              continue;
            }
          }

          // Record this turn
          const turnNumber = recordTurn(turnKey);
          const text = extractText(msg.text);
          ctx.log?.info?.(
            `[reef] inbound from ${msg.from} (turn ${turnNumber}/${effectiveMax}): ${text.slice(0, 100)}`,
          );

          try {
            // 1. Resolve agent route for this sender
            const route = runtime.channel.routing.resolveAgentRoute({
              cfg,
              channel: "reef",
              accountId,
              peer: { kind: "direct" as const, id: msg.from },
            });

            // 2. Build and finalize inbound message context
            const storePath = runtime.channel.session.resolveStorePath(
              cfg.session?.store,
              { agentId: route.agentId },
            );
            const timestamp = msg.timestamp
              ? new Date(msg.timestamp).getTime()
              : Date.now();

            const ctxPayload = runtime.channel.reply.finalizeInboundContext({
              Body: text,
              BodyForAgent: text,
              RawBody: text,
              CommandBody: text,
              From: `reef:${msg.from}`,
              To: `reef:${msg.from}`,
              SessionKey: route.sessionKey,
              AccountId: accountId,
              ChatType: "direct",
              ConversationLabel: msg.from,
              SenderName: msg.from,
              SenderId: msg.from,
              Provider: "reef",
              Surface: "reef",
              MessageSid: msg.id,
              Timestamp: timestamp,
              WasMentioned: true,
              CommandAuthorized: true,
              OriginatingChannel: "reef",
              OriginatingTo: `reef:${msg.from}`,
            });

            // 3. Record inbound session for routing persistence
            await runtime.channel.session.recordInboundSession({
              storePath,
              sessionKey: route.sessionKey,
              ctx: ctxPayload,
              updateLastRoute: {
                sessionKey: route.mainSessionKey ?? route.sessionKey,
                channel: "reef",
                to: msg.from,
                accountId,
              },
              onRecordError: (err: unknown) => {
                ctx.log?.warn?.(`[reef] session record error: ${err}`);
              },
            });

            // 4. Record inbound activity + system event for gateway visibility
            runtime.channel.activity.record({
              channel: "reef",
              accountId,
              direction: "inbound",
            });
            runtime.system.enqueueSystemEvent(
              `[reef] inbound from ${msg.from} (turn ${turnNumber}/${effectiveMax}): ${text.slice(0, 200)}`,
              { sessionKey: route.sessionKey },
            );

            // 5. Dispatch into the agent loop with reply delivery
            await runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher(
              {
                ctx: ctxPayload,
                cfg,
                dispatcherOptions: {
                  deliver: async (payload: { text?: string }) => {
                    const responseText = payload.text;
                    if (!responseText) return;

                    // Encode as A2A message/send and relay via daemon.
                    // Role is "agent" — this is an agent response, not a user request.
                    // Thread contextId/taskId for multi-turn conversation tracking.
                    const encoded = encodeA2AMessage(
                      createSendMessageRequest(
                        createMessage("agent", [textPart(responseText)], {
                          contextId: parsed.contextId,
                          taskId: parsed.taskId,
                        }),
                      ) as unknown as Record<string, unknown>,
                    );
                    const sent = await sendViaDaemon(
                      msg.from,
                      encoded,
                      configDir,
                    );
                    if (!sent) {
                      ctx.log?.error?.(
                        "[reef] Failed to send reply — daemon not running",
                      );
                    }

                    runtime.channel.activity.record({
                      channel: "reef",
                      accountId,
                      direction: "outbound",
                    });
                    runtime.system.enqueueSystemEvent(
                      `[reef] outbound to ${msg.from}: ${responseText.slice(0, 200)}`,
                      { sessionKey: route.sessionKey },
                    );
                  },
                  onError: (err: unknown, info: { kind: string }) => {
                    ctx.log?.error?.(
                      `[reef] ${info.kind} reply failed: ${String(err)}`,
                    );
                  },
                },
              },
            );
          } catch (err) {
            ctx.log?.error?.(`[reef] dispatch error: ${err}`);
          }
        }

        // Update last seen to the latest message
        lastSeenId = messages[messages.length - 1].id;
      };

      // Watch messages.json for changes (debounced)
      let watcher: fs.FSWatcher | null = null;
      try {
        watcher = fs.watch(messagesPath, () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(processNewMessages, 300);
        });
      } catch {
        ctx.log?.warn?.(
          "[reef] messages.json not found yet — using poll-only mode",
        );
      }

      // Poll every 30s as fallback (fs.watch can miss events)
      const pollInterval = setInterval(processNewMessages, 30_000);

      ctx.log?.info?.(
        `[reef] gateway started — watching ${messagesPath} for inbound messages`,
      );

      return {
        stop: () => {
          watcher?.close();
          clearInterval(pollInterval);
          if (debounceTimer) clearTimeout(debounceTimer);
        },
      };
    },
  },

  // -------------------------------------------------------------------------
  // Outbound — send agent text responses as A2A messages
  // -------------------------------------------------------------------------

  outbound: {
    deliveryMode: "direct" as const,

    async sendText({
      to,
      text,
      account,
    }: {
      to: string;
      text: string;
      account: ReefAccountConfig;
    }): Promise<{ ok: boolean }> {
      const configDir =
        account?.configDir ?? path.join(process.env.HOME || "~", ".reef");

      // Pre-encode as A2A message/send
      const msg = createMessage("user", [textPart(text)]);
      const request = createSendMessageRequest(msg);
      const encoded = encodeA2AMessage(
        request as unknown as Record<string, unknown>,
      );

      const sent = await sendViaDaemon(to, encoded, configDir);
      if (!sent) {
        console.error(
          "[reef] Daemon is not running. Start it with: reef start --name <name>",
        );
        return { ok: false };
      }
      return { ok: true };
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin registration (Nostr-style plugin object)
// ---------------------------------------------------------------------------

const plugin = {
  id: "reef",
  name: "Reef Protocol",
  description:
    "Reef Protocol channel plugin for OpenClaw — receive and respond to A2A messages",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(api: any) {
    setRuntime(api.runtime);
    api.registerChannel({ plugin: reefChannel });
  },
};

export default plugin;
