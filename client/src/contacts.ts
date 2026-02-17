import * as fs from "node:fs";
import * as path from "node:path";
import type { Contact } from "@reef-protocol/protocol";
import { getConfigDir } from "./identity.js";

function contactsPath(configDir: string): string {
  return path.join(configDir, "contacts.json");
}

/**
 * Load all contacts from the config directory.
 */
export function loadContacts(configDir?: string): Contact[] {
  const dir = configDir || getConfigDir();
  const filePath = contactsPath(dir);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as Contact[];
}

/**
 * Save the full contacts list to the config directory.
 */
export function saveContacts(contacts: Contact[], configDir?: string): void {
  const dir = configDir || getConfigDir();

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(contactsPath(dir), JSON.stringify(contacts, null, 2));
}

/**
 * Add a contact. If the address already exists, update it.
 */
export function addContact(contact: Contact, configDir?: string): void {
  const contacts = loadContacts(configDir);
  const existing = contacts.findIndex(
    (c) => c.address.toLowerCase() === contact.address.toLowerCase(),
  );

  if (existing >= 0) {
    contacts[existing] = contact;
  } else {
    contacts.push(contact);
  }

  saveContacts(contacts, configDir);
}

/**
 * Remove a contact by address.
 */
export function removeContact(address: string, configDir?: string): boolean {
  const contacts = loadContacts(configDir);
  const filtered = contacts.filter(
    (c) => c.address.toLowerCase() !== address.toLowerCase(),
  );

  if (filtered.length === contacts.length) {
    return false; // Not found
  }

  saveContacts(filtered, configDir);
  return true;
}

/**
 * Check if an address is in the contacts list.
 */
export function isContact(address: string, configDir?: string): boolean {
  const contacts = loadContacts(configDir);
  return contacts.some(
    (c) => c.address.toLowerCase() === address.toLowerCase(),
  );
}

/**
 * Find a contact by address.
 */
export function findContact(
  address: string,
  configDir?: string,
): Contact | undefined {
  const contacts = loadContacts(configDir);
  return contacts.find(
    (c) => c.address.toLowerCase() === address.toLowerCase(),
  );
}
