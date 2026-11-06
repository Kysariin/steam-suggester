// `steam-suggester sync`: refresh owned games and playtime, then fetch tags/genres for
// games not cached yet. Safe to stop and re-run; it picks up where it left off.
import { log } from "./config.js";
import { enrichMissing, missingDetails, refreshOwnedGames } from "./store.js";

export async function runSync() {
  const lib = await refreshOwnedGames();
  log(`Found ${lib.games.length} owned games.`);
  const todo = missingDetails().length;
  if (!todo) {
    log("All games already have tags. Done.");
    return;
  }
  log(`Fetching tags for ${todo} games (~${Math.ceil((todo * 1.6) / 60)} min). Ctrl+C is safe.`);
  const result = await enrichMissing({
    onProgress: (i, n, name) => {
      if (i % 10 === 0 || i === n) log(`${i}/${n}  ${name}`);
    },
  });
  log(`Done. ${result.remaining ? `${result.remaining} games couldn't be fetched (re-run to retry).` : ""}`);
}
