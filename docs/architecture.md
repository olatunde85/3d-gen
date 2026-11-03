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
src/studio/    scene recipes, fixed-time direction, procedural sets, video encoding and Studio UI
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

## Studio scenes and direction

Studio's version 2 project separates camera shots from actor performance tracks. Both actors are evaluated at the same explicit timestamp, while each keeps its own actions, character recipe, placement and detail. Version 1 projects migrate to the new schema on import.

`src/studio/catalog.ts` holds searchable location metadata. `sets.ts` dispatches to reusable scene-family builders; `sets/builder.ts` shares primitive geometry and materials within a set. Only the active set is instantiated. Set changes dispose owned geometries, materials and textures. Character changes rebuild only the affected actor, and replacement models are warmed before previous resources are released.

The scene renderer fits the selected camera subject (one actor or the cast), then applies saved orbit/zoom offsets and camera motion. Preview, snapshots and video use this same evaluation. The video exporter waits for every actor's textures and prevents the preview loop from drawing during encoding.

To add a location, add metadata to `catalog.ts` and use an existing family, or add a family builder and register it in `sets.ts`. Keep the performance area clear of props. Animation search reads the shared `CLIPS` registry directly; Studio has no separate animation whitelist. The browser suite visits every location and checks resource cleanup as well as saved-project migration and two-character movie playback.

The viewport has one controller for pointer gestures and selection-aware keyboard movement. Selection is stored in the local editor session, separate from the portable project; empty-background clicks and Escape clear it. A held arrow key is one cancellable, undoable actor transform; unselected arrows orbit the scene. Character transforms hold camera framing until they finish. Character picking raycasts the posed skinned meshes with conservative bounds from the current skeleton. Dragging projects an offset pointer onto the actor’s staging plane, so grabbing the torso does not produce a near-horizontal ground ray. Equipment edits rebuild Ara’s existing rigged prop geometry through the character recipe; other actors are reused. Selection rings are composited only onto the visible preview canvas after the clean film buffer is copied, keeping snapshots and video free of editing overlays.

LLM Assist derives its portable text guide and JSON Schema from the same scene, preset, animation and equipment registries. `assist.ts` converts readable preset/equipment names into ordinary character recipes, rejects unknown fields and delegates canonical validation to `parseProject`. Both file and paste imports use one transactional loader; invalid inputs never allocate models, successful imports become one undoable edit, and saved projects retain the canonical version 2 format. `assist-ui.ts` handles the guide, optional current-film context, JSON preview and clipboard/download flows without calling any LLM service.

`session.ts` validates a versioned local recovery snapshot containing the film, bounded editor state and up to 30 undo entries. Drafts may be unfinished JSON; they are not imported during recovery. Completed edits save immediately; editor-only changes are debounced and flushed on page hide or reload. In-flight model builds keep the last completed snapshot. A separate canonical project copy supports legacy recovery. Incoming builder links are removed only after successful loading and saving, preventing refresh from replaying an import.

Timed text lives in an optional `texts` array on version 2 film recipes; older projects normalize to an empty array. `text.ts` validates cues, imports/exports SRT and lays out captions/bubbles at explicit timestamps. Actor anchors project the posed head joint each frame. Typography is drawn into the clean output buffer before editor-only selection markers, so snapshots and encoded video match preview. Text cues can extend the film clock and are restored with editor sessions. The LLM schema and guide include this same text contract.

The builder’s separate `character-assist.ts` contract reads the installed asset catalogues, garment definitions and parameter defaults. It validates readable character JSON before the regular Store/generation pipeline builds it. Its UI supports guide copy/download, file/paste input, Undo and local draft recovery; the character’s Studio return token is preserved. It accepts no film/timeline fields and makes no LLM API calls. `npm run test:character-assist` checks preset round trips, catalogue IDs and validation; browser checks also build characters through Assist and return an actor to Studio.

Studio imports now accept actor-level `params` (with an optional preset or encoded recipe as the base), and embedded character-builder specifications or raw parameter objects. The installed `Catalog` is supplied to both normal Open and Assist validation; custom settings pass through the builder’s existing `parseCharacterInput` before encoding into canonical actor recipes. The Studio guide embeds a shared `characterReference`, with character schemas factored into `$defs` to avoid duplicating the control catalogue. Current-film context expands encoded recipes into readable specifications without changing the saved project.
