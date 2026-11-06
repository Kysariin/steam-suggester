// No-AI picker: scores your library against a mood using Steam tags, playtime and
// your feedback. Everything here is plain arithmetic on cached data.
import { FAMILIARITY, MOODS, SESSION } from "./moods.js";
import { createPrompter, style } from "./prompt.js";
import { launchGame } from "./steam.js";
import { addFeedback, buildGames, getLibrary } from "./store.js";

const DAY = 86_400_000;
const MIN_FIT = 2.2;

function tagIndex(g) {
  // Community tags are ordered by votes, so earlier tags describe the game better.
  const idx = new Map();
  g.tags.forEach((t, i) => idx.set(t.toLowerCase(), 1 - Math.min(i, 15) / 25));
  for (const t of [...g.genres, ...g.categories]) if (!idx.has(t.toLowerCase())) idx.set(t.toLowerCase(), 0.6);
  return idx;
}

export function scoreGames(games, { mood = "surprise", session = "any", familiarity = "any", installedOnly = false, exclude = new Set() } = {}) {
  const m = MOODS[mood] ?? MOODS.surprise;
  const now = Date.now();

  const results = [];
  for (const g of games) {
    if (exclude.has(g.appid)) continue;
    if (installedOnly && !g.installed) continue;
    const fb = g.feedback;
    if (fb?.verdict === "not_for_me") continue;
    if (familiarity === "new" && g.hours >= 2) continue;
    if (familiarity === "favourite" && g.hours < 5) continue;

    const idx = tagIndex(g);
    const reasons = [];
    let score = 0;

    // Mood fit
    const matched = [];
    const seen = new Set();
    let fit = 0;
    for (const [tag, w] of Object.entries(m.tags)) {
      const key = tag.toLowerCase();
      const s = idx.get(key);
      if (s && !seen.has(key)) {
        seen.add(key);
        fit += w * s;
        matched.push(tag);
      }
    }
    // A single weak tag (e.g. "Puzzle" far down the list) isn't enough to count as a match.
    if (mood !== "surprise" && fit < MIN_FIT) continue;
    score += fit * 1.5;
    const clash = m.avoid.filter((t) => idx.has(t.toLowerCase()));
    score -= clash.length * 2.5;
    if (matched.length) reasons.push(`fits: ${[...new Set(matched)].slice(0, 3).join(", ")}`);

    // Session length
    const sess = SESSION[session];
    if (session !== "any") {
      const fit = sess.tags.some((t) => idx.has(t.toLowerCase()));
      const other = SESSION[session === "short" ? "long" : "short"].tags.some((t) => idx.has(t.toLowerCase()));
      if (fit) score += 1.5;
      if (other && !fit) score -= 1.5;
    }

    // Playtime
    if (g.hours < 1) reasons.push("never really played");
    else reasons.push(`you've played ${g.hours}h`);
    if (familiarity === "favourite") score += Math.min(g.hours, 100) / 25;
    if (g.hours2w > 0) score += 0.5;

    // Quality and convenience
    if (g.reviewPct != null) {
      score += (g.reviewPct - 75) / 15;
      if (g.reviewPct >= 90) reasons.push(`${g.reviewPct}% positive`);
    }
    if (g.installed) {
      score += 0.75;
      reasons.push("installed");
    }

    // Feedback memory
    if (fb?.verdict === "loved_it") score += 1;
    if (fb?.verdict === "liked") score += 0.5;
    if (fb?.verdict === "not_now" && now - Date.parse(fb.at) < 14 * DAY) score -= 3;
    if (g.lastSuggested && now - Date.parse(g.lastSuggested) < 3 * DAY) score -= 1.5;

    if (mood === "surprise") score += Math.random() * 3;
    results.push({ game: g, score, reasons });
  }
  return results.sort((a, b) => b.score - a.score);
}

/** Pick `count` from the top results, weighted toward higher scores, so rerolls vary. */
export function sample(results, count = 3, pool = 12) {
  const top = results.slice(0, Math.max(pool, count));
  const min = Math.min(...top.map((r) => r.score));
  const picks = [];
  while (picks.length < count && top.length) {
    const weights = top.map((r) => (r.score - min + 1) ** 2);
    let x = Math.random() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while ((x -= weights[i]) > 0) i++;
    picks.push(top.splice(i, 1)[0]);
  }
  return picks.sort((a, b) => b.score - a.score);
}

