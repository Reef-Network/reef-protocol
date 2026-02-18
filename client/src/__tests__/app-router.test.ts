import { describe, it, expect, vi } from "vitest";
import { AppRouter, type AppHandler } from "../app-router.js";
import type { Message, Task } from "@a2a-js/sdk";
import {
  buildAppManifest,
  buildAppAction,
  buildAppActionDataPart,
  textPart,
  TTT_MANIFEST,
} from "@reef-protocol/protocol";

function createTestHandler(appId: string): AppHandler {
  const manifest = buildAppManifest(appId, "Test App", "A test app", [
    buildAppAction("test-action", "Test", "A test action"),
  ]);

  return {
    appId,
    manifest,
    handleAction: vi.fn(
      async (_action, _payload, _message): Promise<Task> => ({
        kind: "task",
        id: `task-${appId}`,
        contextId: "ctx-1",
        status: { state: "completed", timestamp: new Date().toISOString() },
      }),
    ),
  };
}

function makeMessage(parts: Message["parts"]): Message {
  return { kind: "message", messageId: "msg-1", role: "user", parts };
}

describe("AppRouter", () => {
  it("registers and retrieves a handler", () => {
    const router = new AppRouter();
    const handler = createTestHandler("chess");
    router.register(handler);
    expect(router.get("chess")).toBe(handler);
    expect(router.listApps()).toEqual(["chess"]);
  });

  it("unregisters a handler", () => {
    const router = new AppRouter();
    router.register(createTestHandler("chess"));
    expect(router.unregister("chess")).toBe(true);
    expect(router.get("chess")).toBeUndefined();
    expect(router.unregister("chess")).toBe(false);
  });

  it("returns null for text-only messages", async () => {
    const router = new AppRouter();
    router.register(createTestHandler("chess"));
    const result = await router.route(
      makeMessage([textPart("Hello")]),
      "0xPeer",
    );
    expect(result).toBeNull();
  });

  it("returns null for unregistered app IDs", async () => {
    const router = new AppRouter();
    router.register(createTestHandler("chess"));
    const msg = makeMessage([buildAppActionDataPart("unknown-app", "foo")]);
    const result = await router.route(msg, "0xPeer");
    expect(result).toBeNull();
  });

  it("returns null for DataParts without appId", async () => {
    const router = new AppRouter();
    router.register(createTestHandler("chess"));
    const msg = makeMessage([{ kind: "data", data: { someKey: "value" } }]);
    const result = await router.route(msg, "0xPeer");
    expect(result).toBeNull();
  });
});

