import { describe, it, expect, vi } from "vitest";
import type { Agent } from "@xmtp/agent-sdk";
import {
  createRoom,
  listRooms,
  getRoomDetails,
  addRoomMembers,
  removeRoomMembers,
  getRoomConversation,
} from "../rooms.js";

/** Create a mock Agent with group conversation support */
function createMockAgent(groups: MockGroup[] = []) {
  const createdGroups: MockGroup[] = [];

  const agent = {
    address: "0xTestAgent",
    createGroupWithAddresses: vi.fn(
      async (addresses: string[], options?: Record<string, unknown>) => {
        const group = createMockGroup({
          id: `group-${createdGroups.length + 1}`,
          name: (options?.groupName as string) ?? "",
          description: (options?.groupDescription as string) ?? "",
          appData: (options?.appData as string) ?? "",
        });
        createdGroups.push(group);
        return group;
      },
    ),
    client: {
      conversations: {
        listGroups: vi.fn(() => groups),
        getConversationById: vi.fn(async (id: string) => {
          return (
            groups.find((g) => g.id === id) ??
            createdGroups.find((g) => g.id === id) ??
            undefined
          );
        }),
      },
    },
  } as unknown as Agent;

  return { agent, createdGroups };
}

interface MockGroup {
  id: string;
  name: string;
  description: string;
  appData: string;
  sendText: ReturnType<typeof vi.fn>;
  members: ReturnType<typeof vi.fn>;
  addMembersByIdentifiers: ReturnType<typeof vi.fn>;
  removeMembersByIdentifiers: ReturnType<typeof vi.fn>;
}

function createMockGroup(opts: {
  id: string;
  name?: string;
  description?: string;
  appData?: string;
}): MockGroup {
  return {
    id: opts.id,
    name: opts.name ?? "",
    description: opts.description ?? "",
    appData: opts.appData ?? "",
    sendText: vi.fn(),
    members: vi.fn(async () => [
      {
        inboxId: "inbox-1",
        accountIdentifiers: [{ identifier: "0xMember1", identifierKind: 0 }],
      },
      {
        inboxId: "inbox-2",
        accountIdentifiers: [{ identifier: "0xMember2", identifierKind: 0 }],
      },
    ]),
    addMembersByIdentifiers: vi.fn(),
    removeMembersByIdentifiers: vi.fn(),
  };
}

describe("createRoom", () => {
  it("creates a group with addresses and Reef metadata", async () => {
    const { agent } = createMockAgent();

    const group = await createRoom(agent, ["0xAgent1", "0xAgent2"], {
      name: "Test Room",
      description: "A test room",
    });

    expect(agent.createGroupWithAddresses).toHaveBeenCalledWith(
      ["0xAgent1", "0xAgent2"],
      expect.objectContaining({
        groupName: "Test Room",
        groupDescription: "A test room",
      }),
    );

    // appData should contain Reef metadata
    const call = (agent.createGroupWithAddresses as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    const appData = JSON.parse(call[1].appData);
    expect(appData.reef).toBe(true);
    expect(appData.createdBy).toBe("0xTestAgent");

    expect(group.id).toBe("group-1");
  });

  it("stores purpose in appData when provided", async () => {
    const { agent } = createMockAgent();

    await createRoom(agent, ["0xAgent1"], {
      purpose: "Collaboration on task X",
    });

    const call = (agent.createGroupWithAddresses as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    const appData = JSON.parse(call[1].appData);
    expect(appData.purpose).toBe("Collaboration on task X");
  });
});

describe("listRooms", () => {
  it("returns room summaries from SDK groups", () => {
    const groups = [
      createMockGroup({ id: "g1", name: "Room A", description: "First" }),
      createMockGroup({ id: "g2", name: "Room B", description: "Second" }),
    ];
    const { agent } = createMockAgent(groups);

    const rooms = listRooms(agent);

    expect(rooms).toHaveLength(2);
    expect(rooms[0].id).toBe("g1");
    expect(rooms[0].name).toBe("Room A");
    expect(rooms[1].id).toBe("g2");
    expect(rooms[1].name).toBe("Room B");
  });

  it("returns empty array when no groups exist", () => {
    const { agent } = createMockAgent([]);

    const rooms = listRooms(agent);

    expect(rooms).toHaveLength(0);
  });
});

describe("getRoomDetails", () => {
  it("returns full room details with members", async () => {
    const group = createMockGroup({
      id: "g1",
      name: "Room A",
      description: "Test room",
      appData: JSON.stringify({ reef: true, createdBy: "0xCreator" }),
    });
    const { agent } = createMockAgent([group]);

    const details = await getRoomDetails(agent, "g1");

    expect(details).not.toBeNull();
    expect(details!.id).toBe("g1");
    expect(details!.name).toBe("Room A");
    expect(details!.members).toHaveLength(2);
    expect(details!.members[0].addresses).toContain("0xMember1");
    expect(details!.metadata?.reef).toBe(true);
    expect(details!.metadata?.createdBy).toBe("0xCreator");
  });

  it("returns null for unknown group ID", async () => {
    const { agent } = createMockAgent([]);

    const details = await getRoomDetails(agent, "nonexistent");

    expect(details).toBeNull();
  });
});

describe("addRoomMembers", () => {
  it("calls addMembersByIdentifiers with Ethereum identifiers", async () => {
    const group = createMockGroup({ id: "g1" });
    const { agent } = createMockAgent([group]);

    await addRoomMembers(agent, "g1", ["0xNewMember"]);

    expect(group.addMembersByIdentifiers).toHaveBeenCalledWith([
      { identifier: "0xNewMember", identifierKind: 0 },
    ]);
  });

  it("throws if room not found", async () => {
    const { agent } = createMockAgent([]);

    await expect(
      addRoomMembers(agent, "nonexistent", ["0xAddr"]),
    ).rejects.toThrow("Room not found");
  });
});

describe("removeRoomMembers", () => {
  it("calls removeMembersByIdentifiers with Ethereum identifiers", async () => {
    const group = createMockGroup({ id: "g1" });
    const { agent } = createMockAgent([group]);

    await removeRoomMembers(agent, "g1", ["0xOldMember"]);

    expect(group.removeMembersByIdentifiers).toHaveBeenCalledWith([
      { identifier: "0xOldMember", identifierKind: 0 },
    ]);
  });

  it("throws if room not found", async () => {
    const { agent } = createMockAgent([]);

    await expect(
      removeRoomMembers(agent, "nonexistent", ["0xAddr"]),
    ).rejects.toThrow("Room not found");
  });
});

describe("getRoomConversation", () => {
  it("returns the conversation for a valid group ID", async () => {
    const group = createMockGroup({ id: "g1" });
    const { agent } = createMockAgent([group]);

    const conversation = await getRoomConversation(agent, "g1");

    expect(conversation).toBe(group);
  });

  it("returns null for unknown group ID", async () => {
    const { agent } = createMockAgent([]);

    const conversation = await getRoomConversation(agent, "nonexistent");

    expect(conversation).toBeNull();
  });
});
