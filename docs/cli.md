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
| `ara3d animations` | Lists the 216 animation clips by group |
| `ara3d props` | Lists the weapons, carried items and vehicles |
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
| `--animations <list>` | Only these clips or groups, comma-separated, such as `walk,run,idle` or `locomotion,shooter`; see `ara3d animations` |
| `--no-animations` | Rigged, without the animation clips |
| `--root-motion` | Walks, runs and strafes move the character forward instead of playing in place |
| `--separate-clips` | The model plus one file per clip, in a zip; clip files hold only the skeleton and animation (Unity's `model@clip` convention) |
| `--weapon <id>` | A weapon in the hand: `rifle`, `pistol`, `sword`, `knife` or `grenade` |
| `--carry <id>` | Something to carry, such as `backpack`, `briefcase`, `handbag`, `parcel`, `head_load` or `phone` |
| `--vehicle <id>` | A vehicle fitted to the rider, such as `motorcycle`, `horse`, `car` or `helicopter`; `auto` fits whichever vehicle the chosen riding clips need |
| `--separate-props` | The weapon as its own file as well; vehicles are always their own file |
| `--out <dir>` | Output folder; the default is `./ara3d-out` |
| `--debug` | Adds technical details when something fails |

Characters include all 216 animations unless you choose. Most games need far fewer, and files shrink a lot: the Soldier is about 28 MB as a GLB with every clip, 7 MB with `--animations walk,run,idle`, and 5 MB with `--no-animations`. A group name, such as `locomotion`, `combat`, `shooter`, `vehicles` or `emotes`, takes every clip in it.

Prop flags replace only the prop they name, so a character file's other props stay. A character with a vehicle or a separate prop is written as a zip holding the character, a `props/` folder and a README on how to line them up. If you pick a vehicle but none of its riding clips, `ara3d` suggests the clips to add.

The `zip` format is the same bundle as the builder's Export panel: GLB and FBX, the rig description, a README, the licence and the character's `params.json`. See [Exporting](exporting.md) for what each format contains.

## Progress and output

In a terminal, one status line shows what's happening (downloading with speed and time left, building, writing each format), and each finished character stays on screen. Logs and CI get each step as a plain line instead. Results go to standard output and progress to standard error, so `ara3d export ... > list.txt` saves only the results. The run ends with a summary of files, size, time and the full output path.

## When something goes wrong

- **Network:** the first-run download retries up to four times, with growing waits, when the connection drops, stalls (no data for 30 seconds) or the server is busy. It resumes where it stopped instead of starting again. If it still fails, `ara3d` prints the direct link: download and unzip the file yourself, then set `ARA3D_DATA` to that folder. That also works behind proxies and on offline machines.
- **Disk space:** `ara3d` checks free space before downloading (about 85 MB) and before writing each file, and says how much is needed and how much is free.
- **Permissions:** a folder it can't write to is named, with the setting that changes it (`--out`, or `ARA3D_CACHE` for the character data).
- **Batches:** a character that fails is reported and skipped, and the rest are still made. The run ends with how many were written and which failed, and exits with an error code so scripts and CI notice. Problems that would repeat for every character, such as a full disk, stop the run straight away.
- **Stopping:** Ctrl+C stops at once. Files are written under a temporary name and renamed only when complete, so a stopped run, a crash or a full disk never leaves a broken model. Temporary files are tidied up on the next run.
- **Details:** messages are written for people. Add `--debug` for the technical detail behind one.

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

# Only the clips a shooter needs, moving forward, for Unity
npx ara3d export --preset "The Soldier" --animations locomotion,shooter,jump --root-motion --separate-clips

# A rider: rifle in hand, backpack on, a motorcycle and its riding clips
npx ara3d export --preset "The Soldier" --weapon rifle --carry backpack --vehicle motorcycle --animations locomotion,vehicles

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
| `ARA3D_DATA_URL` | Download the character data from a mirror instead of GitHub, for networks that can't reach it; the download is still checked against its checksum |

## Licence

The tool is MIT. The characters it makes are built from CC0 MakeHuman data and the animations come from the CMU Graphics Lab Motion Capture Database, so you can use them in commercial projects. Each ZIP export includes the full licence text.

## For maintainers

The CLI lives in `packages/cli/` and shares the generator code with the website. `npm run release-cli` packs `public/assets` (without the interface thumbnails) into a zip. If the zip changed, it uploads it to the `cli-data` release and records it in `packages/cli/src/data-version.json`, which you then commit. It then builds the CLI. The zip is deterministic, so unchanged assets upload nothing. `npm run release-cli -- --publish --otp <code>` also publishes the package to npm: run `npm login` first, turn on two-factor authentication on your npm account (npm requires it to publish), and pass the current code from your authenticator app. Raise the version in `packages/cli/package.json` for each release.
