# Ara Studio (prototype)

Studio turns an Ara character into a short, silent film. Open **Studio** in the character builder's bottom toolbar, or go to `/studio/`.

This is an early, single-character prototype. It does not change the generator's characters or animation clips.

## Make a film

1. Choose **The portrait**, **After hours**, or **Golden hour**. Each template includes a small architectural set, lighting, camera movement and a short performance.
2. Pick a character, or bring your exact character from the builder. Settings travel in the URL fragment; there is no upload or GLB conversion. Character detail is preserved. The **Character builder** link takes the current Studio character back for further editing.
3. Select a timeline action. Choose its performance, duration and framing. Walking actions can move through the set. Add up to six actions, with a maximum total duration of 20 seconds.
4. Choose a locked camera, a slow push-in or a gentle orbit. Select landscape (16:9) or portrait (9:16). Add an optional title.
5. Preview, scrub, or use **Save frame** for a PNG. **Export film** renders a 30 fps H.264 MP4 at 720p or 1080p, then offers a preview and a download.

Changing templates replaces the shots and camera plan while keeping your character. Use the top-bar **Undo** button to restore an earlier edit. Space plays or pauses when focus is outside a form control.

## Save and reopen

Studio automatically saves the current recipe on this device. **Save project** downloads a small `.ara-studio.json` file. **Open** restores one of these files, including the character, detail, title, set, actions and camera settings.

Saved recipes reference the application's asset library; they do not embed models or textures. Version 1 recipes are validated before loading. Keep the corresponding Ara version if long-term, byte-for-byte reproducibility is important; recipes are not independent archival video files.

## Rendering and compatibility

Preview, scrubbing, still images and video use the same scene clock. Export evaluates each frame at an explicit timestamp and waits for the encoder. Export time can exceed the movie's duration without changing its playback speed. It waits for character textures and shaders before encoding the first frame.

MP4 export requires a secure context (HTTPS or localhost) and a browser/device with a supported H.264 encoder. Studio checks support at the selected resolution. Current Chrome, Edge and Safari are the intended browsers; availability varies with the operating system. When encoding is unavailable, saving frames and projects still works.

Keep the tab open during export. Cancel stops encoding and restores the preview. Export is local; no character, recipe or video is sent to a server. The output is **silent**: dialogue, music, sound effects and audio upload are not part of this prototype.

The sets use original procedural geometry and textures bundled in the source. There are no background-asset downloads or third-party scene API dependencies. All existing character asset and motion-capture licence terms still apply. Video encoding/muxing uses the [Mediabunny](https://mediabunny.dev/) library under MPL 2.0. Every production build includes its licence, notice and exact unmodified source archive in `third-party/mediabunny/`, linked from the export dialog.

## Current boundaries

- One character per film. No paired interactions, contact solving or prop handover.
- Curated standing/walking performances. No imported outside GLB files or general scene-object editor.
- Three sets and three camera framings. Character movement comes from the existing clips' travel data, scaled to body height.
- Short, bounded exports (up to 20 seconds) held in memory. No unrestricted-resolution or long-film promise.

## Development checks

- `npm run test:studio:model`: recipe validation and timeline continuity.
- `npm run test:studio`: browser smoke tests, fixed-time rendering, responsive layout and real MP4 generation.
- `npm run test:ui` and `npm run test:gltf`: regression checks for the character builder and engine exports.
