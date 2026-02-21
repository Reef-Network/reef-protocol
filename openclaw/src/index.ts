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

import { randomUUID } from "node:crypto";
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
// Notification accumulator — batches A2A events for main session visibility
// ---------------------------------------------------------------------------

interface ReefEvent {
  type: "reply" | "app-action" | "outbound" | "terminal";
  peer: string;
  summary: string;
  timestamp: number;
}

function formatReefActivitySummary(events: ReefEvent[]): string {
  const byPeer = new Map<string, ReefEvent[]>();
  for (const e of events) {
    const list = byPeer.get(e.peer) ?? [];
    list.push(e);
    byPeer.set(e.peer, list);
  }

  const lines: string[] = ["[Reef activity]"];
  for (const [peer, peerEvents] of byPeer) {
    const short = peer.slice(0, 8);
    if (peerEvents.length === 1) {
      lines.push(`• ${short}: ${peerEvents[0].summary}`);
    } else {
      const summaries = peerEvents.map((e) => e.summary);
      lines.push(`• ${short}: ${summaries.join("; ")}`);
    }
  }
  return lines.join("\n");
}

class ReefNotificationAccumulator {
  private buffer: ReefEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;
  private readonly flush: (summary: string) => void;

  constructor(debounceMs: number, flush: (summary: string) => void) {
    this.debounceMs = debounceMs;
    this.flush = flush;
  }

