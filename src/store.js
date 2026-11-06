// Local JSON cache: owned games, per-game metadata, and recommendation feedback.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, log, requireCredentials } from "./config.js";
import { fetchOwnedGames, fetchSteamSpy, fetchStoreDetails, getInstalledAppIds } from "./steam.js";

const FILES = {
  library: join(DATA_DIR, "library.json"),
  details: join(DATA_DIR, "details.json"),
  feedback: join(DATA_DIR, "feedback.json"),
};

function load(name, fallback) {
  try {
    return existsSync(FILES[name]) ? JSON.parse(readFileSync(FILES[name], "utf8")) : fallback;
  } catch (e) {
    log(`Could not read ${FILES[name]}: ${e.message}`);
    return fallback;
  }
}

function save(name, value) {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILES[name] + ".tmp";
  writeFileSync(tmp, JSON.stringify(value, null, 1));
  renameSync(tmp, FILES[name]);
}

export const getLibrary = () => load("library", { fetchedAt: null, games: [] });
export const getDetails = () => load("details", {});
export const getFeedback = () => load("feedback", []);

export async function refreshOwnedGames() {
  requireCredentials();
  const games = await fetchOwnedGames();
  const lib = { fetchedAt: new Date().toISOString(), games };
  save("library", lib);
  return lib;
}

export function missingDetails() {
  const details = getDetails();
  return getLibrary().games.filter((g) => !details[g.appid]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch store + SteamSpy metadata for games that don't have it yet.
 * Paced at ~1.6s per game to stay under the store API's ~200 requests / 5 min limit.
 */
export async function enrichMissing({ limit = Infinity, onProgress } = {}) {
  const details = getDetails();
  const todo = missingDetails().slice(0, limit);
  let done = 0;
  for (const g of todo) {
    const started = Date.now();
    const [store, spy] = await Promise.all([
      fetchStoreDetails(g.appid).catch((e) => (log(`store ${g.appid}: ${e.message}`), undefined)),
      fetchSteamSpy(g.appid).catch((e) => (log(`steamspy ${g.appid}: ${e.message}`), undefined)),
    ]);
    // undefined = request failed (retry next time); null = Steam has no data (don't retry).
    if (store !== undefined || spy !== undefined) {
      details[g.appid] = { store: store ?? null, spy: spy ?? null, enrichedAt: new Date().toISOString() };
    }
    done++;
    onProgress?.(done, todo.length, g.name);
    if (done % 10 === 0) save("details", details);
    const wait = 1600 - (Date.now() - started);
    if (wait > 0 && done < todo.length) await sleep(wait);
  }
  save("details", details);
  return { enriched: done, remaining: missingDetails().length };
}

const SENTIMENTS = new Set(["loved_it", "liked", "not_now", "not_for_me"]);

/** appid -> { sentiment: latest loved/liked/not_now/not_for_me entry, lastSuggested, lastLaunched } */
export function feedbackSummary() {
  const out = new Map();
  for (const f of getFeedback()) {
    const s = out.get(f.appid) || {};
    if (SENTIMENTS.has(f.verdict)) s.sentiment = f;
    else if (f.verdict === "suggested") s.lastSuggested = f;
    else if (f.verdict === "launched") s.lastLaunched = f;
    out.set(f.appid, s);
  }
  return out;
}

export function addFeedback(entry) {
  const fb = getFeedback();
  fb.push({ ...entry, at: new Date().toISOString() });
  save("feedback", fb.slice(-500));
}

/** Merge everything into one record per game. */
export async function buildGames() {
  const { games } = getLibrary();
  const details = getDetails();
  const installed = await getInstalledAppIds().catch(() => null);
  const fb = feedbackSummary();

  return games
    .map((g) => {
      const d = details[g.appid] || {};
      const store = d.store || {};
      const spy = d.spy || {};
      return {
        appid: g.appid,
        name: g.name,
        type: store.type || null,
        hours: +(g.playtimeMin / 60).toFixed(1),
        hours2w: +(g.playtime2wMin / 60).toFixed(1),
        lastPlayed: g.lastPlayed ? new Date(g.lastPlayed * 1000).toISOString().slice(0, 10) : null,
        installed: installed ? installed.has(g.appid) : null,
        tags: spy.tags || [],
        genres: store.genres || [],
        categories: store.categories || [],
        reviewPct: spy.reviewPct ?? null,
        metacritic: store.metacritic ?? null,
        shortDescription: store.shortDescription || "",
        developers: store.developers || [],
        releaseDate: store.releaseDate || null,
        controllerSupport: store.controllerSupport || null,
        enriched: Boolean(details[g.appid]),
        feedback: fb.get(g.appid)?.sentiment || null,
        lastSuggested: fb.get(g.appid)?.lastSuggested?.at || null,
      };
    })
    .filter((g) => !g.type || g.type === "game");
}
