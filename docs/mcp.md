# AI assistants (MCP)

`ara3d mcp` lets AI assistants make Ara characters for you: Claude, Cursor, VS Code's Copilot and any other app that supports the [Model Context Protocol](https://modelcontextprotocol.io). Ask in plain words, and the assistant designs the character, builds it on your machine and writes the 3D files.

> *Make a cyberpunk hacker with a rifle, walking and running, as a GLB for my Godot game.*
>
> *Give me five random townsfolk at low detail with just idle and walk.*
>
> *Make The Female Executive in a navy suit without her bag, as FBX for Unity.*

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
| `list_presets` | The 32 preset characters |
| `list_animations` | The 216 animation clips, searchable, such as "dance" or "rifle" |
| `list_props` | Weapons, carried items, vehicles and expressions |
| `character_schema` | Every field of a character, so the assistant can design one: body, face, hair, clothes, colours and rig |

Assistants usually ask before running a tool, and show what they're about to make.

## Options

- **Where files go:** set `ARA3D_OUT` to change the default folder, for example `"env": { "ARA3D_OUT": "/Users/me/game/characters" }` beside `args` in the config. The assistant can also name a folder for each character.
- **Offline or a fixed copy of the data:** the same `ARA3D_DATA`, `ARA3D_DATA_URL` and `ARA3D_CACHE` settings as the [command line](cli.md).
- **A fixed version:** `npx -y ara3d@0.4.0 mcp` instead of `ara3d`.

## Good to know

- **Smaller, faster files:** ask for only the animations you need. Every clip makes the file bigger and the build slower; a character with all 216 is about 28 MB.
- **Licence:** characters are built from CC0 MakeHuman data, with animations from the CMU Graphics Lab Motion Capture Database, so you can use them in commercial projects.
