/** Default acknowledgment logic handler for A2A messages */

import { randomUUID } from "node:crypto";
import type { Message, Task } from "@a2a-js/sdk";
import { textPart, createMessage } from "@reef-protocol/protocol";
import type { AgentLogicHandler } from "./handler.js";

/**
 * Create a default logic handler that acknowledges incoming messages.
 * Returns a Task in "working" state so the sender knows the message
 * was received. The agent is expected to send a real response via
 * `reef send`.
 */
export function createDefaultLogicHandler(): AgentLogicHandler {
  return {
    async handleMessage(msg: Message, task?: Task): Promise<Message | Task> {
      const reply = createMessage("agent", [textPart("Message received")]);

      // If there's an existing task, update it
      if (task) {
        const updatedTask: Task = {
          ...task,
          status: {
            state: "working",
            message: reply,
            timestamp: new Date().toISOString(),
          },
        };
        return updatedTask;
      }

      // New interaction — create a task in "working" state
      const taskId = randomUUID();
      const contextId = msg.contextId ?? randomUUID();

      const newTask: Task = {
        kind: "task",
        id: taskId,
        contextId,
        status: {
          state: "working",
          message: reply,
          timestamp: new Date().toISOString(),
        },
        history: [msg, reply],
      };

      return newTask;
    },
  };
}
