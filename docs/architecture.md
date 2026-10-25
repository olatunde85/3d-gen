# Architecture

```
scripts/build-assets.ts   MakeHuman data -> public/assets (packs, textures, thumbnails, catalog.json)
scripts/build-mocap.ts    CMU motion capture -> src/core/anim/clips/mocap-data.ts
scripts/build-docs.ts     docs/*.md -> dist/docs/ (these pages on the website)
src/core/
  assets.ts    asset pack formats + AssetLibrary (fetch in browser, fs in Node)
  pack.ts      tiny gzip'd binary container (JSON header + typed arrays)
  params.ts    HumanParams, presets, seeded randomizer
  morph.ts     macro + detail-slider target weighting, target application
  human.ts     buildHuman(): morph, proxy fitting, subdivision, materials, skeleton
  face.ts      facial blend shapes, expressions, blink calibration, lip sealing
  geometry.ts  compaction, Catmull-Clark subdivision, normals
  mesh.ts      MeshData (multi-material, triangles + original polygons)
  garments/    procedural clothing (shells, hull rings, generated fabrics)
  looks/       tattoos + stubble/shaved scalps (skin overlay), procedural hairstyles, beards, earrings
  props/       weapons (rifle, pistol, sword, knife)
  rig/         skeletons, auto-skinning, T-pose, WeaponR socket
  anim/        clips, motion-capture retargeting, and the shared evaluator (FK, arm IK, grounding)
src/export/    glb.ts, fbx.ts (binary writer), obj.ts, plan.ts, index.ts (bundling)
src/app/       three.js viewer, bicycle prop, generation worker
  ui/          the app's UI, one module per part (sidebar, animation bar, export panel, share dialog,
               header), wired together in main.ts through the store's events (ui/store.ts)
src/landing/   the landing page
```

## How a character is built

`buildHuman()` (`src/core/human.ts`) runs in a Web Worker in the app (`src/app/worker.ts`), and directly in Node for the command line and tests:

1. Morph the base mesh from the parameters: macro controls plus detail sliders.
2. Fit the proxies (eyes, brows, lashes, teeth, tongue, hair, outfits, shoes) and grow or wrap the procedural garments.
3. Build the face's blend shapes, calibrate the blinks, and close lips that rest apart.
4. Subdivide for high detail.
5. Rig: place the skeleton on the body's joints, then skin every part.
6. Assemble one multi-material mesh.

The same parameters always give the same character, so `params.json` (and share links) regenerate it exactly.
