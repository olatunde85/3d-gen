# ara3d

Generate realistic, rigged and animated 3D characters from the command line: GLB, FBX, OBJ or a ZIP bundle for Unity, Unreal, Godot, Blender and the web. Free and open source; everything runs on your machine.

```bash
npx ara3d export --preset "The Soldier"
npx ara3d export --random 1-200 --detail low --out characters
npx ara3d export --preset "The Soldier" --animations walk,run,idle --root-motion
npx ara3d new hero && npx ara3d export --params hero.json --formats glb,fbx
```

The first run downloads the character data (about 50 MB) and caches it. Needs Node 20+.

- **Commands:** `export`, `presets`, `animations`, `props`, `new`, `schema`; run `npx ara3d --help`.
- **Props:** weapons, carried items and 13 vehicles fitted to the rider (`--weapon rifle --carry backpack --vehicle motorcycle`).
- **Animations:** 216 motion-captured and hand-made clips. Pick only the ones you need, add root motion, or get one file per clip.
- **Character files** use a published JSON schema, so editors autocomplete them and AI assistants can write them.
- **Licence:** the tool is MIT. The characters are built from CC0 MakeHuman data, with animations from the CMU Graphics Lab Motion Capture Database, so you can use them in commercial projects.

Full guide: [ara3dgen.com/docs/cli](https://ara3dgen.com/docs/cli/). Make characters in the browser at [ara3dgen.com](https://ara3dgen.com). Source: [github.com/olatunde85/3d-gen](https://github.com/olatunde85/3d-gen).
