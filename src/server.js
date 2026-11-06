#!/usr/bin/env node
// MCP server: lets Claude browse your Steam library and suggest something to play.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { log } from "./config.js";
import { launchGame } from "./steam.js";
import { addFeedback, buildGames, enrichMissing, getFeedback, getLibrary, refreshOwnedGames } from "./store.js";

const INSTRUCTIONS = `You help the user pick a game from the Steam library they already own, based on their mood, energy, available time and anything else they say.
How to recommend:
1. Call list_games (filters optional) to see the library. Tags come from the Steam community and are the best signal for mood (e.g. Relaxing, Cozy, Difficult, Story Rich, Atmospheric, Horror).
2. Use playtime: 0h = never tried (a "backlog" pick), lots of hours = a comfort favourite, recent hours = currently into it. Use your own knowledge of each game for length and session size (e.g. roguelites suit short sessions, long RPGs don't).
3. Respect feedback: avoid games marked not_for_me; treat not_now as "not lately"; avoid repeating recent suggestions unless asked.
4. Give 2-4 picks with a one-line reason each tied to what the user said. Prefer installed games when the user wants to play right now.
5. Call record_feedback with verdict "suggested" for the games you pick, and with the user's reaction if they give one. Offer to launch a game with launch_game.`;

const server = new McpServer({ name: "steam-suggester", version: "1.0.0" }, { instructions: INSTRUCTIONS });

const text = (s) => ({ content: [{ type: "text", text: s }] });
const fail = (e) => ({ content: [{ type: "text", text: `Error: ${e.message ?? e}` }], isError: true });

function ensureLibrary() {
  if (!getLibrary().games.length) {
    throw new Error("Library not downloaded yet. Call refresh_library first (or run `npm run sync`).");
  }
}

function matches(g, terms) {
  const hay = [...g.tags, ...g.genres, ...g.categories].map((t) => t.toLowerCase());
  return terms.some((t) => hay.some((h) => h.includes(t.toLowerCase())));
}

function compactLine(g) {
  const bits = [`${g.appid}`, g.name, `${g.hours}h`];
  if (g.hours2w) bits.push(`${g.hours2w}h in last 2w`);
  if (g.lastPlayed) bits.push(`last ${g.lastPlayed.slice(0, 7)}`);
  if (g.installed) bits.push("INSTALLED");
  if (g.reviewPct != null) bits.push(`${g.reviewPct}% positive`);
  const tags = g.tags.length ? g.tags.slice(0, 8) : g.genres;
  if (tags.length) bits.push(`tags: ${tags.join(", ")}`);
  if (g.feedback) bits.push(`feedback: ${g.feedback.verdict}${g.feedback.note ? ` (${g.feedback.note})` : ""}`);
  return bits.join(" | ");
}