  push(event: ReefEvent): void {
    this.buffer.push(event);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.doFlush(), this.debounceMs);
  }

  private doFlush(): void {
    if (this.buffer.length === 0) return;
    const events = this.buffer.splice(0);
    this.timer = null;
    this.flush(formatReefActivitySummary(events));
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.buffer = [];
  }
}

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
    return { dispatch: false }; // non-A2A plain text — ignore
  }
  if (!decoded) return { dispatch: false }; // not valid A2A — ignore

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

  messaging: {
    targetResolver: {
      hint: "Use an Ethereum address like 0x1234...abcd",
      looksLikeId(raw: string): boolean {
        return /^0x[0-9a-fA-F]{40}$/i.test(raw.trim());
      },
    },
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

      // Track processed message IDs so restarts never re-dispatch old messages
      const processedIds = new Set<string>();
      let lastSeenId: string | null = null;
      try {
        const existing = loadMessages(configDir);
        for (const m of existing) processedIds.add(m.id);
        if (existing.length > 0) {
          lastSeenId = existing[existing.length - 1].id;
        }
      } catch {
        // messages.json might not exist yet
      }

      // Concurrency guard — prevent overlapping processNewMessages calls
      let processing = false;

      // Debounce timer for fs.watch events
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      // Per-conversation turn tracker (keyed by "peer:contextId")
      const IDLE_RESET_MS = 5 * 60 * 1000; // 5 minutes
      const turnTracker = new Map<
        string,
        { count: number; lastActivity: number }
      >();

      // Circuit breaker log dedup — only log "max turns reached" once per peer
      const breakerLogged = new Set<string>();

      // Main session notifier — batches A2A events for human visibility
      let mainSessionKey: string | null = null;

      const notifier = new ReefNotificationAccumulator(5000, (summary) => {
        if (!mainSessionKey) return;
        const runtime = getRuntime();
        runtime.system.enqueueSystemEvent(summary, {
          sessionKey: mainSessionKey,
        });
      });

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
          breakerLogged.delete(key);
          return 0;
        }
        return entry.count;
      }

      function resetTurns(key: string): void {
        turnTracker.delete(key);
        breakerLogged.delete(key);
      }

      const processNewMessages = async () => {
        if (processing) return;
        processing = true;
        try {
          await processNewMessagesInner();
        } finally {
          processing = false;
        }
      };

      const processNewMessagesInner = async () => {
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
          if (idx < 0) {
            // lastSeenId not found — file may have been rewritten; skip this batch
            lastSeenId =
              messages.length > 0 ? messages[messages.length - 1].id : null;
            return;
          }
          startIdx = idx + 1;
        }

        const newMessages = messages.slice(startIdx);
        if (newMessages.length === 0) return;

        const runtime = getRuntime();
        const cfg = runtime.config.loadConfig();
        const accountId = ctx.accountId ?? "default";

        for (const msg of newMessages) {
          // Skip already-processed messages (survives gateway restarts)
          if (processedIds.has(msg.id)) continue;
          processedIds.add(msg.id);

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
            notifier.push({
              type: "terminal",
              peer: msg.from,
              summary: "conversation completed",
              timestamp: Date.now(),
            });
          }

          if (!parsed.dispatch) continue;

          // Load maxTurns from Reef config
          const reefConfig = loadReefConfig(configDir);
          const configMax = reefConfig.maxTurns ?? DEFAULT_MAX_TURNS;
          const effectiveMax = parsed.maxTurns
            ? Math.min(parsed.maxTurns, configMax)
            : configMax;

          // Check turn limit (circuit breaker applies to all roles)
          const turnKey = getTurnKey(msg.from, parsed.contextId);
          const currentTurns = getTurnCount(turnKey);
          if (currentTurns >= effectiveMax) {
            if (!breakerLogged.has(turnKey)) {
              ctx.log?.info?.(
                `[reef] max turns (${effectiveMax}) reached for ${msg.from} — future messages will be skipped`,
              );
              breakerLogged.add(turnKey);
            }
            continue;
          }

          // Record this turn
          const turnNumber = recordTurn(turnKey);
          const text = extractText(msg.text);
          const isAppAction = text.startsWith("[app-action]");

          // Dispatch policy based on role and content type:
          // - role="user" text → full dispatch + deliver (it's a request)
          // - role="agent" text → dispatch (agent sees reply) but NO deliver
          //   (protocol-level enforcement prevents ping-pong)
          // - app-action (any role) → dispatch but NO deliver
          //   (agent responds via `reef apps send`, not text)
          const suppressDeliver = isAppAction;

          // Frame agent replies so the agent can present them to the human
          const bodyForAgent =
            parsed.role === "agent" && !isAppAction
              ? `[Reef reply from ${msg.from}]:\n${text}`
              : text;

          ctx.log?.info?.(
            `[reef] inbound from ${msg.from} [${parsed.role ?? "unknown"}] (turn ${turnNumber}/${effectiveMax}): ${text.slice(0, 100)}`,
          );

          try {
            // 1. Resolve agent route for this sender
            const route = runtime.channel.routing.resolveAgentRoute({
              cfg,
              channel: "reef",
              accountId,
              peer: { kind: "direct" as const, id: msg.from },
            });

            // Capture main session key for human-facing notifications
            if (!mainSessionKey) {
              mainSessionKey = route.mainSessionKey ?? route.sessionKey;
            }

            // 2. Build and finalize inbound message context
            const storePath = runtime.channel.session.resolveStorePath(
              cfg.session?.store,
              { agentId: route.agentId },
            );
            const timestamp = msg.timestamp
              ? new Date(msg.timestamp).getTime()
              : Date.now();

            // Agent text replies are notification-only — enqueue as system event
            // on the main session so the human sees them, but do NOT dispatch
            // (dispatching triggers a full agent run that can loop via reef send).
            const isAgentReply = parsed.role === "agent" && !isAppAction;
            if (isAgentReply) {
              const mainKey = route.mainSessionKey ?? route.sessionKey;
              runtime.system.enqueueSystemEvent(
                `[Reef reply from ${msg.from}]:\n${text}`,
                { sessionKey: mainKey },
              );
              notifier.push({
                type: "reply",
                peer: msg.from,
                summary: `replied: "${text.slice(0, 80)}${text.length > 80 ? "\u2026" : ""}"`,
                timestamp: Date.now(),
              });
              continue;
            }

            const sessionKey = route.sessionKey;

            const ctxPayload = runtime.channel.reply.finalizeInboundContext({
              Body: bodyForAgent,
              BodyForAgent: bodyForAgent,
              RawBody: text,
              CommandBody: bodyForAgent,
              From: `reef:${msg.from}`,
              To: `reef:${msg.from}`,
              SessionKey: sessionKey,
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
              sessionKey,
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
                    // Protocol-level suppression: agent replies and app-actions
                    // are dispatched (agent sees them) but deliver is suppressed
                    // to prevent ping-pong loops and dual delivery.
                    if (suppressDeliver) return;

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
                    } else {
                      ctx.log?.info?.(
                        `[reef] outbound to ${msg.from}: ${responseText.slice(0, 100)}`,
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
                    notifier.push({
                      type: "outbound",
                      peer: msg.from,
                      summary: `you replied: "${responseText.slice(0, 60)}${responseText.length > 60 ? "\u2026" : ""}"`,
                      timestamp: Date.now(),
                    });
                  },
                  onError: (err: unknown, info: { kind: string }) => {
                    ctx.log?.error?.(
                      `[reef] ${info.kind} reply failed: ${String(err)}`,
                    );
                  },
                },
              },
            );

            // Notify main session about app-action activity
            if (isAppAction) {
              notifier.push({
                type: "app-action",
                peer: msg.from,
                summary: text.replace("[app-action] ", ""),
                timestamp: Date.now(),
              });
            }
          } catch (err) {
            ctx.log?.error?.(`[reef] dispatch error: ${err}`);
          }
        }

        // Update last seen to the latest message
        lastSeenId = messages[messages.length - 1].id;

        // Cap processedIds to prevent unbounded growth
        if (processedIds.size > 2000) {
          const ids = Array.from(processedIds);
          for (let i = 0; i < ids.length - 1000; i++) {
            processedIds.delete(ids[i]);
          }
        }
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

      // Keep this account alive until OpenClaw signals abort.
      // If startAccount resolves, OpenClaw treats the channel as "stopped"
      // and triggers an auto-restart loop.
      await new Promise<void>((resolve) => {
        const abort: AbortSignal | undefined = ctx.abortSignal;
        if (abort) {
          abort.addEventListener("abort", () => {
            watcher?.close();
            clearInterval(pollInterval);
            if (debounceTimer) clearTimeout(debounceTimer);
            notifier.destroy();
            resolve();
          });
        }
      });
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

      // Pre-encode as A2A message/send with a unique contextId
      // so turn tracking can separate independent conversations.
      const msg = createMessage("user", [textPart(text)], {
        contextId: randomUUID(),
      });
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
      console.log(`[reef] outbound to ${to}: ${text.slice(0, 100)}`);
      return { ok: true };
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin registration (Nostr-style plugin object)
// ---------------------------------------------------------------------------

const plugin = {
  id: "reef-openclaw",
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
