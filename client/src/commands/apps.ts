import * as fs from "node:fs";
import { buildAppManifest, buildAppAction } from "@reef-protocol/protocol";
import { getOrCreateIdentity, getConfigDir } from "../identity.js";

import { DEFAULT_DIRECTORY_URL } from "@reef-protocol/protocol";

const DIRECTORY_URL = process.env.REEF_DIRECTORY_URL || DEFAULT_DIRECTORY_URL;

interface RegisterOptions {
  appId: string;
  name: string;
  description?: string;
  category?: string;
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
  console.log(
    `  Type:     ${manifest.coordinatorAddress ? "coordinated" : "p2p"}`,
  );
  if (manifest.category) {
    console.log(`  Category: ${manifest.category}`);
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
