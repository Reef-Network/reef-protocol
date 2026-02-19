import * as fs from "node:fs";
import {
  buildAppManifest,
  buildAppAction,
  buildAppActionDataPart,
  createMessage,
  createSendMessageRequest,
  encodeA2AMessage,
  DEFAULT_DIRECTORY_URL,
  appManifestSchema,
} from "@reef-protocol/protocol";
import { getOrCreateIdentity, getConfigDir } from "../identity.js";
import { parseAppMarkdown } from "../app-markdown.js";
import {
  listInstalledApps,
  loadInstalledApp,
  readAppMarkdown,
  saveApp,
} from "../app-store.js";
import { sendViaDaemon } from "../sender.js";
import { createReefAgent } from "../agent.js";

const DIRECTORY_URL = process.env.REEF_DIRECTORY_URL || DEFAULT_DIRECTORY_URL;

interface RegisterOptions {
  appId: string;
  name: string;
  description?: string;
  category?: string;
  type?: string;
  coordinator?: string;
  manifest?: string;
}

export async function appsRegisterCommand(
  options: RegisterOptions,
): Promise<void> {
  let manifest;

  if (options.manifest) {
    // Load manifest from JSON file
    const raw = fs.readFileSync(options.manifest, "utf-8");
    manifest = JSON.parse(raw);
  } else {
    // Build manifest from CLI options
    const defaultAction = buildAppAction(
      "interact",
      "Interact",
      "Default interaction with this app",
    );

    manifest = buildAppManifest(
      options.appId,
      options.name,
      options.description || "",
      [defaultAction],
      {
        type: (options.type as "p2p" | "coordinated") || undefined,
        category: options.category,
        coordinatorAddress: options.coordinator,
      },
    );
  }

  const res = await fetch(`${DIRECTORY_URL}/apps/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: getOrCreateIdentity(getConfigDir()).address,
      appId: options.appId,
      manifest,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Registration failed (${res.status}): ${body}`);
    return;
  }

  const data = (await res.json()) as { appNumber: number };
  console.log(`App registered! (app #${data.appNumber})`);
  console.log(`  ID:       ${options.appId}`);
  console.log(`  Name:     ${manifest.name}`);
  console.log(`  Type:     ${manifest.type}`);
  if (manifest.category) {
    console.log(`  Category: ${manifest.category}`);
  }
}

// ── Local app management commands ────────────────────────────────────

/** List all locally installed app markdowns */
export function appsListCommand(): void {
  const configDir = getConfigDir();
  const appIds = listInstalledApps(configDir);

  if (appIds.length === 0) {
    console.log(
      "No apps installed. Run `reef start` to install well-known apps.",
    );
    return;
  }

  console.log(`Installed apps (${appIds.length}):\n`);
  for (const appId of appIds) {
    const manifest = loadInstalledApp(appId, configDir);
    if (!manifest) continue;

    const actionIds = manifest.actions.map((a) => a.id).join(", ");
    console.log(`  ${manifest.name} [${appId}]`);
    console.log(`    Type:     ${manifest.type}`);
    if (manifest.category) {
      console.log(`    Category: ${manifest.category}`);
    }
    if (actionIds) {
      console.log(`    Actions:  ${actionIds}`);
    }
    console.log();
  }
}

/** Print raw markdown for an app (for agents to read rules) */
export function appsReadCommand(appId: string): void {
  const raw = readAppMarkdown(appId, getConfigDir());
  if (!raw) {
    console.error(`App not found: ${appId}`);
    console.error(`Run \`reef apps list\` to see installed apps.`);
    process.exitCode = 1;
    return;
  }
  console.log(raw);
}

interface CreateOptions {
  appId: string;
  name: string;
  description?: string;
  type?: string;
  category?: string;
  file?: string;
}

/** Create a new app markdown from options or an existing file */
export function appsCreateCommand(options: CreateOptions): void {
  const configDir = getConfigDir();

  if (options.file) {
    // Install from an existing .md file
    const raw = fs.readFileSync(options.file, "utf-8");
    const manifest = parseAppMarkdown(raw);
    saveApp(manifest, configDir);
    console.log(`App installed: ${manifest.name} [${manifest.appId}]`);
    return;
  }

  const manifest = buildAppManifest(
    options.appId,
    options.name,
    options.description || "",
    [],
    {
      type: (options.type as "p2p" | "coordinated") || "p2p",
      category: options.category,
    },
  );

  saveApp(manifest, configDir);
  console.log(`App created: ${manifest.name} [${manifest.appId}]`);
  console.log(`Edit the markdown at: ~/.reef/apps/${manifest.appId}.md`);
}

