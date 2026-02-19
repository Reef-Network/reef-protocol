import { createReefAgent } from "../agent.js";
import { sendTextMessage, sendViaDaemon } from "../sender.js";
import { getConfigDir } from "../identity.js";

export async function sendCommand(
  address: string,
  message: string,
): Promise<void> {
  const configDir = getConfigDir();

  console.log(`Sending message to ${address}...`);

  // Try sending via running daemon first (avoids duplicate XMTP connections)
  const sentViaDaemon = await sendViaDaemon(address, message, configDir);
  if (sentViaDaemon) {
    console.log("Message sent (via daemon).");
    return;
  }

  // Fall back to creating our own XMTP agent
  const agent = await createReefAgent(configDir);
  await sendTextMessage(agent, address, message);

  console.log("Message sent.");
  await agent.stop();
}
