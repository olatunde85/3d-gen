# Contributing to Ara 3D Gen

Thanks for helping! Bug reports, garments, hairstyles, animations, presets,
engine-integration notes and docs are all welcome. Questions are best asked in
[Discussions](https://github.com/olatunde85/3d-gen/discussions).

## Getting set up

```bash
git clone <your fork>
cd 3d-gen
npm install
npm run setup-assets   # one-time: CC0 MakeHuman data -> public/assets
npm run dev            # http://localhost:5173 (landing page) and /app/ (the generator)
```

Requirements: Node 20+ and git, on Windows, macOS or Linux. `npm run test:gltf` and `npm run test:ui` need Chrome, Chromium or Edge (set `CHROME=/path/to/browser` if it isn't found). Blender is optional; it's only used by the `scripts/blender_*.py` render checks.

## Before you open a pull request

```bash
npm run typecheck
npm test            # builds 259 characters and validates GLB, FBX, OBJ and every export mode
npm run test:gltf   # loads exported GLBs with three.js in headless Chrome (rig/animation changes)
npm run test:ui     # drives the app in headless Chrome: build, slider, preset, animation browser, export (UI changes)
```

For visual changes (garments, hair, tattoos, animation), please attach a screenshot or a short clip.

## Where things live

| Area | Files |
| --- | --- |
| Parameters, presets, randomizer | `src/core/params.ts` |
| Character assembly | `src/core/human.ts` |
| Procedural clothing | `src/core/garments/catalog.ts` (one entry per garment) |
| Hair, beards, tattoos, earrings | `src/core/looks/` |
| Weapons | `src/core/props/weapons.ts`, socket in `src/core/rig/socket.ts` |
| Skeletons and skinning | `src/core/rig/` |
| Animation clips / evaluator | `src/core/anim/clips/` (one file per set), `src/core/anim/evaluate.ts` |
| Exporters | `src/export/` (`plan.ts` decides the files, `glb.ts`, `fbx.ts`, `obj.ts` write them) |
| Web app | `src/app/`: three.js viewer, generation worker, and the UI in `ui/` (one module per part: sidebar, animation bar, export panel, share dialog, header), wired together in `main.ts` through the store's events (`ui/store.ts`) |
| Landing page | `index.html`, `src/landing/` (the app itself is `app/index.html`) |
| Documentation | `docs/*.md` (also published at ara3dgen.com/docs by `scripts/build-docs.ts`) |

### Documentation

The guides live in `docs/` as Markdown, so update them in the same pull request as the code they describe. Link between pages with relative links (`[Rigging](rigging.md)`); they work on GitHub and on the website. Keep the README short: it's the front page, and the detail belongs in `docs/`.

### Adding a garment

Add an entry to `GARMENTS` in `src/core/garments/catalog.ts`: an id, label, slot (`top`,
`bottom` or `acc`), the patterns it supports, default colours, and a `build` function.
Most garments are a body "shell" (a coverage predicate over body regions plus an offset),
optionally with extra parts (straps, badges, pockets) placed with the ring helpers. The
selftest automatically builds every garment on two bodies.

### Adding an animation

Animations live in `src/core/anim/clips/`, one file per set (`basic.ts`, `actions.ts`, `shooter.ts`, `vehicles.ts`…), with shared helpers in `helpers.ts`. Add a clip to the matching file, or start a new file for a new set, then list it in `index.ts` (that order is the order the app shows). Channels are per bone, in degrees, in the bone's
own frame (X = flex forward, Y = twist, Z = side), and `side()` mirrors left/right. Hands
can be placed with IK targets in chest space. The same evaluator drives the viewer and
both exporters, so a clip works on every skeleton and bind pose automatically.

Motion-captured clips come from the CMU database: add the take to `scripts/mocap-takes.ts`
(take id, cut, loop search range; `MOCAP_FILES` holds its download path), run
`npm run setup-assets` (or place the BVH in `vendor/mocap/cmu/`), then `npm run build-mocap`,
and list it in `index.ts` with `mocap(id, name, category)`. Check it in the viewer from the
front and the side; `npm test` checks that loops close and the feet reach the floor.

## Guidelines

- Keep everything procedural, CC0 or under similarly free terms (like the CMU motion capture): no assets with restrictive licences.
- Cultural dress and uniforms: please cite your sources for colours and details.
- Adult-only options (topless, bottomless, tattoos) must stay restricted to characters aged 18+.
- Match the surrounding code style. Comments explain *why*, not *what*.

By contributing you agree that your contributions are licensed under the MIT licence.
