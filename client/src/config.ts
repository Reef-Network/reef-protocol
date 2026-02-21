import * as fs from "node:fs";
import * as path from "node:path";
import { getConfigDir } from "./identity.js";

export interface ReefConfig {
  contactsOnly: boolean;
  country?: string;
  maxTurns?: number;
}

/** Default max agent dispatch turns per conversation before circuit break. */
export const DEFAULT_MAX_TURNS = 10;

/** Default dedup window for both inbound and outbound message suppression. */
export const DEFAULT_DEDUP_WINDOW_MS = 60_000;

const DEFAULT_CONFIG: ReefConfig = {
  contactsOnly: false,
};

function configPath(configDir: string): string {
  return path.join(configDir, "config.json");
}

/** Load config from the config directory. Returns defaults if missing. */
export function loadConfig(configDir?: string): ReefConfig {
  const dir = configDir || getConfigDir();
  const filePath = configPath(dir);

  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<ReefConfig>;
  return { ...DEFAULT_CONFIG, ...parsed };
}

/** Save config to the config directory. */
export function saveConfig(config: ReefConfig, configDir?: string): void {
  const dir = configDir || getConfigDir();

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(configPath(dir), JSON.stringify(config, null, 2));
}
