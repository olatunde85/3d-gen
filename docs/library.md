# JavaScript library (ara3d)

The `ara3d` package generates realistic, rigged and animated characters inside your own web app or game, as three.js objects. Characters are built on the visitor's device, in a background worker, so the page keeps running. The character data loads from a free CDN. There's no server and no account.

```bash
npm install ara3d three
```

```js
import * as THREE from 'three';
import { createCharacter } from 'ara3d';

const hero = await createCharacter('The Soldier', { animations: ['walk', 'run', 'idle'] });
scene.add(hero.scene);

const mixer = new THREE.AnimationMixer(hero.scene);
mixer.clipAction(hero.clip('walk')).play();
// In your render loop: mixer.update(delta);
```

It's written in TypeScript and ships its types, so editors autocomplete every option. It needs three.js 0.160 or newer, a modern browser, and a bundler (Vite, webpack, Next.js and so on) or an import map. No extra bundler setup is needed: the worker is built in.

## Choosing a character

`createCharacter(input, options)` takes:

- **A preset name:** `'The Soldier'`. `PRESET_NAMES` lists all 32.
- **An `ara-character` object:** a preset plus changes, the same format as the [CLI's character files](cli.md#character-files) and the builder's LLM Assist:
  ```js
  await createCharacter({ preset: 'The Bride', params: { name: 'Ada', ageYears: 30 } });
  ```
- **Character settings:** the `params.json` from any export, or your own values. See the [character schema](https://ara3dgen.com/schemas/character.v1.json) for every field and what it means.

Unknown fields and out-of-range values are rejected with a message that says what's wrong.

## Options

| Option | Meaning |
|---|---|
| `animations` | Clip IDs or categories, such as `['walk', 'run']` or `['locomotion', 'shooter']`; `'all'` (the default, 216 clips) or `'none'`. `ANIMATIONS` lists them |
| `detail` | `'low'` (about 5–10k triangles), `'medium'` (about 30–40k) or `'high'` (about 100–120k) |
| `rootMotion` | Walks, runs and strafes move the character forward instead of playing in place |
| `weapon` | `'rifle'`, `'pistol'`, `'sword'`, `'knife'` or `'grenade'`, held in the hand |
| `carry` | Something to carry, such as `'backpack'`, `'briefcase'` or `'phone'` |
| `vehicle` | A vehicle fitted to the rider, such as `'motorcycle'` or `'horse'`; it comes back in `props` |
| `onProgress` | `(label, fraction) => {}`, for a loading bar |
| `assetsUrl` | Where the character data is served from; see [Hosting the data](#hosting-the-data) |

Choose only the clips you need. A character with every clip is about 28 MB and takes several seconds to build; with three clips it's about 7 MB and takes 1–3 seconds.

## What you get back

| Property | Meaning |
|---|---|
| `scene` | The character: a three.js `Group` to add to your scene |
| `animations` | The clips, for `THREE.AnimationMixer` |
| `clip(id)` | The clip for an ID, such as `hero.clip('walk')` |
| `props` | Props exported beside the character, such as a vehicle: `{ name, scene, animations }`. They share the character's origin, so add them at the same position and play the matching clip on both |
| `params` | The character's full settings. Save them to rebuild the same character later |
| `height` | Standing height in metres |
| `glb` | The character as a GLB file, for downloading or uploading |
| `dispose()` | Frees the GPU memory when you remove the character |

`createCharacterGLB(input, options)` returns only the GLB bytes and doesn't need three.js. Use it to save characters, send them to a server, or load them in another engine.

## Lists

`PRESET_NAMES`, `ANIMATIONS` (each clip's `id`, `name`, `group`, `category` and whether it loops) and `PROPS` (`weapons`, `carried`, `vehicles`) are available straight away, without loading any data. Use them to build pickers.

## Hosting the data

By default the character data (about 50 MB, loaded only as needed and cached by the browser) comes from jsDelivr, a free public CDN, through the [`ara3d-data`](https://www.npmjs.com/package/ara3d-data) npm package. `DEFAULT_ASSETS_URL` shows the exact address, which is pinned to the data version this release expects.

To serve it yourself, for example for an offline app or a strict network:

```bash
npm install ara3d-data
cp -r node_modules/ara3d-data/assets public/ara3d-assets
```

```js
await createCharacter('The Soldier', { assetsUrl: '/ara3d-assets/' });
```

## Good to know

- **Responsiveness:** building runs in a worker, but loading the finished model into three.js happens on the page and takes a moment for large characters. Build during a loading screen, or keep `animations` small.
- **Content-Security-Policy:** the worker runs from a `blob:` address. Sites with a strict policy need `worker-src blob:`.
- **Several characters:** the data loads once and is shared, so later characters build faster.
- **Licence:** the library is MIT. Characters are built from CC0 MakeHuman data, with animations from the CMU Graphics Lab Motion Capture Database, so you can use them in commercial projects.

## For maintainers

The library lives beside the CLI in `packages/cli/` (`src/index.ts`, with the worker in `src/library/`) and shares the generator code with the website. `npx vite build --config packages/cli/vite.lib.config.ts` builds `dist/index.js`, and `npm run test:library` checks it in headless Chrome, with photos in `out/library/`. `npm run release-cli` builds both packages. When `public/assets` changes, raise the version in `packages/data/package.json`; `--publish` then publishes `ara3d-data` before `ara3d`.
