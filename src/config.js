import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Per-user folder for settings and cache, so the package works from anywhere (npx, global install).
export const HOME = process.env.STEAM_SUGGESTER_HOME || join(homedir(), ".steam-suggester");
export const DATA_DIR = HOME;
export const CONFIG_PATH = join(HOME, "config.env");

// Values already in the environment win over the file.
if (existsSync(CONFIG_PATH)) process.loadEnvFile(CONFIG_PATH);

export const config = {
  apiKey: (process.env.STEAM_API_KEY || "").trim(),
  steamId: (process.env.STEAM_ID || "").trim(),
  steamPath: (process.env.STEAM_PATH || "").trim(),
};

export function requireCredentials() {
  const missing = [];
  if (!config.apiKey) missing.push("STEAM_API_KEY");
  if (!config.steamId) missing.push("STEAM_ID");
  if (missing.length) {
    throw new Error(`Missing ${missing.join(" and ")}. Run \`steam-suggester setup\` first.`);
  }
}

// MCP stdio servers must keep stdout clean, so all logging goes to stderr.
export const log = (...args) => console.error("[steam]", ...args);
