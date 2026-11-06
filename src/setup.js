// `steam-suggester setup`: ask for Steam details, check them, download the library,
// then explain how to use it with or without an AI assistant.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_PATH, HOME, ROOT, config } from "./config.js";
import { createPrompter, style } from "./prompt.js";
import { buildGames, enrichMissing, missingDetails, refreshOwnedGames } from "./store.js";

const { bold, green, red, dim, cyan } = style;

function readConfigFile() {
  const env = {};
  if (!existsSync(CONFIG_PATH)) return env;
  for (const line of readFileSync(CONFIG_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function writeConfigFile({ STEAM_API_KEY, STEAM_ID, STEAM_PATH }) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(
    CONFIG_PATH,
    [
      "# steam-suggester settings. Keep this file private: it holds your Steam API key.",
      `STEAM_API_KEY=${STEAM_API_KEY || ""}`,
      `STEAM_ID=${STEAM_ID || ""}`,
      STEAM_PATH ? `STEAM_PATH=${STEAM_PATH}` : "# STEAM_PATH=C:\\Program Files (x86)\\Steam",
      "",
    ].join("\n"),
    { mode: 0o600 }
  );
}

/** How an MCP client should launch the server: via npx when installed from npm, else this checkout. */
function serverCommand() {
  const fromPackage = /node_modules|_npx/.test(ROOT);
  return fromPackage
    ? { command: "npx", args: ["-y", "steam-suggester", "serve"] }
    : { command: "node", args: [join(ROOT, "bin", "steam-suggester.js").replace(/\\/g, "/"), "serve"] };
}

const step = (n, title) => console.log(`\n${bold(`[${n}/4] ${title}`)}`);

export async function runSetup() {
  const p = createPrompter();
  try {
    console.log(bold("\nsteam-suggester setup"));
    console.log(dim("Your details stay on this computer. The only sites contacted are Steam and SteamSpy."));

    const env = readConfigFile();

    step(1, "Your Steam profile");
    console.log(dim("First, make your game list visible: Steam > your profile > Edit Profile > Privacy Settings >"));
    console.log(dim("set 'Game details' to Public."));
    console.log(dim("Then paste your profile URL (e.g. https://steamcommunity.com/id/yourname/) or SteamID64."));
    env.STEAM_ID = (await p.ask(env.STEAM_ID ? `Profile [${env.STEAM_ID}]: ` : "Profile: ")) || env.STEAM_ID;

    step(2, "Steam Web API key");
    console.log(dim("Get a free key at ") + cyan("https://steamcommunity.com/dev/apikey"));
    console.log(dim("For 'Domain Name' type ") + "localhost" + dim(" (Steam doesn't check it), tick the terms box, click Register."));
    env.STEAM_API_KEY =
      (await p.ask(env.STEAM_API_KEY ? "API key [press Enter to keep the saved one]: " : "API key: ")) || env.STEAM_API_KEY;

    if (!env.STEAM_ID || !env.STEAM_API_KEY) throw new Error("A profile and an API key are both needed.");
    writeConfigFile(env);
    Object.assign(config, { apiKey: env.STEAM_API_KEY, steamId: env.STEAM_ID });
    console.log(green(`Saved to ${CONFIG_PATH}`));

    step(3, "Downloading your library");
    let lib;
    try {
      lib = await refreshOwnedGames();
    } catch (e) {
      console.log(red(`\n${e.message}`));
      console.log(dim("Common causes: the key was pasted wrong, the profile is misspelled, or 'Game details' isn't Public."));
      console.log(dim("Fix it and run `steam-suggester setup` again."));
      process.exitCode = 1;
      return;
    }
    const installed = (await buildGames()).filter((g) => g.installed).length;
    console.log(green(`Found ${lib.games.length} games (${installed} installed on this PC).`));

    const todo = missingDetails().length;
    if (todo) {
      console.log(`Suggestions need each game's tags. Fetching them takes about ${Math.ceil((todo * 1.6) / 60)} min for ${todo} games.`);
      const go = ((await p.ask("Fetch now? [Y/n] ")) ?? "y").toLowerCase();
      if (!go.startsWith("n")) {
        console.log(dim("Ctrl+C is safe; `steam-suggester sync` picks up where it left off."));
        const r = await enrichMissing({
          onProgress: (i, n, name) => process.stdout.write(`\r  ${i}/${n}  ${name.slice(0, 50).padEnd(50)}`),
        });
        console.log(`\n${green("Done.")}${r.remaining ? ` ${r.remaining} couldn't be fetched; run \`steam-suggester sync\` later to retry.` : ""}`);
      } else {
        console.log(dim("Skipped. Run `steam-suggester sync` whenever you like."));
      }
    } else {
      console.log(green("Tags already downloaded."));
    }

    step(4, "How do you want to use it?");
    const mode = await p.choose(
      "",
      {
        noai: { label: "On its own, no AI: answer a few questions, get suggestions" },
        ai: { label: "With an AI assistant (Claude, Cursor, VS Code, LM Studio...)" },
        both: { label: "Both" },
      },
      "noai"
    );

    console.log(`\n${bold("All set.")}`);
    if (mode !== "ai") {
      console.log(`\n${bold("Without AI:")} run ${cyan("steam-suggester pick")}`);
      console.log(dim("Quick version: steam-suggester pick --mood cozy --time short --installed"));
    }
    if (mode !== "noai") {
      const cmd = serverCommand();
      const json = JSON.stringify({ mcpServers: { steam: cmd } }, null, 2);
      console.log(`\n${bold("With an AI assistant:")} add steam-suggester as an MCP server.`);
      console.log(`\n  Claude Code:\n    ${cyan(`claude mcp add steam --scope user -- ${cmd.command} ${cmd.args.join(" ")}`)}`);
      console.log(`\n  Claude desktop, Cursor, LM Studio and most others: add this to the app's MCP config file:`);
      console.log(json.replace(/^/gm, "    "));
      console.log(dim("\n  Then restart the app and ask something like \"I'm tired, want something cozy for an hour\"."));
    }
  } finally {
    p.close();
  }
}