describe("AppRouter handshake", () => {
  it("accepts handshake with compatible manifest", async () => {
    const router = new AppRouter();
    const handler = createTestHandler("chess");
    router.register(handler);

    const peerManifest = { ...handler.manifest };
    const msg = makeMessage([
      buildAppActionDataPart("chess", "_handshake", {
        manifest: peerManifest as unknown as Record<string, unknown>,
      }),
    ]);

    const result = await router.route(msg, "0xPeer");
    expect(result).not.toBeNull();
    expect(result!.appAction.action).toBe("_handshake");

    // Should respond with _handshake-ack
    const response = result!.result as Message;
    expect(response.kind).toBe("message");
    const dataPart = response.parts[0] as {
      kind: string;
      data: Record<string, unknown>;
    };
    expect(dataPart.data.action).toBe("_handshake-ack");

    // Session should be established
    expect(router.isNegotiated("chess", "0xPeer")).toBe(true);
  });

  it("rejects handshake with incompatible manifest", async () => {
    const router = new AppRouter();
    const handler = createTestHandler("chess");
    router.register(handler);

    const peerManifest = { ...handler.manifest, version: "99.0.0" };
    const msg = makeMessage([
      buildAppActionDataPart("chess", "_handshake", {
        manifest: peerManifest as unknown as Record<string, unknown>,
      }),
    ]);

    const result = await router.route(msg, "0xBadPeer");
    expect(result).not.toBeNull();

    const response = result!.result as Message;
    const dataPart = response.parts[0] as {
      kind: string;
      data: Record<string, unknown>;
    };
    expect(dataPart.data.action).toBe("_handshake-reject");
    expect(router.isNegotiated("chess", "0xBadPeer")).toBe(false);
  });

  it("rejects handshake for unsupported app", async () => {
    const router = new AppRouter();
    // No handler registered

    const msg = makeMessage([
      buildAppActionDataPart("chess", "_handshake", {
        manifest: {} as Record<string, unknown>,
      }),
    ]);

    const result = await router.route(msg, "0xPeer");
    expect(result).not.toBeNull();
    const response = result!.result as Message;
    const dataPart = response.parts[0] as {
      kind: string;
      data: Record<string, unknown>;
    };
    expect(dataPart.data.action).toBe("_handshake-reject");
  });

  it("rejects real actions before handshake", async () => {
    const router = new AppRouter();
    router.register(createTestHandler("chess"));

    const msg = makeMessage([
      buildAppActionDataPart("chess", "move", { from: "e2", to: "e4" }),
    ]);

    const result = await router.route(msg, "0xNoHandshake");
    expect(result).not.toBeNull();
    const task = result!.result as Task;
    expect(task.status.state).toBe("failed");
  });

  it("allows real actions after handshake", async () => {
    const router = new AppRouter();
    const handler = createTestHandler("chess");
    router.register(handler);

    // Complete handshake first
    const handshakeMsg = makeMessage([
      buildAppActionDataPart("chess", "_handshake", {
        manifest: handler.manifest as unknown as Record<string, unknown>,
      }),
    ]);
    await router.route(handshakeMsg, "0xAgreedPeer");

    // Now send a real action
    const actionMsg = makeMessage([
      buildAppActionDataPart("chess", "move", { from: "e2", to: "e4" }),
    ]);
    const result = await router.route(actionMsg, "0xAgreedPeer");

    expect(result).not.toBeNull();
    expect(result!.appAction.action).toBe("move");
    expect(handler.handleAction).toHaveBeenCalledWith(
      "move",
      { from: "e2", to: "e4" },
      actionMsg,
    );
  });

  it("builds a handshake message", () => {
    const router = new AppRouter();
    const handler = createTestHandler("chess");
    router.register(handler);

    const msg = router.buildHandshakeMessage("chess");
    expect(msg).not.toBeNull();
    expect(msg!.parts).toHaveLength(1);
    const dataPart = msg!.parts[0] as {
      kind: string;
      data: Record<string, unknown>;
    };
    expect(dataPart.data.appId).toBe("chess");
    expect(dataPart.data.action).toBe("_handshake");
  });

  it("returns null for handshake of unregistered app", () => {
    const router = new AppRouter();
    const msg = router.buildHandshakeMessage("unknown");
    expect(msg).toBeNull();
  });
});

describe("AppRouter.loadWellKnown", () => {
  it("registers a well-known app with a custom handler", () => {
    const router = new AppRouter();
    const handleAction = vi.fn(
      async (): Promise<Task> => ({
        kind: "task",
        id: "task-ttt",
        contextId: "ctx-1",
        status: { state: "completed", timestamp: new Date().toISOString() },
      }),
    );

    const result = router.loadWellKnown("tic-tac-toe", handleAction);
    expect(result).toBe(true);

    const handler = router.get("tic-tac-toe");
    expect(handler).toBeDefined();
    expect(handler!.manifest).toBe(TTT_MANIFEST);
    expect(handler!.appId).toBe("tic-tac-toe");
  });

  it("returns false for unknown app IDs", () => {
    const router = new AppRouter();
    const result = router.loadWellKnown("nonexistent", vi.fn());
    expect(result).toBe(false);
    expect(router.listApps()).toEqual([]);
  });

  it("enables handshake between two agents using the same canonical manifest", async () => {
    const routerA = new AppRouter();
    const routerB = new AppRouter();

    routerA.loadWellKnown("tic-tac-toe", vi.fn());
    routerB.loadWellKnown("tic-tac-toe", vi.fn());

    // Agent A initiates handshake
    const handshakeMsg = routerA.buildHandshakeMessage("tic-tac-toe");
    expect(handshakeMsg).not.toBeNull();

    // Agent B receives and accepts
    const ackResult = await routerB.route(handshakeMsg!, "0xAgentA");
    expect(ackResult).not.toBeNull();
    const ackResponse = ackResult!.result as Message;
    const ackData = ackResponse.parts[0] as {
      kind: string;
      data: Record<string, unknown>;
    };
    expect(ackData.data.action).toBe("_handshake-ack");
    expect(routerB.isNegotiated("tic-tac-toe", "0xAgentA")).toBe(true);

    // Agent A receives the ack
    const ackProcessed = await routerA.route(ackResponse, "0xAgentB");
    expect(ackProcessed).not.toBeNull();
    expect(routerA.isNegotiated("tic-tac-toe", "0xAgentB")).toBe(true);
  });
});
