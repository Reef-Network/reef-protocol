/** Room (group conversation) management functions */

import type { Agent } from "@xmtp/agent-sdk";
import type { Group, Conversation } from "@xmtp/node-sdk";

type HexAddress = `0x${string}`;

/** Metadata stored in group appData for Reef rooms */
export interface ReefRoomMetadata {
  reef: true;
  createdBy: string;
  purpose?: string;
}

/** Summary returned by listRooms */
export interface RoomSummary {
  id: string;
  name: string;
  description: string;
  memberCount: number;
}

/** Detailed info returned by getRoomDetails */
export interface RoomDetails {
  id: string;
  name: string;
  description: string;
  members: { inboxId: string; addresses: string[] }[];
  appData: string;
  metadata: ReefRoomMetadata | null;
}

/** Parse Reef metadata from group appData, returns null if not a Reef room */
function parseReefMetadata(appData: string): ReefRoomMetadata | null {
  if (!appData) return null;
  try {
    const parsed = JSON.parse(appData);
    if (parsed && parsed.reef === true) return parsed as ReefRoomMetadata;
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a new room (group conversation) with the given agent addresses.
 * Stores Reef metadata in the group's appData field.
 */
export async function createRoom(
  agent: Agent,
  addresses: string[],
  options?: { name?: string; description?: string; purpose?: string },
): Promise<Group> {
  const metadata: ReefRoomMetadata = {
    reef: true,
    createdBy: agent.address ?? "unknown",
    purpose: options?.purpose,
  };

  const group = await agent.createGroupWithAddresses(
    addresses as HexAddress[],
    {
      groupName: options?.name,
      groupDescription: options?.description,
      appData: JSON.stringify(metadata),
    },
  );

  return group;
}

/**
 * List all groups the agent belongs to.
 */
export function listRooms(agent: Agent): RoomSummary[] {
  const groups = agent.client.conversations.listGroups();

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    memberCount: 0, // Members require async call; use getRoomDetails for full info
  }));
}

/**
 * Get detailed information about a room by its conversation ID.
 */
export async function getRoomDetails(
  agent: Agent,
  groupId: string,
): Promise<RoomDetails | null> {
  const conversation =
    await agent.client.conversations.getConversationById(groupId);
  if (!conversation) return null;

  // Check if it's a group (not a DM)
  const group = conversation as Group;
  if (!group.name && group.name !== "") {
    // Heuristic: groups have a name property. If getConversationById returned a DM,
    // it won't have group-specific methods.
    return null;
  }

  const members = await group.members();

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    members: members.map((m) => ({
      inboxId: m.inboxId,
      addresses: m.accountIdentifiers.map((id) => id.identifier),
    })),
    appData: group.appData,
    metadata: parseReefMetadata(group.appData),
  };
}

/**
 * Add members to an existing room by their addresses.
 */
export async function addRoomMembers(
  agent: Agent,
  groupId: string,
  addresses: string[],
): Promise<void> {
  const conversation =
    await agent.client.conversations.getConversationById(groupId);
  if (!conversation) {
    throw new Error(`Room not found: ${groupId}`);
  }

  const group = conversation as Group;
  await group.addMembersByIdentifiers(
    addresses.map((addr) => ({
      identifier: addr,
      identifierKind: 0, // Ethereum
    })),
  );
}

/**
 * Remove members from an existing room by their addresses.
 */
export async function removeRoomMembers(
  agent: Agent,
  groupId: string,
  addresses: string[],
): Promise<void> {
  const conversation =
    await agent.client.conversations.getConversationById(groupId);
  if (!conversation) {
    throw new Error(`Room not found: ${groupId}`);
  }

  const group = conversation as Group;
  await group.removeMembersByIdentifiers(
    addresses.map((addr) => ({
      identifier: addr,
      identifierKind: 0, // Ethereum
    })),
  );
}

/**
 * Get a group conversation by ID, for sending messages.
 */
export async function getRoomConversation(
  agent: Agent,
  groupId: string,
): Promise<Conversation | null> {
  const conversation =
    await agent.client.conversations.getConversationById(groupId);
  return conversation ?? null;
}
