# steam-suggester

Pick something to play from the Steam games you **already own**, based on your mood.

Use it two ways:

- **No AI.** Answer a few questions in your terminal (mood, how much time you have, new or
  familiar) and get three suggestions. Scoring is plain arithmetic on Steam tags, your
  playtime and your feedback. No AI model is involved anywhere.
- **With an AI assistant.** Run it as an [MCP](https://modelcontextprotocol.io) server and ask
  Claude, Cursor, VS Code, LM Studio or any other MCP app things like *"I'm wiped out, want
  something cozy for an hour"*.

Fetching your library never uses AI either way. It only talks to Steam and SteamSpy.

## Setup

You need [Node.js](https://nodejs.org) 20.12 or newer.

```bash
npx steam-suggester setup
```

Setup walks you through:

1. **Making your game list visible.** Steam → your profile → Edit Profile → Privacy Settings →
   set **Game details** to **Public**.
2. **Your profile.** Paste your profile URL, e.g. `https://steamcommunity.com/id/yourname/`.
3. **A free Steam Web API key.** Get it at https://steamcommunity.com/dev/apikey. For
   **Domain Name** type `localhost` (Steam doesn't check it).
4. **Downloading your library** and each game's tags (about 1.6 seconds per game).
5. **Choosing no AI, AI or both**, with the exact next steps for each.

## Without AI

```bash
npx steam-suggester pick
```

Pick a mood: cozy, challenge, story, action, spooky, brainy, social, create, explore, chill
or surprise. Then choose how much time you have and whether you want something new.
You'll get three games with the reasons they were picked. Press a number to launch one,
`r` to reroll, or `x2` to never see game 2 again.

Skip the questions:

```bash
npx steam-suggester pick --mood cozy --time short --installed
npx steam-suggester pick --mood story --new
```

Moods are just tag weights in [`src/moods.js`](src/moods.js); tweak them to taste.

## With an AI assistant

**Claude Code:**

```bash
claude mcp add steam --scope user -- npx -y steam-suggester serve
```

**Claude desktop, Cursor, LM Studio and most others.** Add this to the app's MCP config,
then restart it:

```json
{
  "mcpServers": {
    "steam": { "command": "npx", "args": ["-y", "steam-suggester", "serve"] }
  }
}
```

The assistant gets these tools:

| Tool | What it does |
|---|---|
| `list_games` | Compact view of your library with filters (installed, unplayed, tags, sort) |
| `get_game` | Full details for one game |
| `refresh_library` | Re-download playtime, and tags for new games |
| `launch_game` | Start a game through Steam |
| `record_feedback` | Remember suggestions and reactions (`not_for_me` hides a game for good) |

## Keeping it up to date

```bash
npx steam-suggester sync
```

This refreshes playtime and fetches tags for newly bought games. It's safe to stop and re-run.

## Privacy and data

- Settings and cache live in `~/.steam-suggester` (override with `STEAM_SUGGESTER_HOME`).
  Delete the folder to start fresh.
- Your API key stays in `~/.steam-suggester/config.env` and is only ever sent to Steam.
- Sources: owned games and playtime from the Steam Web API, genres and descriptions from the
  Steam store, community tags and review scores from SteamSpy, and installed games from your
  local Steam folder.
- No telemetry. Your feedback ("not for me" and so on) is stored locally and shared between
  the no-AI and AI modes.

## Developing

```bash
git clone <repo> && cd steamsuggester && npm install
node bin/steam-suggester.js setup
```