function parseFlags(argv) {
  const f = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--installed") f.installedOnly = true;
    else if (a === "--new") f.familiarity = "new";
    else if (a === "--favourite" || a === "--favorite") f.familiarity = "favourite";
    else if (a === "--mood") f.mood = argv[++i];
    else if (a === "--time") f.session = argv[++i];
    else if (a === "--count") f.count = Number(argv[++i]);
    else if (a === "--moods") f.listMoods = true;
    else throw new Error(`Unknown option ${a}. Try \`steam-suggester help\`.`);
  }
  if (f.mood && !MOODS[f.mood]) throw new Error(`Unknown mood "${f.mood}". Moods: ${Object.keys(MOODS).join(", ")}`);
  if (f.session && !SESSION[f.session]) throw new Error(`--time must be one of: ${Object.keys(SESSION).join(", ")}`);
  return f;
}

function printPick(n, { game: g, reasons }) {
  console.log(`\n  ${style.bold(`${n}. ${g.name}`)}`);
  const tags = g.tags.length ? g.tags.slice(0, 5).join(", ") : g.genres.join(", ");
  if (tags) console.log(`     ${style.dim(tags)}`);
  console.log(`     ${reasons.join(" · ")}`);
}

export async function runPick(argv = []) {
  const flags = parseFlags(argv);
  if (flags.listMoods) {
    for (const [k, m] of Object.entries(MOODS)) console.log(`${k.padEnd(10)} ${m.label}`);
    return;
  }
  if (!getLibrary().games.length) throw new Error("No library yet. Run `steam-suggester setup` first.");
  const games = await buildGames();
  const knowsInstalled = games.some((g) => g.installed !== null);
  const interactive = !flags.mood;
  const p = createPrompter();

  try {
    let opts = { mood: flags.mood, session: flags.session ?? "any", familiarity: flags.familiarity ?? "any", installedOnly: !!flags.installedOnly };
    if (interactive) {
      console.log(style.bold("\nWhat are you in the mood for?"));
      opts.mood = await p.choose("", MOODS);
      opts.session = await p.choose("\nHow much time do you have?", SESSION, "any");
      opts.familiarity = await p.choose("\nNew or familiar?", FAMILIARITY, "any");
      if (knowsInstalled) {
        const a = (await p.ask("\nOnly games that are installed? [y/N] ")) ?? "";
        opts.installedOnly = a.toLowerCase().startsWith("y");
      }
    }

    const shown = new Set();
    for (;;) {
      const results = scoreGames(games, { ...opts, exclude: shown });
      if (!results.length) {
        console.log(style.red(shown.size ? "\nThat's everything that fits. Try a different mood." : "\nNothing fits those choices. Try loosening them."));
        return;
      }
      const picks = sample(results, flags.count || 3);
      console.log(style.bold(`\n${MOODS[opts.mood].label}:`));
      picks.forEach((r, i) => printPick(i + 1, r));
      for (const r of picks) {
        shown.add(r.game.appid);
        addFeedback({ appid: r.game.appid, name: r.game.name, verdict: "suggested", note: `no-AI: ${opts.mood}` });
      }
      if (!interactive) return;

      for (;;) {
        console.log(style.dim(`\n  [1-${picks.length}] play   r  reroll   x<n>  not for me (e.g. x2)   q  quit`));
        const a = ((await p.ask("> ")) ?? "q").toLowerCase();
        if (a === "q" || a === "") return;
        if (a === "r") break;
        const nfm = a.match(/^x\s*(\d+)$/);
        const n = Number(nfm ? nfm[1] : a);
        const r = picks[n - 1];
        if (!r) {
          console.log("  Didn't catch that.");
          continue;
        }
        if (nfm) {
          addFeedback({ appid: r.game.appid, name: r.game.name, verdict: "not_for_me" });
          console.log(`  Got it, won't suggest ${r.game.name} again.`);
          continue;
        }
        launchGame(r.game.appid);
        addFeedback({ appid: r.game.appid, name: r.game.name, verdict: "launched", note: `no-AI: ${opts.mood}` });
        console.log(style.green(`  Launching ${r.game.name} through Steam. Have fun!`));
        return;
      }
    }
  } finally {
    p.close();
  }
}
