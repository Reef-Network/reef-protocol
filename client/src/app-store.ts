/** Filesystem CRUD for app markdown files in ~/.reef/apps/ */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppManifest } from "@reef-protocol/protocol";
import { getConfigDir } from "./identity.js";
import { parseAppMarkdown, serializeAppMarkdown } from "./app-markdown.js";

/** Directory containing bundled app markdowns shipped with the package */
const BUNDLED_APPS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
);

function appsDir(configDir: string): string {
  return path.join(configDir, "apps");
}

function appFilePath(appId: string, configDir: string): string {
  return path.join(appsDir(configDir), `${appId}.md`);
}

/** Ensure the apps directory exists */
export function ensureAppsDir(configDir?: string): string {
  const dir = appsDir(configDir || getConfigDir());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Install bundled app markdowns to ~/.reef/apps/.
 * Copies .md files from the package's apps/ directory.
 * Only writes files that don't already exist (never overwrites).
 */
export function installWellKnownApps(configDir?: string): string[] {
  const dir = configDir || getConfigDir();
  ensureAppsDir(dir);
  const installed: string[] = [];

  if (!fs.existsSync(BUNDLED_APPS_DIR)) return installed;

  const bundledFiles = fs
    .readdirSync(BUNDLED_APPS_DIR)
    .filter((f) => f.endsWith(".md"));

  for (const file of bundledFiles) {
    const appId = file.slice(0, -3);
    const destPath = appFilePath(appId, dir);
    const content = fs.readFileSync(path.join(BUNDLED_APPS_DIR, file), "utf-8");
    // Always overwrite — bundled apps are the source of truth and may
    // contain updated rules, actions, or terminal flags between versions.
    fs.writeFileSync(destPath, content);
    installed.push(appId);
  }

  return installed;
}

/** List all installed app IDs (from filenames) */
export function listInstalledApps(configDir?: string): string[] {
  const dir = appsDir(configDir || getConfigDir());
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .sort();
}

/** Load a single installed app manifest by appId. Returns null if missing or malformed. */
export function loadInstalledApp(
  appId: string,
  configDir?: string,
): AppManifest | null {
  const filePath = appFilePath(appId, configDir || getConfigDir());
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return parseAppMarkdown(raw);
  } catch (err) {
    console.warn(
      `[reef] Skipping malformed app "${appId}": ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

/** Load all installed app manifests */
export function loadAllInstalledApps(configDir?: string): AppManifest[] {
  const appIds = listInstalledApps(configDir);
  const manifests: AppManifest[] = [];

  for (const appId of appIds) {
    const manifest = loadInstalledApp(appId, configDir);
    if (manifest) manifests.push(manifest);
  }

  return manifests;
}

/** Save an app manifest as a markdown file */
export function saveApp(manifest: AppManifest, configDir?: string): void {
  const dir = configDir || getConfigDir();
  ensureAppsDir(dir);
  fs.writeFileSync(
    appFilePath(manifest.appId, dir),
    serializeAppMarkdown(manifest),
  );
}

/** Remove an installed app by appId */
export function removeApp(appId: string, configDir?: string): boolean {
  const filePath = appFilePath(appId, configDir || getConfigDir());
  if (!fs.existsSync(filePath)) return false;

  fs.unlinkSync(filePath);
  return true;
}

/** Read the raw markdown string for an app */
export function readAppMarkdown(
  appId: string,
  configDir?: string,
): string | null {
  const filePath = appFilePath(appId, configDir || getConfigDir());
  if (!fs.existsSync(filePath)) return null;

  return fs.readFileSync(filePath, "utf-8");
}