server.registerTool(
  "list_games",
  {
    title: "List games in the Steam library",
    description:
      "List owned games, one compact line each: appid | name | your hours | recent hours | last played | installed | review % | top tags | your feedback. All filters are optional; call with no arguments to see everything.",
    inputSchema: {
      installed_only: z.boolean().optional().describe("Only games installed on this PC"),
      played: z.enum(["any", "unplayed", "played"]).optional().describe("unplayed = under 1 hour of playtime"),
      tags_any: z.array(z.string()).optional().describe("Keep games with at least one of these tags/genres/categories (substring match, case-insensitive)"),
      tags_none: z.array(z.string()).optional().describe("Drop games with any of these tags/genres/categories"),
      exclude_rejected: z.boolean().optional().describe("Hide games the user marked not_for_me (default true)"),
      sort: z.enum(["playtime", "recent", "name", "rating"]).optional().describe("Default: playtime (most played first)"),
      limit: z.number().int().positive().optional().describe("Max games to return (default 400)"),
    },
  },
  async (a) => {
    try {
      ensureLibrary();
      let games = await buildGames();
      const total = games.length;
      if (a.installed_only) games = games.filter((g) => g.installed);
      if (a.played === "unplayed") games = games.filter((g) => g.hours < 1);
      if (a.played === "played") games = games.filter((g) => g.hours >= 1);
      if (a.tags_any?.length) games = games.filter((g) => matches(g, a.tags_any));
      if (a.tags_none?.length) games = games.filter((g) => !matches(g, a.tags_none));
      if (a.exclude_rejected !== false) games = games.filter((g) => g.feedback?.verdict !== "not_for_me");
      const sorters = {
        playtime: (x, y) => y.hours - x.hours,
        recent: (x, y) => (y.lastPlayed || "").localeCompare(x.lastPlayed || ""),
        name: (x, y) => x.name.localeCompare(y.name),
        rating: (x, y) => (y.reviewPct ?? -1) - (x.reviewPct ?? -1),
      };
      games.sort(sorters[a.sort || "playtime"]);
      const limit = a.limit ?? 400;
      const shown = games.slice(0, limit);
      const unenriched = (await buildGames()).filter((g) => !g.enriched).length;
      const header = [
        `${games.length} of ${total} games match${games.length > limit ? `, showing first ${limit}` : ""}.`,
        unenriched ? `Note: ${unenriched} games have no tags yet (run refresh_library or \`npm run sync\`).` : "",
        shown.some((g) => g.installed === null) ? "Installed status unknown (Steam folder not found)." : "",
      ].filter(Boolean);
      const recent = getFeedback().filter((f) => f.verdict === "suggested").slice(-15).map((f) => f.name);
      if (recent.length) header.push(`Recently suggested: ${[...new Set(recent)].join(", ")}`);
      return text(header.join("\n") + "\n\n" + shown.map(compactLine).join("\n"));
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "get_game",
  {
    title: "Get details for one game",
    description: "Full details for one owned game (description, genres, categories, developer, release date, controller support). Look up by appid or by (partial) name.",
    inputSchema: {
      appid: z.number().int().optional(),
      name: z.string().optional(),
    },
  },
  async ({ appid, name }) => {
    try {
      ensureLibrary();
      const games = await buildGames();
      const q = name?.toLowerCase();
      const found = appid != null ? games.filter((g) => g.appid === appid) : q ? games.filter((g) => g.name.toLowerCase().includes(q)) : [];
      if (!found.length) return text("No matching game in the library.");
      return text(JSON.stringify(found.slice(0, 5), null, 2));
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "refresh_library",
  {
    title: "Refresh the Steam library",
    description:
      "Re-download owned games and playtime from Steam, then fetch tags for up to `enrich_limit` games that don't have them yet (~1.6s per game). For a big first-time sync, `npm run sync` in a terminal is faster to watch.",
    inputSchema: {
      enrich_limit: z.number().int().min(0).max(150).optional().describe("Default 40"),
    },
  },
  async ({ enrich_limit }) => {
    try {
      const lib = await refreshOwnedGames();
      const r = await enrichMissing({ limit: enrich_limit ?? 40 });
      return text(
        `Library refreshed: ${lib.games.length} owned games. Fetched tags for ${r.enriched} games; ${r.remaining} still without tags.` +
          (r.remaining ? " Call again or run `npm run sync` to finish." : "")
      );
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "launch_game",
  {
    title: "Launch a game",
    description: "Start a game through Steam (steam://rungameid). Only call this when the user says they want to play it.",
    inputSchema: { appid: z.number().int() },
  },
  async ({ appid }) => {
    try {
      const game = getLibrary().games.find((g) => g.appid === appid);
      if (!game) return text(`App ${appid} is not in the library.`);
      launchGame(appid);
      return text(`Asked Steam to launch ${game.name}. If it isn't installed, Steam will offer to install it.`);
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerTool(
  "record_feedback",
  {
    title: "Record feedback on a game",
    description:
      "Remember a suggestion or the user's reaction so future picks improve. Verdicts: suggested (you recommended it), loved_it, liked, not_now (not in the mood lately), not_for_me (never suggest again).",
    inputSchema: {
      appid: z.number().int(),
      verdict: z.enum(["suggested", "loved_it", "liked", "not_now", "not_for_me"]),
      note: z.string().optional().describe("Short context, e.g. the mood it was suggested for or why they passed"),
    },
  },
  async ({ appid, verdict, note }) => {
    try {
      const game = getLibrary().games.find((g) => g.appid === appid);
      if (!game) return text(`App ${appid} is not in the library.`);
      addFeedback({ appid, name: game.name, verdict, note });
      return text(`Recorded ${verdict} for ${game.name}.`);
    } catch (e) {
      return fail(e);
    }
  }
);

server.registerPrompt(
  "suggest_game",
  {
    title: "Suggest a game for my mood",
    description: "Pick something to play from your Steam library",
    argsSchema: { mood: z.string().describe("How you're feeling, how much time you have, what you're in the mood for") },
  },
  ({ mood }) => ({
    messages: [
      {
        role: "user",
        content: { type: "text", text: `Suggest a game from my Steam library. Here's how I'm feeling: ${mood}` },
      },
    ],
  })
);

await server.connect(new StdioServerTransport());
log("steam-suggester MCP server running");
