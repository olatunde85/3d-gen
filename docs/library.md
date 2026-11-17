# JavaScript library (ara3d)

The `ara3d` package generates realistic, rigged and animated characters inside your own web app or game, as three.js objects. Characters are built on the visitor's device, in a background worker, so the page keeps running. The character data loads from a free CDN.

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

**Try it first** in the [playground](https://ara3dgen.com/developers/#playground): pick a character, props and an expression, and copy the code it writes.

**Or start from a template** that runs in your browser on StackBlitz, with nothing to install:

- [three.js game starter](https://stackblitz.com/github/olatunde85/3d-gen/tree/main/examples/three-starter): a character you steer with the keyboard or by clicking the ground, walking, running and looking at you when it stops.
- [React Three Fiber](https://stackblitz.com/github/olatunde85/3d-gen/tree/main/examples/react-three-fiber): a reusable `<Character>` component; click the ground to walk there.
- [Plain HTML](https://stackblitz.com/github/olatunde85/3d-gen/tree/main/examples/html-embed): characters on a page with the [`<ara-character>`](embed.md) tag.

Their code is in the [examples folder](https://github.com/olatunde85/3d-gen/tree/main/examples) on GitHub.

It's written in TypeScript and ships its types, so editors autocomplete every option. It needs three.js 0.160 or newer, a modern browser, and a bundler (Vite, webpack, Next.js and so on) or an import map. No extra bundler setup is needed: the worker is built in.

## Choosing a character

`createCharacter(input, options)` takes:

- **A preset name:** `'The Soldier'`. `PRESET_NAMES` lists all 32.
- **A share link from the builder:** design a character visually at [ara3dgen.com/app](https://ara3dgen.com/app/), choose **Share**, copy the link and pass it in:
  ```js
  await createCharacter('https://ara3dgen.com/app/#c=eJyr...');
  ```
- **A random character:** `{ random: 42 }`. The same seed always gives the same person, so a crowd of `{ random: 1 }` to `{ random: 50 }` looks the same on every visit.
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
| `detail` | `'low'` (about 25–50k triangles dressed), `'medium'` (about 45–65k) or `'high'` (about 130–170k); see [Detail levels](characters.md#detail-levels) |
| `rootMotion` | Walks, runs and strafes move the character forward instead of playing in place |
| `weapon` | `'rifle'`, `'pistol'`, `'sword'`, `'knife'` or `'grenade'`, held in the hand |
| `carry` | Something to carry, such as `'backpack'`, `'briefcase'` or `'phone'`. With the `texting` or `phone_call` clip in `animations`, the character carries the phone unless you choose something else |
| `vehicle` | A vehicle fitted to the rider, such as `'motorcycle'` or `'horse'`; it comes back in `props` |
| `colors` | New colours for parts of the character, such as `{ outfit: '#1d2a44', carry: '#8a1c1c' }`; see [Colours](#colours) |
| `onProgress` | `(label, fraction) => {}`, for a loading bar |
| `assetsUrl` | Where the character data is served from; see [Hosting the data](#hosting-the-data) |

Presets come with their own props: The Female Executive carries a handbag and The Professional Hitman a pistol. Pass `'none'` to take one away, such as `carry: 'none'`.

Choose only the clips you need. A character with every clip is about 28 MB and takes several seconds to build; with three clips it's about 7 MB and takes 1–3 seconds.

## What you get back

| Property | Meaning |
|---|---|
| `scene` | The character: a three.js `Group` to add to your scene |
| `animations` | The clips, for `THREE.AnimationMixer` |
| `clip(id)` | The clip for an ID, such as `hero.clip('walk')` |
| `props` | Props exported beside the character, such as a vehicle: `{ name, scene, animations }`. They share the character's origin, so add them at the same position and play the matching clip on both |
| `params` | The character's full settings. Save them to rebuild the same character later |
| `colors` | The current colour of each part you can recolour, such as `{ top: '#5b6b3a', bottom: '#5b6b3a' }` |
| `height` | Standing height in metres |
| `glb` | The character as a GLB file, for downloading or uploading |
| `dispose()` | Frees the GPU memory when you remove the character |

`createCharacterGLB(input, options)` returns only the GLB bytes and doesn't need three.js. Use it to save characters, send them to a server, or load them in another engine.

## Colours

The `colors` option recolours fabric and props:

```js
const exec = await createCharacter('The Female Executive', {
  colors: { outfit: '#1d2a44', shoes: '#111111', carry: '#8a1c1c' },
});
```

| Part | What it colours |
|---|---|
| `outfit` | A suit, gown or other outfit made of one fabric. On a few older whole-body outfits it's multiplied over the fabric, so it can darken them but not lighten them |
| `top`, `jacket`, `bottom` | Separate pieces, such as a shirt worn under a suit, or a T-shirt and jeans |
| `shoes` | Heels, sneakers, oxfords, loafers and slides |
| `carry` | The bag or other carried item |
| `vehicle` | The vehicle's paint (or a horse's coat) |

Which parts a character has depends on what it wears: `hero.colors` lists them with their current colours, which makes it easy to build colour pickers. Parts the character doesn't have are skipped, so the same `colors` work across a crowd. On patterned fabric, such as camouflage, the colour replaces the pattern's main colour. For a second colour or a different pattern, set `garmentStyles` in the character's settings (see the [character schema](https://ara3dgen.com/schemas/character.v1.json)). Weapons keep their own colours.

## Chaining animations

`playSequence()` plays clips one after another, blending each into the next, and starts again after the last:

```js
const hero = await createCharacter('The Adventurer', { animations: ['run', 'vault_over', 'ledge_climb_up'] });
const mixer = new THREE.AnimationMixer(hero.scene);
const sequence = hero.playSequence(mixer, 'run 2s, vault_over, run 2s, ledge_climb_up');
// In your render loop: mixer.update(delta);
```

- A clip that loops (walk, idle, run) plays one cycle unless you give it a length, such as `walk 3s`.
- A one-off move (vault_over, jump, punch_combo) plays once, or as many times as you ask, such as `vault_over x2`.
- Steps can also be an array: `['run', { clip: 'vault_over', times: 2 }, { clip: 'idle', seconds: 4 }]`.
- Options: `{ fade: 0.5 }` sets the blend in seconds (default 0.35), and `{ repeat: false }` stops on the last clip.
- Every clip in the sequence must be in the `animations` you built the character with. `sequence.stop()` ends the sequence and hands the mixer back to you.

## Walking and running

`locomotion()` blends idle, walk and run by speed. Your code moves the character; set `speed` from that movement every frame, and the steps keep pace with the ground:

```js
const hero = await createCharacter('The Soldier', { animations: ['idle', 'walk', 'run'] });
const mixer = new THREE.AnimationMixer(hero.scene);
const legs = hero.locomotion(mixer);

// In your render loop:
hero.scene.position.addScaledVector(direction, speed * delta);  // your own movement, in metres per second
legs.speed = speed;
mixer.update(delta);
hero.update(delta);
```

- At 0 the character stands in the idle. Up to `legs.walkSpeed` (about 1.5 m/s for a 1.78 m character) it eases into the walk, and between that and `legs.runSpeed` (about 3.7 m/s) it blends into the run. Faster than that, the run plays faster.
- The natural speeds scale with the character's height, so a tall character takes longer strides.
- Changes of speed ease in over a quarter of a second. Set `{ smoothing: 0.1 }` for a snappier change.
- Use other clips with `{ idle: 'rifle_idle', walk: 'rifle_walk', run: 'rifle_run' }`, after loading them in `animations`.
- `legs.stop()` hands the mixer back to you, for a jump or another one-off move. Call `hero.locomotion(mixer)` again to carry on.

## Looking at things

`lookAt()` turns the head and neck towards a point or an object:

```js
hero.lookAt(new THREE.Vector3(2, 1.6, 3));  // a point in the scene
hero.lookAt(camera);                        // follows the camera as it moves
hero.lookAt(null);                          // looks ahead again
```

- The neck takes some of the turn and the head the rest, up to 75° to the side and 35° up or down. A target behind the character eases the head back to the front.
- `{ amount: 0.5 }` turns halfway, and `{ smoothing: 0.4 }` turns more slowly (the default is 0.2 seconds).
- The turn is added on top of the animation, so it works while the character walks or talks. It runs in `hero.update(delta)`, which must come after `mixer.update(delta)`.

## Faces

Every character carries face shapes, so it can change expression, blink and talk.

```js
hero.setExpression('happy');         // or 0.5 for a hint of a smile: hero.setExpression('happy', 0.5)
hero.setMouth('viseme_aa');          // a mouth shape for lip-sync; hero.setMouth(null) closes it
hero.setFace({ browInnerUp: 0.6 });  // any face shape by name

// In your render loop, after mixer.update(delta):
hero.update(delta);                  // runs blinking, looking and lip-sync; hero.blinking = false stops the blinking
```

- **Expressions:** `EXPRESSIONS` lists them: neutral, happy, laughing, angry, sad, crying, surprised, afraid and determined. A character starts with the expression in its settings.
- **Lip-sync from audio:** `hero.lipSync(audio)` moves the mouth with whatever plays through an `<audio>` or `<video>` element, a `MediaStream` (such as a microphone) or a Web Audio node. It reads loudness and the shape of the sound, so it suits voice-overs and live talking without any extra tools. It runs in `hero.update(delta)`, and `.stop()` closes the mouth. Browsers start audio only after a click or a key press, so start playback from one.
- **Lip-sync from a tool:** `MOUTH_SHAPES` are the 14 Oculus viseme names (`viseme_aa`, `viseme_PP` and so on) that lip-sync tools output. Feed each viseme your tool reports to `setMouth()`. While a mouth shape shows, it moves the jaw and the expression's smile or frown eases off, so talking and expressions combine without over-stretching the mouth.
- **Face shapes:** `FACE_SHAPES` lists every shape, with ARKit-style names (`eyeBlinkLeft`, `jawOpen`, `mouthSmile` and so on), so face-capture data can drive them directly.
- A few clips animate the face themselves, such as talk and laugh. While one plays, three.js's mixer sets those shapes each frame; blinking still runs on top.

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

## Crowds, rigs and other animations

- **Crowds:** build a few characters, then clone them instead of rebuilding. Clones share the geometry and textures, so they cost little memory:
  ```js
  import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
  const walker = clone(hero.scene);
  scene.add(walker);
  new THREE.AnimationMixer(walker).clipAction(hero.clip('walk')).play();
  ```
  Mix in random characters (`{ random: n }`) for variety, and use `detail: 'low'` with only the clips the crowd needs.
- **T-pose:** characters are rigged in a natural A-pose. Pass `{ preset: 'The Soldier', params: { restPose: 'T' } }` for a T-pose, which Unity Humanoid and many retargeting tools expect.
- **Smaller rigs:** `params: { rig: 'game_lite' }` gives a 25-bone skeleton without fingers, for distant characters. See [Rigging](rigging.md) for every option.
- **Mixamo and other animations:** the default game rig uses Mixamo's bone names (`Hips`, `Spine`, `LeftArm` and so on). Mixamo files prefix their bones with `mixamorig:`, so rename their tracks to match, for example `track.name = track.name.replace('mixamorig:', '')`. Clips made for a T-pose skeleton work best on a character built with `restPose: 'T'`. If limbs still twist, the skeletons' bone orientations differ; retarget with a tool such as three's `SkeletonUtils.retargetClip`.

## Good to know

- **Responsiveness:** building runs in a worker, but loading the finished model into three.js happens on the page and takes a moment for large characters. Build during a loading screen, or keep `animations` small.
- **Pages opened as files:** browsers block the worker on a page opened straight from disk (`file://`), so serve it, even locally (`npx serve`).
- **Content-Security-Policy:** the worker runs from a `blob:` address. Sites with a strict policy need `worker-src blob:`.
- **Several characters:** the data loads once and is shared, so later characters build faster.
- **Licence:** the library is MIT. Characters are built from CC0 MakeHuman data, with animations from the CMU Graphics Lab Motion Capture Database, so you can use them in commercial projects.

## For maintainers

The library lives beside the CLI in `packages/cli/` (`src/index.ts`, with the worker in `src/library/`) and shares the generator code with the website. `npx vite build --config packages/cli/vite.lib.config.ts` builds `dist/index.js`, and `npm run test:library` checks it in headless Chrome, with photos in `out/library/`. The [developers page](https://ara3dgen.com/developers/) (`developers/index.html`, `src/developers/`) runs the library from source for its playground; after `npm run build`, `npm run test:developers` checks it on desktop and phone, with photos in `out/developers/`. `npm run release-cli` builds both packages. When `public/assets` changes, raise the version in `packages/data/package.json`; `--publish` then publishes `ara3d-data` before `ara3d`.
