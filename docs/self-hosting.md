# Self-hosting

Ara 3D Gen runs entirely on your machine: in the browser, or headless from the command line. It works on **Windows, macOS and Linux**, and needs **Node 20+** and **git**. The app runs in any current Chrome, Edge, Firefox or Safari.

## Install

```bash
git clone https://github.com/olatunde85/3d-gen.git
cd 3d-gen
npm install
npm run setup-assets   # one-time: downloads CC0 MakeHuman data (~420 MB) and builds public/assets (~85 MB)
npm run dev            # open http://localhost:5173 (landing page; the app is at /app/)
```

On Windows, run the same commands in PowerShell, Command Prompt or Git Bash.

## Update an existing clone

```bash
git pull
npm install            # picks up any new or updated dependencies
npm run setup-assets   # rebuilds public/assets; reuses the data already downloaded, so it takes about a minute
npm run dev
```

Re-run `setup-assets` after every update. New versions can add or change generated assets (for example new eye colours), and the app falls back to the old ones until you do. If you have local changes, commit or stash them before `git pull`. Each [release](https://github.com/olatunde85/3d-gen/releases) lists what changed.

## Build and deploy

```bash
npm run build          # -> dist/: landing page at /, the app at /app/, Studio at /studio/, these docs at /docs/, videos at /media/
```

Set `BASE_PATH=/sub/path/` when hosting under a sub-path, such as GitHub Pages.

The whole site is static files, and all the character work runs in each visitor's browser, so free static hosting scales with traffic. On Cloudflare Pages, static bandwidth is unmetered: upload `dist/` (Workers & Pages → Create → Pages → Upload assets) or use any static host. Cache headers come with the build (`_headers`). A first visit downloads about 13 MB, and the browser caches it after that.

## Command line

Generate characters without opening a browser, for batch jobs, CI or asset pipelines:

```bash
npm run export -- --preset "The Soldier" --detail high --out out
npm run export -- --random 42 --formats glb,fbx
npm run export -- --params my.params.json          # regenerate from a saved params.json
npm run export -- --all-presets --out out
```

Every exported zip includes the character's `params.json`, so any character can be regenerated or tweaked later.

## Tests

```bash
npm test            # builds 259 characters and validates every export format
npm run test:gltf   # exports GLBs, loads them with three.js in headless Chrome, checks every bone of every clip
npm run test:studio:model # validates Studio recipes and timeline continuity
npm run test:studio # Studio browser flows and real MP4 encoding
npm run test:ui     # drives the app in headless Chrome: build, slider, preset, animation browser, export
```

`test:gltf`, `test:ui` and `test:studio` need Chrome, Chromium or Edge (set `CHROME=/path/to/browser` if it isn't found). The `scripts/blender_*.py` scripts import exports into Blender and render previews; Blender is optional.

## Motion capture data

The motion-captured clips are baked into `src/core/anim/clips/mocap-data.ts`, which is committed, so you don't need the source recordings. To change them, edit `scripts/mocap-takes.ts`, run `npm run setup-assets` (it downloads the takes into `vendor/mocap/cmu`), then `npm run build-mocap`. See [Animations](animations.md#motion-capture).

## Studio

Studio needs no server API or API key: sets, music, sound effects, recording and voice effects all run in the browser. Microphone recording and video export need HTTPS or localhost.

**Serving it:** the build ships the compressed music in `media/music/` and the sound effects in `media/effects/`, each with its credits. Serve `.mp3` as `audio/mpeg`, `.wasm` as `application/wasm` and `.mjs` as JavaScript. Every file is under Cloudflare Pages' 25 MiB limit.

**The speech model:** typed dialogue downloads the Supertonic 2 model (about 265 MB) from Hugging Face the first time it's used, pinned to revision `75e6727618a02f323c720cba9478152d4bc16ca4` of `Supertone/supertonic-2`. It isn't part of the build. To serve it yourself, copy that model directory to a CORS-enabled host (object storage or a model host), keep its licence with it, and set `VITE_STUDIO_TTS_MODEL_URL` before building. The directory needs:

- `onnx/tts.json` and `onnx/unicode_indexer.json`
- `onnx/duration_predictor.onnx`, `text_encoder.onnx`, `vector_estimator.onnx` and `vocoder.onnx`
- `voice_styles/F1.json`, `F2.json`, `M1.json` and `M2.json`

The speech runtime (about 14 MiB, single-threaded, no cross-origin isolation headers needed) loads only when speech is generated. The character builder and normal Studio playback never load it.

**Rebuilding music and sound effects:** the compressed files are committed, so a normal build doesn't need the originals or FFmpeg. To regenerate them, install FFmpeg, put the original recordings in `music-for-ara/` and `sound-for-ara/` at the project root (they aren't kept in the repository), then run `npm run build:studio-music` or `npm run build:studio-effects`. Music is loudness-matched (about −20 LUFS) and compressed to MP3; effects are compressed without trimming.

**Studio tests:**

```bash
npm run test:studio:model         # project format, validation, timelines and seating
npm run test:parcel               # ordinary held-parcel movement, two-hand contact, unchanged gait, clearance and release state
npm run test:animations           # animation poses, recovered landings, recorded gait layers and parcels on 18 bodies/rigs/binds
npm run test:studio               # every set, the editor, LLM Assist, recovery, MP4 export and the builder round trip
npm run test:studio -- --new-project # fresh projects, save-first downloads, recordings, Undo and mobile controls
npm run test:studio -- --cast     # five characters, arrangements, framing and an MP4 with music
npm run test:studio -- --sfx      # sound-effect timing, mixing, editing and export
npm run setup:studio-speech       # caches the speech model once, for the next suite
npm run test:studio -- --audio    # voice effects, music, device voices, real speech generation, recording and bundles
```

Screenshots and videos from the browser suites are saved in `out/studio-expansion/`. `--audio` uses a simulated microphone; set `STUDIO_TTS_FIXTURE` to use a model directory you already have.

## Rebuild the Studio README preview

The checked-in GIF shows the current warehouse example. To regenerate it, install FFmpeg and a supported Chrome, Chromium or Edge browser, then run:

```bash
npm run test:studio -- --example
npm run build:studio-example-gif
```

The first command renders the complete example to an ignored MP4 under `out/studio-expansion/`. The second preserves its 30-second timing and creates the compressed GIF under `docs/media/`. Normal site builds use that checked-in asset and do not need to render it again.

Vehicle validation: `npm run test:vehicles` checks fitting across body shapes, rigs and bind poses and loads animated GLB/FBX props through real importers. `npm run test:studio -- --vehicles` exercises vehicle controls, recovery, deterministic scrubbing and GPU disposal, and writes visual reviews under `out/vehicles/`. Vehicles use local procedural geometry; they require no external downloads.