/** Validate an installed app or a raw markdown file against the schema */
export function appsValidateCommand(target: string): void {
  let raw: string;
  let source: string;

  if (target.endsWith(".md") && fs.existsSync(target)) {
    // Validate a file path
    raw = fs.readFileSync(target, "utf-8");
    source = target;
  } else {
    // Validate an installed app by appId
    const markdown = readAppMarkdown(target, getConfigDir());
    if (!markdown) {
      console.error(`App not found: ${target}`);
      console.error("Provide an appId or path to a .md file.");
      process.exitCode = 1;
      return;
    }
    raw = markdown;
    source = target;
  }

  try {
    const manifest = parseAppMarkdown(raw);
    const result = appManifestSchema.safeParse(manifest);

    if (!result.success) {
      console.error(`Invalid app (${source}):`);
      for (const issue of result.error.issues) {
        console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(
      `Valid! ${manifest.name} [${manifest.appId}] (${manifest.type})`,
    );
  } catch (err) {
    console.error(`Parse error (${source}): ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

interface SearchOptions {
  query?: string;
  category?: string;
  type?: string;
  available?: boolean;
  sort?: string;
}

export async function appsSearchCommand(options: SearchOptions): Promise<void> {
  const params = new URLSearchParams();
  if (options.query) params.set("q", options.query);
  if (options.category) params.set("category", options.category);
  if (options.type) params.set("type", options.type);
  if (options.available) params.set("available", "true");
  if (options.sort === "reputation") params.set("sortBy", "reputation");

  const res = await fetch(`${DIRECTORY_URL}/apps/search?${params.toString()}`);

  if (!res.ok) {
    console.error(`Search failed: ${res.status}`);
    return;
  }

  const data = (await res.json()) as {
    apps: Array<{
      appId: string;
      name: string;
      description?: string;
      type: string;
      category?: string;
      availability: string;
      reputationScore?: number;
    }>;
  };

  if (data.apps.length === 0) {
    console.log("No apps found.");
    return;
  }

  console.log(`Apps (${data.apps.length}):\n`);
  for (const app of data.apps) {
    const score =
      app.reputationScore !== undefined
        ? ` (rep: ${app.reputationScore.toFixed(3)})`
        : "";
    console.log(`  ${app.name} [${app.appId}]${score}`);
    console.log(`    Type:         ${app.type}`);
    console.log(`    Category:     ${app.category || "(none)"}`);
    console.log(`    Availability: ${app.availability}`);
    if (app.description) {
      console.log(`    Description:  ${app.description}`);
    }
    console.log();
  }
}

/** Send a structured app action to another agent */
export async function appsSendCommand(
  address: string,
  appId: string,
  action: string,
  opts: { payload?: string },
): Promise<void> {
  const configDir = getConfigDir();
  const payload = opts.payload ? JSON.parse(opts.payload) : {};
  const dataPart = buildAppActionDataPart(appId, action, payload);
  const message = createMessage("user", [dataPart]);
  const request = createSendMessageRequest(message);
  const encoded = encodeA2AMessage(
    request as unknown as Record<string, unknown>,
  );

  console.log(`Sending ${appId}/${action} to ${address}...`);

  // Try daemon API first, fall back to direct XMTP
  const sentViaDaemon = await sendViaDaemon(address, encoded, configDir);
  if (sentViaDaemon) {
    console.log("App action sent (via daemon).");
    return;
  }

  const agent = await createReefAgent(configDir);
  const dm = await agent.createDmWithAddress(address as `0x${string}`);
  await dm.sendText(encoded);
  console.log("App action sent.");
  await agent.stop();
}

export async function appsInfoCommand(appId: string): Promise<void> {
  const res = await fetch(`${DIRECTORY_URL}/apps/${appId}`);

  if (!res.ok) {
    if (res.status === 404) {
      console.log(`App not found: ${appId}`);
    } else {
      console.error(`Failed to fetch app: ${res.status}`);
    }
    return;
  }

  const app = (await res.json()) as {
    appId: string;
    name: string;
    description?: string;
    version: string;
    type: string;
    category?: string;
    coordinatorAddress?: string;
    availability: string;
    reputationScore?: number;
    tasksCompleted?: number;
    tasksFailed?: number;
    totalInteractions?: number;
    registeredAt?: string;
    manifest?: {
      actions?: Array<{ id: string; name: string; description: string }>;
    };
  };

  console.log(`App: ${app.name} [${app.appId}]`);
  console.log(`  Version:        ${app.version}`);
  console.log(`  Type:           ${app.type}`);
  console.log(`  Category:       ${app.category || "(none)"}`);
  console.log(`  Availability:   ${app.availability}`);
  if (app.coordinatorAddress) {
    console.log(`  Coordinator:    ${app.coordinatorAddress}`);
  }
  if (app.description) {
    console.log(`  Description:    ${app.description}`);
  }
  if (app.reputationScore !== undefined) {
    console.log(`  Reputation:     ${app.reputationScore.toFixed(3)}`);
  }
  if (app.tasksCompleted !== undefined) {
    console.log(
      `  Tasks:          ${app.tasksCompleted} completed, ${app.tasksFailed ?? 0} failed`,
    );
  }
  if (app.registeredAt) {
    console.log(`  Registered:     ${app.registeredAt}`);
  }

  if (app.manifest?.actions && app.manifest.actions.length > 0) {
    console.log(`  Actions (${app.manifest.actions.length}):`);
    for (const action of app.manifest.actions) {
      console.log(`    - ${action.name} [${action.id}]: ${action.description}`);
    }
  }
}
