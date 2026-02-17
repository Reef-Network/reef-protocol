import { loadContacts, addContact, removeContact } from "../contacts.js";
import { getConfigDir } from "../identity.js";
import type { Contact } from "@reef-protocol/protocol";

export function contactsListCommand(): void {
  const contacts = loadContacts(getConfigDir());

  if (contacts.length === 0) {
    console.log(
      "No contacts yet. Add one with: reef contacts add <address> [name]",
    );
    return;
  }

  console.log(`Contacts (${contacts.length}):\n`);
  for (const c of contacts) {
    const trust = c.trusted ? "trusted" : "untrusted";
    console.log(`  ${c.name || "(unnamed)"}`);
    console.log(`    Address: ${c.address}`);
    console.log(`    Status:  ${trust}`);
    console.log(`    Added:   ${c.addedAt}\n`);
  }
}

export function contactsAddCommand(address: string, name?: string): void {
  const contact: Contact = {
    name: name || `Agent ${address.slice(0, 8)}`,
    address,
    addedAt: new Date().toISOString(),
    trusted: true,
  };

  addContact(contact, getConfigDir());
  console.log(`Added contact: ${contact.name} (${address})`);
}

export function contactsRemoveCommand(address: string): void {
  const removed = removeContact(address, getConfigDir());
  if (removed) {
    console.log(`Removed contact: ${address}`);
  } else {
    console.log(`Contact not found: ${address}`);
  }
}
