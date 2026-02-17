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
  .action(async (options) => {
    await searchCommand(options);
  });

// reef register
program
  .command("register")
  .description("Register or update your Agent Card with the directory")
  .option("-n, --name <name>", "Agent display name")
  .option("-b, --bio <bio>", "Agent description")
  .option("--skills <skills>", "Comma-separated list of skills")
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

// reef start
program
  .command("start")
  .description("Start the Reef daemon (long-running A2A message listener)")
  .action(async () => {
    await startDaemon();
  });

program.parse();
