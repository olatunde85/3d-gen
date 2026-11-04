# Ara Studio (preview)

Studio turns Ara characters into short films with dialogue and music. Open **Studio** in the character builder's bottom toolbar, or go to `/studio/`.

## Find a location

Search **50 sets** or filter by **Studios**, **Workplaces**, **Homes**, **Leisure**, **City** and **Outdoors**. Locations include executive and open-plan offices, a boardroom, bedrooms, a kitchen, beaches, resort and infinity pools, a hotel lobby, a café, a forest trail and a harbour.

Selecting another set keeps your cast, performances, camera shots and title. Scenes are original procedural environments; only the active scene is built. Mesh primitives and materials are shared within each set and GPU resources are released when changing locations.

## Direct the cast

Bring your exact character from the builder, or select an Ara preset. **Second character** adds another actor. Select a name in the cast roster to edit that character. The compact desktop layout keeps the cast and equipment on the left, the film and timeline in the centre, and action, placement and camera controls on the right. Each actor has a separate performance track, character recipe and detail level. Adding an actor keeps the existing performance, placement and camera plan, and gives the new track the film’s current duration. Changing one character reuses the other character's loaded model.

Click a character in the picture to select it; a subtle selection ring identifies the active character. Drag it to move it across the staging plane. Click the background, press Escape or use **Deselect** to clear selection. Escape cancels an active drag or keyboard move; Undo reverses a completed move. Choose **Click to place** and click the ground, or Shift-click the ground, to place the selected character at that point. These moves preserve the action sequence and travel setting.

With a character selected, **arrow keys move it across the staging plane**, relative to your viewing angle. Hold **Shift or Ctrl** (Cmd also works) with **Left/Right to turn**, or **Up/Down to raise/lower**. Each step moves 0.1 m, turns 5° or changes height by 0.05 m; a held arrow is one undoable move. Shortcuts leave text and number inputs alone.

The existing placement fields still position each character in metres along the horizontal axes, set their facing angle, or adjust elevation for a raised surface. **Side by side**, **Conversation** and **Facing each other** provide starting arrangements. Removing a character also repairs camera shots that targeted them.

Under **Equipment** in the left panel, choose a weapon (rifle, pistol, sword or knife) and a bag (straw tote, handbag, briefcase or backpack), including **None** to remove them. These use Ara’s fitted, rigged props and update only the selected character. Equipment is saved in the character recipe, supports Undo, and follows the character through animation and dragging.

The **Character builder** link opens the selected actor for further editing. Returning with the builder's **Studio** button restores the film and updates only that actor. This uses session storage in the same browser tab. If session storage is unavailable, ordinary character links still work, but cannot restore the film automatically; save your project first.

## Sequence performances and camera shots

The timeline has one **camera lane** and one **performance lane per actor**, all using the same film clock. The **Select a shot or action** menu also reaches very short timeline items in longer films.

- Select an actor's action to choose from **77 animations**, searchable by name and category. Change its duration or use **original clip length**. Non-looping actions play once and hold; looping actions repeat. Consecutive shots of a looping performance continue its phase.
- Enable **Move through the set** for clips with travel, including forward/backward walking, strafing and running. Travel follows the clip's native direction and speed, rotated by the actor's facing angle. Stage long travelling actions carefully: props and walls do not have collision or contact solving.
- A chair is fitted for seated clips and a bicycle for the cycling clip. The chair is part of the set for the whole film: it stands where the character first sits, so it is there before they sit down and after they stand up. Weapon performances use equipment chosen in Studio or the builder. Other vehicle poses do not create their vehicles. Interaction poses still need appropriate staging; hands do not automatically attach to set props or another actor.
- Select a camera shot to choose full-body, medium or close framing and target **the entire cast** or **one character**. Cast framing accounts for both characters and the selected aspect ratio.
- Add, remove or reorder actions and shots independently. Up to **16 actions per actor**, **12 camera shots** and **60 seconds** per film. Each item can last 0.1–12 seconds. Shorter performance lanes hold their final pose; the last camera shot holds when another lane runs longer.

Use the top-bar **Undo** to restore edits, including placement, camera gestures and title changes. Space plays or pauses when focus is outside a form control. The timeline scrubber evaluates every track at the selected time.

## Move the camera

Drag the background to orbit around the set; Alt-drag or right-drag also orbits when the pointer is over a character. Scroll to zoom; on touch screens, drag with one finger and pinch with two. With no character selected, use the arrow keys to rotate the scene. Focus the picture for plus/minus to zoom or Home to reset. **Reset viewing angle** is also available in the camera settings.

