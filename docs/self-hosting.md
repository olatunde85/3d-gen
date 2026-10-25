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
npm run build          # -> dist/: landing page at /, the app at /app/, these docs at /docs/, videos at /media/
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
npm run test:ui     # drives the app in headless Chrome: build, slider, preset, animation browser, export
```

`test:gltf` and `test:ui` need Chrome, Chromium or Edge (set `CHROME=/path/to/browser` if it isn't found). The `scripts/blender_*.py` scripts import exports into Blender and render previews; Blender is optional.

## Motion capture data

The motion-captured clips are baked into `src/core/anim/clips/mocap-data.ts`, which is committed, so you don't need the source recordings. To change them, edit `scripts/mocap-takes.ts`, run `npm run setup-assets` (it downloads the takes into `vendor/mocap/cmu`), then `npm run build-mocap`. See [Animations](animations.md#motion-capture).
