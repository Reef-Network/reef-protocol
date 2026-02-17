import { createReefAgent } from "../agent.js";
import { sendTextMessage } from "../sender.js";
import { getConfigDir } from "../identity.js";

export async function sendCommand(
  address: string,
  message: string,
): Promise<void> {
  const configDir = getConfigDir();

  console.log(`Sending message to ${address}...`);

  const agent = await createReefAgent(configDir);
  await sendTextMessage(agent, address, message);

  console.log("Message sent.");
  await agent.stop();
}