The camera holds still during a character drag or keyboard move, then resumes the current shot’s automatic framing.

The angle and zoom are part of the saved film, so preview, still images and exported video use the same view. Room walls use a cutaway treatment when seen from outside. The camera stays above the floor.

Choose a locked camera, slow push-in or gentle orbit on top of the chosen viewing angle. Landscape (16:9), portrait (9:16) and an optional title are supported. Edit the film name directly in the top bar; **Show title in the film** controls its caption. The editor’s selection markers never appear in saved PNGs or MP4s.

## Subtitles, text and comic bubbles

Choose **Text & subtitles** above the timeline. Add a **Subtitle**, **Text**, or **Bubble**, then set its text, start time, duration, size and colours. Up to 64 cues can overlap independently of camera shots and performances; a later cue extends the film, within the 60-second limit. Click a cue in the text timeline lane to edit it. **Preview in scene** jumps to that cue’s start.

Five styles are available: readable subtitle plates, plain outlined text, speech bubbles, thought bubbles and comic bursts. Choose **Fixed in the frame** for subtitles/titles, or **Follow character 1/2** for text that travels with the animated character. Frame positions are percentages; character-relative offsets are percentages from the animated head (negative Y is above it). Position and size remain consistent between landscape/portrait previews, PNGs and MP4s. Text wraps, stays inside the picture and scales with export resolution; review longer bubbles in the chosen shot. Simultaneous comic bubbles are separated when space allows. Removing a character also removes its attached cues; Undo restores them together.

**Import SRT** appends timed subtitles. **Save SRT** exports subtitle text and timings; SRT does not preserve comic styles or placements. Styling and attachments are kept in saved project JSON instead. Text edits, selection and an open text editor survive reloads. These are visual captions only; they do not generate audio or lip-sync.

## Speech and music

Choose **Sound** above the timeline. Speech clips have independent start times and durations, an optional character/narrator assignment, volume, left/right pan, playback speed and a source trim offset. Up to **24 clips** can overlap within the 60-second film. Click a sound timeline item to edit it. Removing a character keeps their recordings and assigns them to the narrator. Speaker assignment does not create lip-sync or automatically position the voice in space.

There are three ways to add a voice:

- **Typed dialogue:** add **Dialogue**, enter a script, then expand **Generate an exportable voice**. Choose one of four English voices and **Generate speech locally**. First use downloads approximately 265 MB of pinned Supertonic 2 model files; later generations use the browser cache when available. Inference runs in a worker on your device. The model host receives file requests, but Ara does not send it your dialogue. Generation is optional and can be cancelled. Closing Sound releases the local generation worker; cached model files remain available for a later session. **Generate missing speech** processes pending scripts in sequence. Generated audio is saved locally; fitting a take updates its clip duration, so review your actions and captions against the actual delivery. Changing a generated take’s script or voice requires generation again; Undo can recover its previous take.
- **Record speech:** grant microphone access, record, then stop to add the take. Recording stops automatically before 60 seconds. Closing the editor stops the microphone and discards an unfinished take. Recording requires HTTPS or localhost.
- **Upload speech:** choose a browser-decodable WAV, MP3, M4A, Ogg or WebM file, at most 60 seconds and 24 MiB. **Attach recording** replaces a selected take. Audio is normalized to a local PCM WAV without uploading it.

**Quick read-through with a device voice** uses the native Web Speech API without the optional speech model. Select an installed browser/OS voice and adjust rate (0.1–10) and pitch (0–2); the clip volume also applies. Some platform voices use an online voice service. Native speech exposes no PCM buffer, so this read-through cannot use Web Audio effects or appear in the exported film. Generate a take, record or upload audio when you need effects/export. The browser’s voice list varies by platform and can arrive after the editor opens.

Six Web Audio effects apply to generated, uploaded and recorded takes: **Natural**, **Robotic** (ring modulation), **Dramatic** (warm EQ and reverb), **Radio**, **Telephone** and **Echo**. Dramatic is an audio treatment, not emotional voice acting. **Preview selected clip** auditions the processed take; **Fit duration to audio** uses the remaining audio after its trim. Playback speed changes both timing and pitch. A short clip trims its take; a longer clip holds silence after the source ends. Effects are faded out at the clip boundary, so allow enough duration for an echo or reverb tail.

Choose one of six original instrumental music beds: **Quiet horizons**, **A story unfolds**, **Something is coming**, **After the rain**, **Small adventures** and **First light**. Scores are synthesized locally with no music download. Set their volume and fades; **Lower music while someone speaks** ducks the music beneath speech clips. Music spans the whole film. **Mute film audio** keeps all direction but produces silence.

