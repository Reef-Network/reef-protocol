import { loadConfig, saveConfig } from "../config.js";

/** Show current config */
export function configShowCommand(): void {
  const config = loadConfig();
  console.log(JSON.stringify(config, null, 2));
}

/** Set a config key */
export function configSetCommand(key: string, value: string): void {
  const config = loadConfig();

  switch (key) {
    case "contactsOnly": {
      const bool = value === "true" || value === "1";
      config.contactsOnly = bool;
      break;
    }
    case "country": {
      config.country = value.toUpperCase().slice(0, 2);
      break;
    }
    default:
      console.error(`Unknown config key: ${key}`);
      console.error(`Valid keys: contactsOnly, country`);
      process.exit(1);
  }

  saveConfig(config);
  const configRecord = config as unknown as Record<string, unknown>;
  console.log(`Set ${key} = ${JSON.stringify(configRecord[key])}`);
}
