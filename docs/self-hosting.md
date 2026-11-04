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

## Studio audio

Speech recording/upload, Web Audio effects and procedural background music work without a server API or API key. Native device speech is available for quick read-throughs. Exportable typed speech optionally downloads a pinned Supertonic 2 model when requested; those large files are excluded from the static build. To mirror them, set `VITE_STUDIO_TTS_MODEL_URL` before building and follow the [Studio hosting instructions](studio.md#hosting-optional-speech), including its licence. The shipped CPU WASM runtime stays below Cloudflare Pages’ 25 MiB per-file limit. Serve `.wasm` as `application/wasm` and `.mjs` as JavaScript. Microphone capture and WebCodecs export need HTTPS or localhost.

## LLM Assist relay

LLM Assist's optional **Generate here** calls Claude with each user's own Anthropic API key. Some Anthropic organisations block calls made directly from web pages (the browser reports an origin or CORS error), so the site can relay those requests through its own origin:

- **Locally:** `npm run dev` and `npm run preview` serve the relay at `/anthropic-relay` automatically.
- **Cloudflare Pages:** the relay is the Pages Function in `functions/anthropic-relay/`. Deploy with `npx wrangler pages deploy dist` from the repository root, so the function is included; drag-and-drop **Upload assets** deploys static files only.
- **Other hosts:** forward `POST /anthropic-relay/v1/messages` and `GET /anthropic-relay/v1/models/*` to `https://api.anthropic.com/v1/…`, passing only the `x-api-key`, `anthropic-version`, `anthropic-beta`, `content-type` and `accept` headers, and answer `GET /anthropic-relay/ping` with `{"ok":true,"relay":"anthropic"}`. `scripts/anthropic-relay-core.ts` is a ready-made, web-standard handler.

The relay stores nothing and forwards only Claude message and model requests. Without a relay, Ara calls Anthropic directly, which works for keys whose organisation allows browser access.
