/** App-aware message routing with P2P manifest handshake */

import { randomUUID } from "node:crypto";
import type { Message, Task, DataPart } from "@a2a-js/sdk";
import type { AppManifest, AppActionMessage } from "@reef-protocol/protocol";
import {
  extractAppAction,
  compareManifests,
  buildAppActionDataPart,
  textPart,
  getWellKnownManifest,
} from "@reef-protocol/protocol";

/** Handler for a specific app's actions */
export interface AppHandler {
  appId: string;
  manifest: AppManifest;
  handleAction(
    action: string,
    payload: Record<string, unknown>,
    message: Message,
  ): Promise<Message | Task>;
}

/** Tracks an agreed P2P session with a peer */
interface PeerSession {
  agreedAt: Date;
  peerManifest: AppManifest;
}

/**
 * Router that maps appId -> AppHandler, handles P2P manifest negotiation,
 * and dispatches incoming app actions to the correct handler.
 */
export class AppRouter {
  private handlers = new Map<string, AppHandler>();
  private peerSessions = new Map<string, PeerSession>();

  /** Register an app handler */
  register(handler: AppHandler): void {
    this.handlers.set(handler.appId, handler);
  }

  /** Unregister an app handler */
  unregister(appId: string): boolean {
    return this.handlers.delete(appId);
  }

  /** Get a registered handler */
  get(appId: string): AppHandler | undefined {
    return this.handlers.get(appId);
  }

  /** List all registered app IDs */
  listApps(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Register a well-known app by its canonical appId.
   * Agents only need to provide their game logic handler.
   * Returns true if registered, false if appId is not well-known.
   */
  loadWellKnown(
    appId: string,
    handleAction: (
      action: string,
      payload: Record<string, unknown>,
      message: Message,
    ) => Promise<Message | Task>,
  ): boolean {
    const manifest = getWellKnownManifest(appId);
    if (!manifest) return false;

    this.register({ appId, manifest, handleAction });
    return true;
  }

  /** Check if a P2P handshake has been completed with a peer for an app */
  isNegotiated(appId: string, peerAddress: string): boolean {
    return this.peerSessions.has(`${appId}:${peerAddress}`);
  }

  /** Build a _handshake message to initiate P2P negotiation */
  buildHandshakeMessage(appId: string): Message | null {
    const handler = this.handlers.get(appId);
    if (!handler) return null;

    return {
      kind: "message",
      messageId: randomUUID(),
      role: "user",
      parts: [
        buildAppActionDataPart(appId, "_handshake", {
          manifest: handler.manifest as unknown as Record<string, unknown>,
        }),
      ],
    };
  }

  /**
   * Route an incoming message to the appropriate app handler.
   * Handles handshake protocol automatically for P2P apps.
   * Returns null if no DataPart with appId is found.
   */
  async route(
    message: Message,
    fromAddress: string,
  ): Promise<{ result: Message | Task; appAction: AppActionMessage } | null> {
    for (const part of message.parts) {
      if (part.kind !== "data") continue;

      const appAction = extractAppAction(part as DataPart);
      if (!appAction) continue;

      const handler = this.handlers.get(appAction.appId);

      // Handshake protocol — handled by the router, not the app handler
      if (appAction.action === "_handshake") {
        return this.handleHandshake(appAction, fromAddress, handler);
      }

      if (appAction.action === "_handshake-ack") {
        return this.handleHandshakeAck(appAction, fromAddress);
      }

      if (appAction.action === "_handshake-reject") {
        return {
          result: this.makeTask(
            "failed",
            `Handshake rejected: ${JSON.stringify(appAction.payload.reasons ?? [])}`,
          ),
          appAction,
        };
      }

      // Regular actions — require handler and completed handshake
      if (!handler) continue;

      const sessionKey = `${appAction.appId}:${fromAddress}`;
      if (!this.peerSessions.has(sessionKey)) {
        return {
          result: this.makeTask(
            "failed",
            `Handshake required before sending actions for "${appAction.appId}"`,
          ),
          appAction,
        };
      }

      const result = await handler.handleAction(
        appAction.action,
        appAction.payload,
        message,
      );
      return { result, appAction };
    }

    return null;
  }

  private handleHandshake(
    appAction: AppActionMessage,
    fromAddress: string,
    handler: AppHandler | undefined,
  ): { result: Message | Task; appAction: AppActionMessage } {
    if (!handler) {
      return {
        result: this.makeResponseMessage(appAction.appId, "_handshake-reject", {
          reasons: [`app "${appAction.appId}" is not supported by this agent`],
        }),
        appAction,
      };
    }

    const peerManifest = appAction.payload.manifest as unknown as AppManifest;
    if (!peerManifest) {
      return {
        result: this.makeResponseMessage(appAction.appId, "_handshake-reject", {
          reasons: ["missing manifest in handshake payload"],
        }),
        appAction,
      };
    }

    const comparison = compareManifests(handler.manifest, peerManifest);

    if (!comparison.compatible) {
      return {
        result: this.makeResponseMessage(appAction.appId, "_handshake-reject", {
          reasons: comparison.reasons,
        }),
        appAction,
      };
    }

    // Store agreed session
    const sessionKey = `${appAction.appId}:${fromAddress}`;
    this.peerSessions.set(sessionKey, {
      agreedAt: new Date(),
      peerManifest,
    });

    return {
      result: this.makeResponseMessage(appAction.appId, "_handshake-ack", {
        manifest: handler.manifest as unknown as Record<string, unknown>,
      }),
      appAction,
    };
  }

  private handleHandshakeAck(
    appAction: AppActionMessage,
    fromAddress: string,
  ): { result: Message | Task; appAction: AppActionMessage } {
    const peerManifest = appAction.payload.manifest as unknown as AppManifest;
    if (peerManifest) {
      const sessionKey = `${appAction.appId}:${fromAddress}`;
      this.peerSessions.set(sessionKey, {
        agreedAt: new Date(),
        peerManifest,
      });
    }

    return {
      result: this.makeTask(
        "completed",
        `Handshake completed for "${appAction.appId}"`,
      ),
      appAction,
    };
  }

  private makeTask(state: "completed" | "failed", statusMessage: string): Task {
    return {
      kind: "task",
      id: randomUUID(),
      contextId: randomUUID(),
      status: {
        state,
        timestamp: new Date().toISOString(),
        message: {
          kind: "message",
          messageId: randomUUID(),
          role: "agent",
          parts: [textPart(statusMessage)],
        },
      },
    };
  }

  private makeResponseMessage(
    appId: string,
    action: string,
    payload: Record<string, unknown>,
  ): Message {
    return {
      kind: "message",
      messageId: randomUUID(),
      role: "agent",
      parts: [buildAppActionDataPart(appId, action, payload)],
    };
  }
}
