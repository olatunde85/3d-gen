# Command line (ara3d)

`ara3d` generates realistic, rigged and animated characters from the command line, on your own machine. It needs **Node 20+** and works on Windows, macOS and Linux. You don't need to clone this repository.

```bash
npx ara3d export --preset "The Soldier"
```

The first run downloads the character data (about 50 MB) and caches it, so later runs start straight away and work offline. Characters are built locally in a few seconds each.

## Commands

| Command | What it does |
|---|---|
| `ara3d export [options]` | Builds characters and writes GLB, FBX, OBJ or ZIP files |
| `ara3d presets` | Lists the preset characters |
| `ara3d new <name> [--preset P]` | Writes a starter character file to edit |
| `ara3d schema [character\|film]` | Prints a JSON schema, for editors and AI tools |
| `ara3d --help`, `ara3d --version` | Help and the installed version |

### Export options

| Option | Meaning |
|---|---|
| `--preset <name>` | A preset, such as `"The Soldier"`; repeat it for several |
| `--all-presets` | Every preset |
| `--random <seed\|a-b>` | Random characters from a seed, or a range such as `1-200`; the same seed always gives the same person |
| `--params <file>` | A character file; repeat it for several (see below) |
| `--formats <list>` | `glb`, `fbx`, `obj` or `zip`, comma-separated; the default is `glb` |
| `--detail <level>` | `low`, `medium` or `high` |
| `--no-animations` | Rigged, without the animation clips, for much smaller files |
| `--out <dir>` | Output folder; the default is `./ara3d-out` |

The `zip` format is the same bundle as the builder's Export panel: GLB and FBX, the rig description, a README, the licence and the character's `params.json`. See [Exporting](exporting.md) for what each format contains.

## Character files

`--params` accepts two kinds of file:

- **An `ara-character` file:** a preset plus the changes you want. `ara3d new hero --preset "The Soldier"` writes one:
  ```json
  {
    "$schema": "https://ara3dgen.com/schemas/character.v1.json",
    "kind": "ara-character",
    "version": 1,
    "preset": "The Soldier",
    "params": { "name": "hero" }
  }
  ```
  Editors such as VS Code read the `$schema` line and offer every field, ID and range as you type. It's the same format that the builder's LLM Assist uses, so an AI assistant can write these files too.
- **A `params.json`** from any export: the character's complete settings, so an exported character can be rebuilt or changed later.

## Examples

```bash
# 200 different townsfolk, light enough for a crowd
npx ara3d export --random 1-200 --detail low --no-animations --out Assets/Townsfolk

# A hero for PC and for phones, from one character file
npx ara3d export --params hero.json --detail high --formats glb,fbx --out build/pc
npx ara3d export --params hero.json --detail low --out build/mobile

# Every preset, for a quick look in Blender
npx ara3d export --all-presets --out presets
```

Keep the small character files in version control and rebuild the models when needed. A change to a character is a one-line change that's easy to review.

## Schemas

The schemas are published at [ara3dgen.com/schemas/](https://ara3dgen.com/schemas/index.json) and generated from the same catalogues as the apps:

- `character.v1.json`: a character, as used by `--params`, the builder's LLM Assist and Ara Play casts
- `studio-film.v2.json`: an Ara 3D Studio film

`ara3d schema character` prints the schema for the installed version, with no network needed after the first run.

## Settings

| Variable | Meaning |
|---|---|
| `ARA3D_CACHE` | Where the character data is cached; by default the system's cache folder (`~/Library/Caches/ara3d`, `~/.cache/ara3d` or `%LOCALAPPDATA%\ara3d\cache`) |
| `ARA3D_DATA` | Use an assets folder instead of the download, for example `public/assets` in a clone of this repository |

## Licence

The tool is MIT. The characters it makes are built from CC0 MakeHuman data and the animations come from the CMU Graphics Lab Motion Capture Database, so you can use them in commercial projects. Each ZIP export includes the full licence text.

## For maintainers

The CLI lives in `packages/cli/` and shares the generator code with the website. `npm run release-cli` packs `public/assets` (without the interface thumbnails) into a zip. If the zip changed, it uploads it to the `cli-data` release and records it in `packages/cli/src/data-version.json`, which you then commit. It then builds the CLI. The zip is deterministic, so unchanged assets upload nothing. `npm run release-cli -- --publish` also publishes the package to npm; run `npm login` first and raise the version in `packages/cli/package.json`.
