# ara3d

Realistic, rigged and animated 3D characters, free and open source: a **three.js library** for your web app or game, and a **command-line tool** that writes GLB, FBX or OBJ files for Unity, Unreal, Godot and Blender. Everything runs on your machine or your visitors' devices.

## In the browser

```bash
npm install ara3d three
```

```js
import * as THREE from 'three';
import { createCharacter } from 'ara3d';

const hero = await createCharacter('The Soldier', { animations: ['walk', 'run', 'idle'], weapon: 'rifle' });
scene.add(hero.scene);
new THREE.AnimationMixer(hero.scene).clipAction(hero.clip('walk')).play();
```

Characters are built in a background worker, and the character data loads from a free CDN. TypeScript types are included. Guide: [ara3dgen.com/docs/library](https://ara3dgen.com/docs/library/).

## On the command line

```bash
npx ara3d export --preset "The Soldier"
npx ara3d export --random 1-200 --detail low --out characters
npx ara3d export --preset "The Soldier" --animations walk,run,idle --root-motion
npx ara3d new hero && npx ara3d export --params hero.json --formats glb,fbx
```

The first run downloads the character data (about 50 MB) and caches it. Needs Node 20+. Guide: [ara3dgen.com/docs/cli](https://ara3dgen.com/docs/cli/).

## Both

- **32 presets**, random characters from a seed, or your own character files, checked against a [published JSON schema](https://ara3dgen.com/schemas/character.v1.json) that editors autocomplete and AI assistants can follow.
- **216 animations:** pick only the ones you need, with optional root motion.
- **Props:** weapons, carried items and 13 vehicles fitted to the rider.
- **In the browser:** random characters from a seed, characters designed in the [Ara builder](https://ara3dgen.com/app/) from their share link, and faces that change expression, blink and lip-sync (Oculus viseme names).
- **Licence:** the code is MIT. Characters are built from CC0 MakeHuman data, with animations from the CMU Graphics Lab Motion Capture Database, so you can use them in commercial projects.

Make characters in the browser at [ara3dgen.com](https://ara3dgen.com). Source: [github.com/olatunde85/3d-gen](https://github.com/olatunde85/3d-gen).
