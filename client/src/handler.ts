/** A2A JSON-RPC request handler over XMTP */

import type { Agent } from "@xmtp/agent-sdk";
import type { Message, Task } from "@a2a-js/sdk";
import type { TaskStore } from "@a2a-js/sdk/server";
import {
  decodeA2AMessage,
  isA2ARequest,
  isA2AResponse,
  encodeA2AMessage,
} from "@reef-protocol/protocol";

type HexAddress = `0x${string}`;

/** Interface for agent-specific message handling logic */
export interface AgentLogicHandler {
  handleMessage(msg: Message, task?: Task): Promise<Message | Task>;
  cancelTask?(taskId: string): Promise<Task>;
}

/**
 * Handle an inbound A2A message received over XMTP.
 * Decodes JSON-RPC, dispatches by method, and sends responses back.
 */
export async function handleA2AMessage(
  raw: string,
  fromAddress: string,
  agent: Agent,
  taskStore: TaskStore,
  logicHandler: AgentLogicHandler,
): Promise<void> {
  const decoded = decodeA2AMessage(raw);

  if (!decoded) {
    // Not a JSON-RPC message — treat as plain text
    console.log(`[msg] (plain) ${fromAddress}: ${raw}`);
    return;
  }

  if (isA2AResponse(decoded) && !isA2ARequest(decoded)) {
    // It's a response to one of our outbound requests — just log it
    console.log(`[a2a] Response from ${fromAddress}:`, decoded);
    return;
  }

  if (!isA2ARequest(decoded)) {
    console.log(`[a2a] Unknown JSON-RPC from ${fromAddress}:`, decoded);
    return;
  }

  const requestId = (decoded.id as string | number) ?? null;
  const method = decoded.method;

  try {
    switch (method) {
      case "message/send": {
        const params = decoded.params as { message: Message } | undefined;
        if (!params?.message) {
          await sendErrorResponse(
            agent,
            fromAddress,
            requestId,
            -32602,
            "Invalid params: missing message",
          );
          return;
        }

        // Look up existing task if taskId is provided
        let existingTask: Task | undefined;
        if (params.message.taskId) {
          existingTask = await taskStore.load(params.message.taskId);
        }

        const result = await logicHandler.handleMessage(
          params.message,
          existingTask,
        );

        // If result is a Task, store it
        if ("kind" in result && result.kind === "task") {
          await taskStore.save(result as Task);
        }

        await sendSuccessResponse(agent, fromAddress, requestId, result);
        break;
      }

      case "tasks/get": {
        const params = decoded.params as { id: string } | undefined;
        if (!params?.id) {
          await sendErrorResponse(
            agent,
            fromAddress,
            requestId,
            -32602,
            "Invalid params: missing task id",
          );
          return;
        }

        const task = await taskStore.load(params.id);
        if (!task) {
          await sendErrorResponse(
            agent,
            fromAddress,
            requestId,
            -32001,
            "Task not found",
          );
          return;
        }

        await sendSuccessResponse(agent, fromAddress, requestId, task);
        break;
      }

      case "tasks/cancel": {
        const params = decoded.params as { id: string } | undefined;
        if (!params?.id) {
          await sendErrorResponse(
            agent,
            fromAddress,
            requestId,
            -32602,
            "Invalid params: missing task id",
          );
          return;
        }

        if (!logicHandler.cancelTask) {
          await sendErrorResponse(
            agent,
            fromAddress,
            requestId,
            -32004,
            "Cancel not supported",
          );
          return;
        }

        const canceledTask = await logicHandler.cancelTask(params.id);
        await taskStore.save(canceledTask);
        await sendSuccessResponse(agent, fromAddress, requestId, canceledTask);
        break;
      }

      default: {
        await sendErrorResponse(
          agent,
          fromAddress,
          requestId,
          -32601,
          `Method not found: ${method}`,
        );
        break;
      }
    }
  } catch (err) {
    console.error(`[a2a] Error handling ${method}:`, err);
    await sendErrorResponse(
      agent,
      fromAddress,
      requestId,
      -32603,
      `Internal error: ${(err as Error).message}`,
    );
  }
}

async function sendSuccessResponse(
  agent: Agent,
  toAddress: string,
  id: string | number | null,
  result: unknown,
): Promise<void> {
  const response = encodeA2AMessage({
    jsonrpc: "2.0",
    id,
    result,
  });
  const dm = await agent.createDmWithAddress(toAddress as HexAddress);
  await dm.sendText(response);
}

async function sendErrorResponse(
  agent: Agent,
  toAddress: string,
  id: string | number | null,
  code: number,
  message: string,
): Promise<void> {
  const response = encodeA2AMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
  const dm = await agent.createDmWithAddress(toAddress as HexAddress);
  await dm.sendText(response);
}
