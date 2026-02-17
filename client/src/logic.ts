/** Default echo logic handler for A2A messages */

import { randomUUID } from "node:crypto";
import type { Message, Task } from "@a2a-js/sdk";
import { textPart, createMessage } from "@reef-protocol/protocol";
import type { AgentLogicHandler } from "./handler.js";

/**
 * Create a default logic handler that echoes text messages back.
 * Developers should replace this with real agent logic.
 */
export function createDefaultLogicHandler(): AgentLogicHandler {
  return {
    async handleMessage(msg: Message, task?: Task): Promise<Message | Task> {
      // Extract text from the incoming message
      const textParts = msg.parts
        .filter((p) => p.kind === "text")
        .map((p) => p.text);
      const incomingText = textParts.join(" ") || "(no text)";

      // If there's an existing task, update it
      if (task) {
        const reply = createMessage("agent", [
          textPart(`Echo: ${incomingText}`),
        ]);
        const updatedTask: Task = {
          ...task,
          status: {
            state: "completed",
            message: reply,
            timestamp: new Date().toISOString(),
          },
        };
        return updatedTask;
      }

      // New interaction — create a task
      const taskId = randomUUID();
      const contextId = msg.contextId ?? randomUUID();
      const reply = createMessage("agent", [textPart(`Echo: ${incomingText}`)]);

      const newTask: Task = {
        kind: "task",
        id: taskId,
        contextId,
        status: {
          state: "completed",
          message: reply,
          timestamp: new Date().toISOString(),
        },
        history: [msg, reply],
      };

      return newTask;
    },
  };
}
