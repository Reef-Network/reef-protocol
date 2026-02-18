/** A2A JSON-RPC request handler over XMTP */

import type { Agent } from "@xmtp/agent-sdk";
import type { Conversation } from "@xmtp/node-sdk";
import type { Message, Task, TaskState } from "@a2a-js/sdk";
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

/** Callback fired when a task reaches a terminal state */
export type TaskOutcomeCallback = (
  state: TaskState,
  counterpartyAddress: string,
) => void;

/** Terminal task states that trigger outcome reporting */
const TERMINAL_STATES: TaskState[] = [
  "completed",
  "failed",
  "canceled",
  "rejected",
];

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
  onTaskOutcome?: TaskOutcomeCallback,
  conversation?: Conversation,
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
            conversation,
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

        // If result is a Task, store it and report outcome
        if ("kind" in result && result.kind === "task") {
          const task = result as Task;
          await taskStore.save(task);

          if (
            onTaskOutcome &&
            TERMINAL_STATES.includes(task.status.state as TaskState)
          ) {
            onTaskOutcome(task.status.state as TaskState, fromAddress);
          }
        }

        await sendSuccessResponse(
          agent,
          fromAddress,
          requestId,
          result,
          conversation,
        );
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
            conversation,
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
            conversation,
          );
          return;
        }

        await sendSuccessResponse(
          agent,
          fromAddress,
          requestId,
          task,
          conversation,
        );
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
            conversation,
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
            conversation,
          );
          return;
        }

        const canceledTask = await logicHandler.cancelTask(params.id);
        await taskStore.save(canceledTask);

        if (
          onTaskOutcome &&
          TERMINAL_STATES.includes(canceledTask.status.state as TaskState)
        ) {
          onTaskOutcome(canceledTask.status.state as TaskState, fromAddress);
        }

        await sendSuccessResponse(
          agent,
          fromAddress,
          requestId,
          canceledTask,
          conversation,
        );
        break;
      }

      default: {
        await sendErrorResponse(
          agent,
          fromAddress,
          requestId,
          -32601,
          `Method not found: ${method}`,
          conversation,
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
      conversation,
    );
  }
}

async function sendToConversation(
  agent: Agent,
  toAddress: string,
  text: string,
  conversation?: Conversation,
): Promise<void> {
  if (conversation) {
    await conversation.sendText(text);
  } else {
    const dm = await agent.createDmWithAddress(toAddress as HexAddress);
    await dm.sendText(text);
  }
}

async function sendSuccessResponse(
  agent: Agent,
  toAddress: string,
  id: string | number | null,
  result: unknown,
  conversation?: Conversation,
): Promise<void> {
  const response = encodeA2AMessage({
    jsonrpc: "2.0",
    id,
    result,
  });
  await sendToConversation(agent, toAddress, response, conversation);
}

async function sendErrorResponse(
  agent: Agent,
  toAddress: string,
  id: string | number | null,
  code: number,
  message: string,
  conversation?: Conversation,
): Promise<void> {
  const response = encodeA2AMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
  await sendToConversation(agent, toAddress, response, conversation);
}