Timeline playback follows the audio clock. Pausing, scrubbing, restarting and editing stop or restart the soundtrack at the corresponding position. Preview, **Save soundtrack WAV**, and MP4 export use the same offline Web Audio mix, including effects, panning, fades, ducking and peak protection. A pending or missing audible take produces an actionable error rather than silently disappearing from an export.

Recordings and generated takes live in IndexedDB on this browser/device, while project JSON holds their content hashes. Reload recovers the direction and stored audio. Browser storage can be cleared or evicted; **Save project** creates a portable `.ara-studio.zip` containing the recipe and its WAV assets whenever the film references audio. **Save project + audio** does this explicitly; **Open** restores the bundle on another device. Bundles are limited to 128 MiB. Music-only projects and pending scripts remain ordinary JSON. JSON alone cannot transfer recorded audio; use a bundle for those films.

## LLM Assist

Choose **LLM Assist** in the top bar to turn a description into an editable film:

1. **Describe your film** in your own words, or start from one of the **Ideas** (**More ideas** shows others). Tick **Start from my current film** to revise what you have.
2. **Get the film JSON:** **Copy guide** (or **Save as .txt**) and give it to ChatGPT, Claude, Gemini or another assistant. The guide holds your description and everything the assistant needs: all locations, full character-creation controls and assets, animation IDs and timings, equipment, timed text and comic bubbles, speech and effects, the music library, the JSON schema, a valid example and the editor's actual limits.
3. **Review and build.** Press **Paste reply** (or paste into the box, or **Open file**). You can paste the assistant's whole reply: Studio finds the JSON inside any surrounding text or code fences. A summary card lists the location, cast, length, shots, actions, text, speech and music. If something needs fixing, the card says what and offers **Copy fix request** to send back to your assistant. **Build film** replaces your project, and Undo restores the previous film.

Ctrl/Cmd+Enter in the description copies the guide; in the JSON box it builds. Drafts survive reloads.

The guide is generated from the editor's live registries, so newly added sets, presets, animations and equipment appear automatically. Studio makes no AI calls and sends nothing anywhere.

Studio JSON can design the cast directly, using the same body, face, skin, hair, clothing, colour, detail-slider and rig controls as the character builder. The Studio guide embeds the builder’s complete instructions and installed catalogues; its JSON Schema shares the same character parameter definitions. No separate visit to the builder is needed.

An actor can use `params` alone to build from defaults, or combine `preset` and `params` to inherit a preset and override selected settings:

```json
{
  "id": "explorer",
  "preset": "The Adventurer",
  "params": {
    "name": "Maya",
    "ageYears": 34,
    "hair": "cornrows",
    "carry": "backpack",
    "garmentStyles": {
      "tank_top": { "pattern": "solid", "color": "#436b67" },
      "cargo_shorts": { "pattern": "khaki", "color": "#9c875f" }
    }
  },
  "detail": "medium",
  "x": 0, "y": 0, "z": 0, "yaw": 0,
  "beats": [{ "clip": "wave", "duration": 3, "move": false }]
}
```

Alternatively, put an entire character-builder response inside `actor.character`, including its `kind: "ara-character"`, `version: 1`, optional `preset` and `params`. Raw `.params.json` objects also work there. Existing encoded `character` strings remain supported; adding actor-level `params` overrides that saved character’s settings. Do not combine `preset` and `character`, or provide params both inside a character object and on its actor.

Omitted parameters retain the chosen preset/recipe values, or defaults when neither is supplied. Supplied arrays and maps replace their inherited values. Actor-level `detail`, `weapon` and `carry` take precedence over embedded settings. Studio enables animations and uses the game rig when a character specifies `rig: "none"`. **Include my current film** expands saved character recipes into readable parameter objects, so an assistant can revise the existing cast. Saving the result keeps the exact normalized character recipes, including all custom appearance settings.

Both the normal **Open** button and LLM Assist accept this JSON. Pasted JSON can also be enclosed in a single Markdown JSON code fence. Invalid JSON, unknown presets, unsupported fields, invalid camera targets and out-of-range timing are rejected before character construction. The editor’s existing limits still apply: one location, two independent actors, a film of at most 60 seconds, and no automatic physical interaction or lip-sync. Review staging in the viewport after importing.

## Save and export

Studio automatically saves on this device. Reloading restores the film, viewing angle, selected character and timeline item, text/sound-cue selection, device read-through settings, playhead position, repeat and placement modes, search filters, export resolution and Undo history. Unfinished LLM Assist briefs and JSON drafts are recovered, including an open Assist window. Playback resumes paused. Character links from the builder are consumed once, so refreshing keeps your subsequent film edits.

