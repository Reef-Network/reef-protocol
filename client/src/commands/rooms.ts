import { createReefAgent } from "../agent.js";
import { getConfigDir } from "../identity.js";
import {
  createRoom,
  listRooms,
  getRoomDetails,
  addRoomMembers,
  removeRoomMembers,
} from "../rooms.js";
import { sendTextMessageToGroup } from "../sender.js";

export async function roomsCreateCommand(
  addresses: string[],
  options: { name?: string; description?: string },
): Promise<void> {
  const agent = await createReefAgent(getConfigDir());

  console.log(`Creating room with ${addresses.length} member(s)...`);

  const group = await createRoom(agent, addresses, {
    name: options.name,
    description: options.description,
  });

  console.log(`Room created.`);
  console.log(`  ID:   ${group.id}`);
  console.log(`  Name: ${group.name || "(unnamed)"}`);

  await agent.stop();
}

export async function roomsListCommand(): Promise<void> {
  const agent = await createReefAgent(getConfigDir());

  const rooms = listRooms(agent);

  if (rooms.length === 0) {
    console.log(
      "No rooms found. Create one with: reef rooms create <addresses...>",
    );
    await agent.stop();
    return;
  }

  console.log(`Rooms (${rooms.length}):\n`);
  for (const room of rooms) {
    console.log(`  ${room.name || "(unnamed)"}`);
    console.log(`    ID:          ${room.id}`);
    console.log(`    Description: ${room.description || "(none)"}\n`);
  }

  await agent.stop();
}

export async function roomsInfoCommand(groupId: string): Promise<void> {
  const agent = await createReefAgent(getConfigDir());

  const details = await getRoomDetails(agent, groupId);

  if (!details) {
    console.log(`Room not found: ${groupId}`);
    await agent.stop();
    return;
  }

  console.log(`Room: ${details.name || "(unnamed)"}`);
  console.log(`  ID:          ${details.id}`);
  console.log(`  Description: ${details.description || "(none)"}`);
  console.log(`  Members (${details.members.length}):`);
  for (const member of details.members) {
    const addrs = member.addresses.join(", ");
    console.log(`    - ${addrs || member.inboxId}`);
  }

  if (details.metadata?.purpose) {
    console.log(`  Purpose: ${details.metadata.purpose}`);
  }

  await agent.stop();
}

export async function roomsSendCommand(
  groupId: string,
  message: string,
): Promise<void> {
  const agent = await createReefAgent(getConfigDir());

  console.log(`Sending message to room ${groupId}...`);
  await sendTextMessageToGroup(agent, groupId, message);
  console.log("Message sent.");

  await agent.stop();
}

export async function roomsAddCommand(
  groupId: string,
  address: string,
): Promise<void> {
  const agent = await createReefAgent(getConfigDir());

  console.log(`Adding ${address} to room ${groupId}...`);
  await addRoomMembers(agent, groupId, [address]);
  console.log("Member added.");

  await agent.stop();
}

export async function roomsRemoveCommand(
  groupId: string,
  address: string,
): Promise<void> {
  const agent = await createReefAgent(getConfigDir());

  console.log(`Removing ${address} from room ${groupId}...`);
  await removeRoomMembers(agent, groupId, [address]);
  console.log("Member removed.");

  await agent.stop();
}
