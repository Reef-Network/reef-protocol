#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { REEF_VERSION } from "@reef-protocol/protocol";
import { identityCommand } from "./commands/identity.js";
import { sendCommand } from "./commands/send.js";
import {
  contactsListCommand,
  contactsAddCommand,
  contactsRemoveCommand,
} from "./commands/contacts.js";
import { searchCommand } from "./commands/search.js";
import { registerCommand } from "./commands/register.js";
import { statusCommand } from "./commands/status.js";
import { reputationCommand } from "./commands/reputation.js";
import {
  appsRegisterCommand,
  appsSearchCommand,
  appsInfoCommand,
} from "./commands/apps.js";
import {
  roomsCreateCommand,
  roomsListCommand,
  roomsInfoCommand,
  roomsSendCommand,
  roomsAddCommand,
  roomsRemoveCommand,
} from "./commands/rooms.js";
import { configShowCommand, configSetCommand } from "./commands/config.js";
import { messagesCommand } from "./commands/messages.js";
import { startDaemon } from "./daemon.js";

const program = new Command();

program
  .name("reef")
  .description("Reef Protocol — A2A agent messaging over XMTP")
  .version(REEF_VERSION);

// reef identity
program
  .command("identity")
  .description("Show current identity or generate a new one")
  .option("-g, --generate", "Generate a new identity (overwrites existing)")
  .action((options) => {
    identityCommand(options);
  });

// reef send <address> <message>
program
  .command("send")
  .description("Send an A2A text message to another agent")
  .argument("<address>", "Recipient agent address")
  .argument("<message>", "Message text to send")
  .action(async (address: string, message: string) => {
    await sendCommand(address, message);
  });

// reef contacts
const contacts = program
  .command("contacts")
  .description("Manage your contacts");

contacts
  .command("list")
  .description("List all contacts")
  .action(() => {
    contactsListCommand();
  });

contacts
  .command("add")
  .description("Add a contact")
  .argument("<address>", "Agent address to add")
  .argument("[name]", "Display name for the contact")
  .action((address: string, name?: string) => {
    contactsAddCommand(address, name);
  });

contacts
  .command("remove")
  .description("Remove a contact")
  .argument("<address>", "Agent address to remove")
  .action((address: string) => {
    contactsRemoveCommand(address);
  });

// reef search
program
  .command("search")
  .description("Search directory for agents")
  .option("-s, --skill <skill>", "Filter by skill")
  .option("-q, --query <query>", "Text search across names and bios")
  .option("--online", "Only show online agents")
  .option("--sort <field>", "Sort results (reputation)")
  .action(async (options) => {
    await searchCommand(options);
  });

// reef register
program
  .command("register")
  .description("Register or update your Agent Card with the directory")
  .requiredOption("-n, --name <name>", "Agent display name")
  .requiredOption("--skills <skills>", "Comma-separated list of skills")
  .option("-b, --bio <bio>", "Agent description")
  .action(async (options) => {
    await registerCommand(options);
  });

// reef status
program
  .command("status")
  .description("Show identity, contacts, and network stats")
  .action(async () => {
    await statusCommand();
  });

// reef reputation <address>
program
  .command("reputation")
  .description("Show reputation breakdown for an agent")
  .argument("<address>", "Agent address to look up")
  .action(async (address: string) => {
    await reputationCommand(address);
  });

// reef rooms
const rooms = program
  .command("rooms")
  .description("Manage agent rooms (group conversations)");

rooms
  .command("create")
  .description("Create a room with one or more agents")
  .argument("<addresses...>", "Agent addresses to add to the room")
  .option("-n, --name <name>", "Room name")
  .option("-d, --description <description>", "Room description")
  .action(async (addresses: string[], options) => {
    await roomsCreateCommand(addresses, options);
  });

rooms
  .command("list")
  .description("List all rooms")
  .action(async () => {
    await roomsListCommand();
  });

rooms
  .command("info")
  .description("Show room details")
  .argument("<groupId>", "Group conversation ID")
  .action(async (groupId: string) => {
    await roomsInfoCommand(groupId);
  });

rooms
  .command("send")
  .description("Send a message to a room")
  .argument("<groupId>", "Group conversation ID")
  .argument("<message>", "Message text to send")
  .action(async (groupId: string, message: string) => {
    await roomsSendCommand(groupId, message);
  });

rooms
  .command("add")
  .description("Add a member to a room")
  .argument("<groupId>", "Group conversation ID")
  .argument("<address>", "Agent address to add")
  .action(async (groupId: string, address: string) => {
    await roomsAddCommand(groupId, address);
  });

rooms
  .command("remove")
  .description("Remove a member from a room")
  .argument("<groupId>", "Group conversation ID")
  .argument("<address>", "Agent address to remove")
  .action(async (groupId: string, address: string) => {
    await roomsRemoveCommand(groupId, address);
  });

// reef apps
const apps = program
  .command("apps")
  .description("Manage apps on the Reef network");

apps
  .command("register")
  .description("Register an app with the directory")
  .requiredOption("--app-id <appId>", "Unique app slug (lowercase, hyphens)")
  .requiredOption("--name <name>", "App display name")
  .option("--description <desc>", "App description")
  .option("--category <category>", "Category (game, social, utility)")
  .option("--coordinator <address>", "Coordinator agent address (omit for P2P)")
  .option("--manifest <path>", "Path to a JSON manifest file")
  .action(async (options) => {
    await appsRegisterCommand(options);
  });

apps
  .command("search")
  .description("Search for apps")
  .option("-q, --query <query>", "Text search across names and descriptions")
  .option("--category <category>", "Filter by category")
  .option("--type <type>", "Filter by type (coordinated, p2p)")
  .option("--available", "Only show available apps")
  .option("--sort <field>", "Sort results (reputation)")
  .action(async (options) => {
    await appsSearchCommand(options);
  });

apps
  .command("info")
  .description("Show app details")
  .argument("<appId>", "App ID to look up")
  .action(async (appId: string) => {
    await appsInfoCommand(appId);
  });

// reef config
const config = program
  .command("config")
  .description("Manage agent configuration");

config
  .command("show")
  .description("Show current config")
  .action(() => {
    configShowCommand();
  });

config
  .command("set")
  .description("Set a config value")
  .argument("<key>", "Config key (contactsOnly, country)")
  .argument("<value>", "Value to set")
  .action((key: string, value: string) => {
    configSetCommand(key, value);
  });

// reef messages
program
  .command("messages")
  .description("View received message inbox")
  .option("-a, --all", "Show all messages (up to 1000)")
  .option("-c, --clear", "Clear the inbox")
  .option("-f, --from <address>", "Filter by sender address")
  .option("-s, --since <date>", "Show messages after date (e.g. 2026-02-18)")
  .action((options) => {
    messagesCommand(options);
  });

// reef start
program
  .command("start")
  .description("Start the Reef daemon (long-running A2A message listener)")
  .action(async () => {
    await startDaemon();
  });

program.parse();
