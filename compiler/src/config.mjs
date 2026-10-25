import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

/** Dossier de configuration : BERKIOS_HOME si défini (utile aux tests), sinon ~/.berkios. */
export const configDir = () => process.env.BERKIOS_HOME || join(homedir(), ".berkios");
const configPath = () => join(configDir(), "config.json");

export function readConfig() {
  try { return JSON.parse(readFileSync(configPath(), "utf8")); } catch { return {}; }
}
export function writeConfig(config) {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + "\n", "utf8");
}
