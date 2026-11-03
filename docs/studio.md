# Ara Studio (preview)

Studio turns Ara characters into short, silent films. Open **Studio** in the character builder's bottom toolbar, or go to `/studio/`.

## Find a location

Search **50 sets** or filter by **Studios**, **Workplaces**, **Homes**, **Leisure**, **City** and **Outdoors**. Locations include executive and open-plan offices, a boardroom, bedrooms, a kitchen, beaches, resort and infinity pools, a hotel lobby, a café, a forest trail and a harbour.

Selecting another set keeps your cast, performances, camera shots and title. Scenes are original procedural environments; only the active scene is built. Mesh primitives and materials are shared within each set and GPU resources are released when changing locations.

## Direct the cast

Bring your exact character from the builder, or select an Ara preset. **Second character** adds another actor. Select a name in the cast roster to edit that character. Each actor has a separate performance track, character recipe and detail level. Adding an actor keeps the existing performance, placement and camera plan, and gives the new track the film’s current duration. Changing one character reuses the other character's loaded model.

Position each character in metres along the horizontal axes, set their facing angle, or adjust elevation for a raised surface. **Side by side**, **Conversation** and **Facing each other** provide starting arrangements. Removing a character also repairs camera shots that targeted them.

The **Character builder** link opens the selected actor for editing. Returning with the builder's **Studio** button restores the film and updates only that actor. This uses session storage in the same browser tab. If session storage is unavailable, ordinary character links still work, but cannot restore the film automatically; save your project first.

## Sequence performances and camera shots

The timeline has one **camera lane** and one **performance lane per actor**, all using the same film clock. The **Select a shot or action** menu also reaches very short timeline items in longer films.

- Select an actor's action to choose from **77 animations**, searchable by name and category. Change its duration or use **original clip length**. Non-looping actions play once and hold; looping actions repeat. Consecutive shots of a looping performance continue its phase.
- Enable **Move through the set** for clips with travel, including forward/backward walking, strafing and running. Travel follows the clip's native direction and speed, rotated by the actor's facing angle. Stage long travelling actions carefully: props and walls do not have collision or contact solving.
- A chair is fitted for seated clips and a bicycle for the cycling clip. Weapon performances use equipment chosen in the builder. Other vehicle poses do not create their vehicles. Interaction poses still need appropriate staging; hands do not automatically attach to set props or another actor.
- Select a camera shot to choose full-body, medium or close framing and target **the entire cast** or **one character**. Cast framing accounts for both characters and the selected aspect ratio.
- Add, remove or reorder actions and shots independently. Up to **16 actions per actor**, **12 camera shots** and **60 seconds** per film. Each item can last 0.1–12 seconds. Shorter performance lanes hold their final pose; the last camera shot holds when another lane runs longer.

Use the top-bar **Undo** to restore edits, including placement, camera gestures and title changes. Space plays or pauses when focus is outside a form control. The timeline scrubber evaluates every track at the selected time.

## Move the camera

Drag the picture to orbit around the set. Scroll to zoom; on touch screens, drag with one finger and pinch with two. Focus the picture and use the arrow keys to rotate, plus/minus to zoom or Home to reset. **Reset viewing angle** is also available in the camera settings.

The angle and zoom are part of the saved film, so preview, still images and exported video use the same view. Room walls use a cutaway treatment when seen from outside. The camera stays above the floor.

Choose a locked camera, slow push-in or gentle orbit on top of the chosen viewing angle. Landscape (16:9), portrait (9:16) and an optional title are supported.

## Save and export

Studio automatically saves on this device. **Save project** downloads an editable `.ara-studio.json` recipe, including both actors, their tracks and placement, camera shots, view, set and title. **Open** restores it. Existing version 1 single-character projects migrate to version 2 automatically. Invalid projects are rejected before allocating models.

Recipes reference Ara's asset library rather than embedding models and textures. Keep the corresponding Ara version for long-term reproducibility; a recipe is not an archival video file.

**Save frame** downloads the current picture as a PNG. **Export film** renders a 30 fps H.264 MP4 at 720p or 1080p, then offers playback and download. Completed films remain available when reopening the export dialog, until the project changes or the page reloads.

MP4 export requires HTTPS or localhost and a browser/device with a supported H.264 encoder. Support is checked at the selected resolution. Current Chrome, Edge and Safari are intended browsers; availability varies by operating system. Frames and projects can still be saved when encoding is unavailable.

Export samples the whole cast and camera at explicit timestamps. Rendering can take longer than playback without changing the movie's speed. Export waits for all character textures and shaders; cancellation restores the cast and preview. Keep the tab open. Bounded exports are held in memory, so long films and two high-detail actors can require more memory and rendering time.

The output is **silent**. Audio, dialogue lip-sync, imported GLBs, paired contact animations, physical collisions and prop handover are outside this version. The two actors share a scene and clock; their performances remain independently directed.

## Assets and licences

The sets use original geometry and textures bundled in the source. There are no remote background downloads or scene API dependencies. Existing character asset and motion-capture terms still apply.

Video encoding/muxing uses [Mediabunny](https://mediabunny.dev/) under MPL 2.0. Every production build includes its licence, notice and exact unmodified source archive in `third-party/mediabunny/`, linked from the export dialog.

## Development checks

- `npm run test:studio:model`: catalogue search, project migration, validation and independent timeline contracts.
- `npm run test:studio`: all 50 set renders with GPU resource budgets, animation search/poses, fitted props, two actors, pointer/keyboard camera controls, mobile framing, project recovery, real MP4 encoding and the builder round trip. Review images and video are saved under `out/studio-expansion/`.
- `npm run test:ui` and `npm run test:gltf`: character builder and engine-export regression checks.
