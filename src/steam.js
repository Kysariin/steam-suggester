// Talking to Steam: owned games (Web API), store metadata, SteamSpy tags,
// locally installed games, and launching.
import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { config, log } from "./config.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "steamsuggester/1.0" } });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= retries) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      const wait = res.status === 429 ? 60_000 : 5_000 * (attempt + 1);
      log(`HTTP ${res.status} from ${new URL(url).host}, waiting ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`HTTP ${res.status}: Steam rejected the request (check STEAM_API_KEY).`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return res.json();
  }
}

// ---------- Web API ----------

const resolvedIds = new Map();
export async function resolveSteamId() {
  // Accepts a SteamID64, a custom URL name, or a full profile URL.
  const raw = config.steamId.replace(/\/+$/, "").split("/").pop();
  if (/^\d{17}$/.test(raw)) return raw;
  if (resolvedIds.has(raw)) return resolvedIds.get(raw);
  const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(
    config.apiKey
  )}&vanityurl=${encodeURIComponent(raw)}`;
  const data = await getJson(url);
  if (data?.response?.success !== 1) {
    throw new Error(`Could not resolve STEAM_ID "${raw}" to a SteamID64.`);
  }
  resolvedIds.set(raw, data.response.steamid);
  return data.response.steamid;
}

export async function fetchOwnedGames() {
  const steamid = await resolveSteamId();
  const url =
    "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/" +
    `?key=${encodeURIComponent(config.apiKey)}&steamid=${steamid}` +
    "&include_appinfo=1&include_played_free_games=1&format=json";
  const data = await getJson(url);
  const games = data?.response?.games;
  if (!games) {
    throw new Error(
      "Steam returned no games. Set Profile > Edit Profile > Privacy Settings > 'Game details' to Public, then try again."
    );
  }
  return games.map((g) => ({
    appid: g.appid,
    name: g.name,
    playtimeMin: g.playtime_forever ?? 0,
    playtime2wMin: g.playtime_2weeks ?? 0,
    lastPlayed: g.rtime_last_played || 0,
  }));
}

// ---------- Enrichment (no key needed) ----------

export async function fetchStoreDetails(appid) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&cc=us`;
  const data = await getJson(url);
  const entry = data?.[appid];
  if (!entry?.success || !entry.data) return null;
  const d = entry.data;
  return {
    type: d.type,
    shortDescription: stripHtml(d.short_description || ""),
    genres: (d.genres || []).map((x) => x.description),
    categories: (d.categories || []).map((x) => x.description),
    developers: d.developers || [],
    releaseDate: d.release_date?.date || null,
    metacritic: d.metacritic?.score ?? null,
    controllerSupport: d.controller_support || null,
    platforms: d.platforms || null,
  };
}

export async function fetchSteamSpy(appid) {
  const url = `https://steamspy.com/api.php?request=appdetails&appid=${appid}`;
  const d = await getJson(url);
  if (!d || !d.appid) return null;
  const tags = Array.isArray(d.tags)
    ? []
    : Object.entries(d.tags || {})
        .sort((a, b) => b[1] - a[1])
        .map(([t]) => t);
  const pos = d.positive || 0;
  const neg = d.negative || 0;
  return {
    tags: tags.slice(0, 20),
    reviewPct: pos + neg >= 20 ? Math.round((100 * pos) / (pos + neg)) : null,
    reviewCount: pos + neg,
  };
}

function stripHtml(s) {
  return s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim();
}

// ---------- Local install detection ----------

const execFileP = promisify(execFile);

async function findSteamPath() {
  if (config.steamPath && existsSync(config.steamPath)) return config.steamPath;
  const candidates = [];
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileP("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"]);
      const m = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/);
      if (m) candidates.push(m[1].trim());
    } catch {}
    candidates.push("C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam");
  } else if (process.platform === "darwin") {
    candidates.push(join(homedir(), "Library/Application Support/Steam"));
  } else {
    candidates.push(join(homedir(), ".steam/steam"), join(homedir(), ".local/share/Steam"));
  }
  return candidates.find((p) => existsSync(join(p, "steamapps"))) || null;
}

export async function getInstalledAppIds() {
  const steamPath = await findSteamPath();
  if (!steamPath) return null; // unknown, as opposed to "nothing installed"
  const libraries = new Set([steamPath]);
  const vdf = join(steamPath, "steamapps", "libraryfolders.vdf");
  if (existsSync(vdf)) {
    for (const m of readFileSync(vdf, "utf8").matchAll(/"path"\s+"([^"]+)"/g)) {
      libraries.add(m[1].replace(/\\\\/g, "\\"));
    }
  }
  const ids = new Set();
  for (const lib of libraries) {
    const dir = join(lib, "steamapps");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const m = f.match(/^appmanifest_(\d+)\.acf$/);
      if (m) ids.add(Number(m[1]));
    }
  }
  return ids;
}

// ---------- Launching ----------

export function launchGame(appid) {
  const url = `steam://rungameid/${Number(appid)}`;
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  return url;
}
