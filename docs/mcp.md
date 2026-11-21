# AI assistants (MCP)

`ara3d mcp` lets AI assistants make Ara characters, Studio films and Play games for you: Claude, Cursor, VS Code's Copilot and any other app that supports the [Model Context Protocol](https://modelcontextprotocol.io). Ask in plain words, and the assistant designs the character, builds it on your machine and writes the 3D files.

> *Make a cyberpunk hacker with a rifle, walking and running, as a GLB for my Godot game.*
>
> *Give me five random townsfolk at low detail with just idle and walk.*
>
> *Make The Female Executive in a navy suit without her bag, as FBX for Unity.*
>
> *Write a 20-second film of two agents arguing in the warehouse, with a slow push-in.*
>
> *Make a three-scene film: she rides the bus, takes the train, then flies home.*
>
> *Make a rescue mission at the military base with three guards and a pickup getaway.*

Everything runs on your computer. The first character downloads the character data (about 50 MB, once), and the files land in `ara3d-characters` in your home folder unless you ask for another place. Each answer includes a link that opens the character in the [Ara builder](https://ara3dgen.com/app/), so you can see it and keep editing. It needs [Node.js](https://nodejs.org) 20 or newer.

## Setup

**Claude Code:**

```bash
claude mcp add ara3d -- npx -y ara3d mcp
```

**Claude Desktop:** open *Settings → Developer → Edit Config* and add to `claude_desktop_config.json`, then restart Claude:

```json
{
  "mcpServers": {
    "ara3d": { "command": "npx", "args": ["-y", "ara3d", "mcp"] }
  }
}
```

**Cursor:** add the same `mcpServers` entry to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project).

**VS Code:** add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "ara3d": { "command": "npx", "args": ["-y", "ara3d", "mcp"] }
  }
}
```

Other apps take the same command: `npx -y ara3d mcp`.

## What the assistant can do

| Tool | |
|---|---|
| `create_character` | Builds a character and writes GLB, FBX, OBJ or ZIP files. Starts from a preset, a random seed, a builder share link, or a character the assistant designs. Takes animations, detail, root motion, a weapon, something to carry, a vehicle and colours |
| `list_presets` | The 63 preset characters |
| `list_animations` | The 248 animation clips, searchable, such as "dance" or "rifle" |
| `list_props` | Weapons, carried items, vehicles and expressions |
| `character_schema` | Every field of a character, so the assistant can design one: body, face, hair, clothes, colours and rig. It comes in parts |
| `create_film` | Checks an [Ara Studio](studio.md) film of one scene, or up to five scenes in different sets, as Studio does, saves it as `.ara-studio.json` and returns a link that opens it in Studio, to watch, edit and record as a video. It also runs Studio's staging check on every scene and lists any place a character or vehicle walks or drives through something, so the assistant can fix the route |
| `film_guide` | How to write a film: the core rules (including films of several scenes), then topics on request (sets, animations, sounds, the full format), and the staging map of any set (`location-map` with a set's ID) |
| `create_game` | Checks an [Ara Play](play.md) game as Play does, including where everything goes on the map, saves it as `.ara-play.json` and returns a link that opens it in Play, to play, edit, download or publish |
| `game_guide` | How to write a game: the core rules, then topics on request (game modes, the map library, appearance rules) |

Assistants usually ask before running a tool, and show what they're about to make.

Films and games are small files, so they are written straight away; there is nothing to build until Studio or Play opens them. No answer is longer than 20,000 characters, which every assistant accepts in one go: the guides come as topics, and a long topic, a big set's map or the character schema comes in numbered parts. Chapters of a game can come in any order of modes, such as a runner, then a race, then a rescue mission, and `create_game` describes each chapter. Film and game links carry the file after the `#` in the address, which stays in the browser, so opening one sends nothing to ara3dgen.com.

## Options

- **Where files go:** set `ARA3D_OUT` to change the default folder, for example `"env": { "ARA3D_OUT": "/Users/me/game/characters" }` beside `args` in the config. The assistant can also name a folder for each character.
- **Offline or a fixed copy of the data:** the same `ARA3D_DATA`, `ARA3D_DATA_URL` and `ARA3D_CACHE` settings as the [command line](cli.md).
- **Updates:** `npx -y ara3d mcp` runs the newest published `ara3d` whenever the assistant starts it (npm may reuse a copy it fetched a short while before). Assistants read the list of tools when they start the server, so restart the assistant app to pick up new tools; in Claude Code, `/mcp` can reconnect it.
- **A fixed version:** `npx -y ara3d@0.9.0 mcp` instead of `ara3d`.

## Good to know

- **Smaller, faster files:** ask for only the animations you need. Every clip makes the file bigger and the build slower; a character with all 248 is about 28 MB.
- **Licence:** characters are built from CC0 MakeHuman data, with animations from the CMU Graphics Lab Motion Capture Database, so you can use them in commercial projects.
