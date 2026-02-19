import {
  textPart,
  createMessage,
  createSendMessageRequest,
  encodeA2AMessage,
} from "@reef-protocol/protocol";
import { createReefAgent } from "../agent.js";
import { sendViaDaemon } from "../sender.js";
import { getConfigDir } from "../identity.js";

export async function sendCommand(
  address: string,
  message: string,
): Promise<void> {
  const configDir = getConfigDir();

  // Pre-encode the A2A message so daemon can relay as-is
  const msg = createMessage("user", [textPart(message)]);
  const request = createSendMessageRequest(msg);
  const encoded = encodeA2AMessage(
    request as unknown as Record<string, unknown>,
  );

  console.log(`Sending message to ${address}...`);

  // Try sending via running daemon first (avoids duplicate XMTP connections)
  const sentViaDaemon = await sendViaDaemon(address, encoded, configDir);
  if (sentViaDaemon) {
    console.log("Message sent (via daemon).");
    return;
  }

  // Fall back to creating our own XMTP agent
  const agent = await createReefAgent(configDir);
  const dm = await agent.createDmWithAddress(address as `0x${string}`);
  await dm.sendText(encoded);

  console.log("Message sent.");
  await agent.stop();
}