**Save project** downloads an editable `.ara-studio.json` recipe, including both actors, their tracks and placement, timed text and attachments, speech/music direction, camera shots, view, set and title. Films with attached audio are saved as `.ara-studio.zip` bundles containing the JSON and recordings. **Open** restores it. Existing version 1 single-character projects migrate to version 2 automatically. Invalid projects are rejected before allocating models.

Recipes reference Ara's asset library rather than embedding models and textures. Keep the corresponding Ara version for long-term reproducibility; a recipe is not an archival video file.

**Save frame** downloads the current picture as a PNG. **Export film** renders a 30 fps H.264 MP4 at 720p or 1080p, then offers playback and download. Completed films remain available when reopening the export dialog, until the project changes or the page reloads.

MP4 export requires HTTPS or localhost and a browser/device with a supported H.264 encoder. Films with sound also need a supported MP4 audio encoder; Studio prefers AAC and falls back to Opus when available. If audio encoding is unavailable, save a separate WAV soundtrack, use another browser, or mute the film explicitly. Support is checked at the selected resolution. Current Chrome, Edge and Safari are intended browsers; availability varies by operating system. Frames and projects can still be saved when encoding is unavailable.

Export samples the whole cast and camera at explicit timestamps. Rendering can take longer than playback without changing the movie's speed. Export waits for all character textures and shaders; cancellation restores the cast and preview. Keep the tab open. Bounded exports are held in memory, so long films and two high-detail actors can require more memory and rendering time.

Automatic dialogue lip-sync, imported GLBs, paired contact animations, physical collisions and prop handover are outside this version. The two actors share a scene and clock; their performances remain independently directed.

## Assets and licences

The sets use original geometry and textures bundled in the source. There are no remote background downloads or scene API dependencies. Existing character asset and motion-capture terms still apply.

Optional local speech uses ONNX Runtime Web (MIT) and an inference implementation based on Supertone’s MIT Web example. Supertonic 2 model/voice files use **OpenRAIL-M**, including its use restrictions; the model is downloaded separately when generation is chosen. Licences and notices are shipped in `third-party/speech/` and linked from the sound editor. The procedural music scores are original Ara code and contain no sampled third-party recordings.

Video encoding/muxing uses [Mediabunny](https://mediabunny.dev/) under MPL 2.0. Every production build includes its licence, notice and exact unmodified source archive in `third-party/mediabunny/`, linked from the export dialog.

## Development checks

- `npm run test:studio:model`: catalogue search, project migration, validation and independent timeline contracts.
- `npm run test:studio`: all 50 set renders with GPU resource budgets, animation search/poses, fitted props, two actors, selection-aware pointer/keyboard controls, compact desktop and mobile layouts, timed text/SRT editing and tracking, LLM guide/paste/file workflows, project recovery, real MP4 encoding and the builder round trip. Review images and video are saved under `out/studio-expansion/`.
- `npm run test:studio -- --audio`: focused browser checks for six effects/music scores, device speech controls, real local speech inference, simulated microphone capture, audio-clock playback, reload recovery, portable bundles and decoded MP4 sound. Run `npm run setup:studio-speech` first to cache the pinned model under ignored `out/studio-speech-model`, or set `STUDIO_TTS_FIXTURE` to an existing model directory containing `onnx/` and `voice_styles/`; the suite serves them locally and does not use your microphone.
- `npm run test:ui` and `npm run test:gltf`: character builder and engine-export regression checks.

### Hosting optional speech

The default model URL is pinned to revision `75e6727618a02f323c720cba9478152d4bc16ca4` of `Supertone/supertonic-2` on Hugging Face. Set `VITE_STUDIO_TTS_MODEL_URL` before building to mirror the exact model directory on a CORS-enabled host. It needs `onnx/{tts,unicode_indexer}.json`, `onnx/{duration_predictor,text_encoder,vector_estimator,vocoder}.onnx`, and `voice_styles/{F1,F2,M1,M2}.json`. Keep the model licence with a mirror. Large model files belong on object storage or a suitable model host; they exceed Cloudflare Pages’ individual file limit and are deliberately excluded from `dist/`.

Only the CPU WASM runtime is shipped (approximately 14.2 MiB), loaded with the generation worker when requested. It uses one thread and does not require cross-origin isolation headers. The character builder and ordinary Studio playback do not load the model or runtime. Cold generation needs a connection and sufficient device memory; cached generation can work offline, subject to browser storage availability. Recording/upload remains available independently.
