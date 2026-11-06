#!/usr/bin/env node
const HELP = `steam-suggester - pick something to play from the Steam games you already own

Usage:
  steam-suggester setup      Enter your Steam details and download your library
  steam-suggester pick       Choose a mood and get suggestions (no AI involved)
  steam-suggester sync       Refresh playtime and fetch tags for new games
  steam-suggester serve      Run the MCP server for AI assistants (Claude, Cursor, ...)
  steam-suggester help       Show this help

Pick options (skip the questions):
  --mood <name>      cozy, challenge, story, action, spooky, brainy, social,
                     create, explore, chill, surprise   (--moods lists them)
  --time <length>    short, long, any
  --new              Only games you've barely played
  --favourite        Only games you've put real time into
  --installed        Only installed games
  --count <n>        How many suggestions (default 3)

Settings and cache live in ~/.steam-suggester (override with STEAM_SUGGESTER_HOME).
With no command, runs \`pick\` (or \`setup\` the first time).`;

const [cmd, ...rest] = process.argv.slice(2);

try {
  switch (cmd) {
    case "setup":
      await (await import("../src/setup.js")).runSetup();
      break;
    case "sync":
      await (await import("../src/sync.js")).runSync();
      break;
    case "serve":
      await import("../src/server.js");
      break;
    case "pick":
      await (await import("../src/pick.js")).runPick(rest);
      break;
    case undefined: {
      const { config } = await import("../src/config.js");
      const { getLibrary } = await import("../src/store.js");
      if (!config.apiKey || !getLibrary().games.length) await (await import("../src/setup.js")).runSetup();
      else await (await import("../src/pick.js")).runPick([]);
      break;
    }
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      break;
    default:
      // Allow `steam-suggester --mood cozy` as shorthand for pick.
      if (cmd.startsWith("--")) await (await import("../src/pick.js")).runPick([cmd, ...rest]);
      else {
        console.error(`Unknown command "${cmd}".\n\n${HELP}`);
        process.exitCode = 1;
      }
  }
} catch (e) {
  console.error(`\x1b[31m${e.message}\x1b[0m`);
  process.exitCode = 1;
}
