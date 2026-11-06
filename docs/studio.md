# Ara Studio

Studio turns Ara characters into short films with dialogue, sound and music. Open **Studio** in the character builder's bottom toolbar, or go to `/studio/`. It's an early preview: films run up to 60 seconds with up to five characters.

## First visit

An animated **Quick tour of Studio** opens once the first set is ready. It highlights the real controls and demonstrates selecting, dragging, keyboard movement, turning, elevation and orbiting, then covers the timeline, cameras, sound, text, LLM Assist and export. Use **Back / Next** or **Left / Right** to move through the guide; **Skip tour** or **Escape** closes it. The illustrations leave your film and Undo history untouched. The guide adapts to small screens and respects reduced-motion settings.

Replay it from **Quick tour of Studio** in the left panel, or press **?** with the preview focused. Dismissal is remembered in this browser. A recovered text, sound or LLM Assist dialog stays open; the first-use tour waits until you close it.

## The workspace

- **Left:** locations, the cast, their equipment and the quick tour.
- **Centre:** the film preview, with the timeline below it.
- **Right:** the selected action, placement and camera settings.
- **More room for the picture:** **Expand** (or **F**) hides the side panels and the timeline rows. Drag the bar between the preview and the timeline to resize them; double-click it to reset. Both are remembered.

Use the top-bar **Undo** for any edit, including moves, camera changes and the title. **Space** plays or pauses.

To start afresh, click **New** in the top bar. Choose **Save & start new** to download the current project (including attached speech), or **Start new** to replace it immediately. **Cancel** keeps your film. A new project has one idle character, one wide camera shot and no text or sound; it saves on this device as usual. **Undo** brings the previous film back, including after a reload.

## Find a location

Search **66 sets**, or filter by **Studios**, **Workplaces**, **Homes**, **Leisure**, **City** and **Outdoors**. They include executive and open-plan offices, a boardroom, a classroom, a newsroom, bedrooms, a living room, a kitchen, beaches, pools, a hotel lobby, a café, a forest trail and a harbour.

The expanded catalogue also includes hospital and police rooms, a military base, a prison cell and yard, public and private bathrooms, a highway, a neon-lit street, a daylight alley, a football stadium, fine dining, a nightclub, an elevator and a church. The earlier **Neon alley** remains available for existing films.

Each location has its own layout. The new indoor sets have clear foreground or central acting space, and chairs, pews and benches register real seating positions. The highway and base retain long driving routes. The stadium has a 68 × 105 m association-football pitch; no crowd or players are added automatically. Doors, toilets, taps and lift controls are scenery. Mirrors use stylized surfaces rather than live reflections. LLM Assist includes the layouts and staging notes; movement still requires you to avoid obstacles.

Changing the set keeps your cast, performances, camera shots and title. Every set is original, built in the browser, with no downloads.

## Direct the cast

- **Add characters:** bring your exact character from the builder, or pick an Ara preset. **Add character** grows the cast to **five**. New characters start in a free spot and the others stay where they are.
- **Select:** click a character in the picture, or their name under **The cast**. The selected character gets a gold ring and a name tag. Click the background, press **Escape** or use **Deselect** to clear it. Equipment and placement say so if you try to use them with nobody selected.
- **Move:**
  - Drag a character across the floor, or choose **Click to place** (or Shift-click the ground).
  - **Arrow keys** move the selected character 0.1 m, relative to your view. With the preview focused, hold **Ctrl** (or **Command ⌘** on Mac) with **Left/Right** to turn 5°, or **Up/Down** to raise or lower 0.05 m. **Shift** is also supported as an alternative. Selecting a character focuses the preview. Releasing the modifier completes the move even if the browser misses the arrow-key release.
  - The placement fields set the exact position, facing and height.
- **Arrange the group:** **Stage the cast** on the right applies **Side by side**, **Conversation** or **Facing each other** when there are exactly **two characters**; no individual selection is needed. It is hidden for casts of three to five, which you place individually, and disabled until a second character is added. The dropdown shows a matching arrangement until you change the placement manually, and Undo or reload restores that display from the actual positions. Seated characters continue to fit the set’s seats.
- **Equipment:** under **Equipment**, give the selected character a weapon (rifle, pistol, sword or knife) or choose **Carry** for a bag or **Box / parcel**. Use Weapon: None with the parcel. Ordinary Walk, Run, backwards walk, strafes, turns, Idle, Talk and Laugh keep it in both hands automatically, at their normal speed. Pick up and the dedicated carry clips also work. Put down / drop releases it onto the ground; the actor can walk away while the box stays behind. Return to the box for a later pickup. This is preserved when seeking or reopening the project, and appears in the film.
- **Edit in the builder:** **Character builder** opens the selected character for editing. The builder's **Studio** button brings you back with only that character changed. Save your project first if your browser blocks session storage.

Removing a character also tidies up camera shots and captions that pointed at them. Their recordings and sound effects stay, assigned to the narrator.

## Actions and camera shots

The timeline has a **camera lane** and a **performance lane for each character**, all on the same clock. The **Select a shot or action** menu reaches very short items in longer films.

- **Actions:** choose from **114 animations**, searchable by name and category. Set a duration, or use the clip's own length. One-off actions hold their last pose; looping actions repeat.
- **Move through the set:** walking, running and strafing clips can travel. There's no collision detection, so characters will walk through walls, furniture and each other. Give them a clear path.
- **Sitting:** seated clips use the set's own furniture. Studio moves the character onto the nearest free chair, sofa, armchair, bench, stool or log, facing the way it faces, at the right height. Drag a seated character towards another seat to switch. Sets with nowhere to sit, such as studios, beaches and streets, say so.
- **Props:** vehicle models follow the selected riding/driving action automatically. Dedicated modern sports-car and SUV actions sit alongside the classic car, bicycle, motorcycle, horse, canoe, kayak, rowboat and motorboat performances. The selected action’s **Show vehicle** checkbox controls visibility; **Vehicle appearance** in Equipment edits colours, finish and styling. There is no separate model dropdown.
- **Vehicle travel:** enable **Move through the set** on the operator’s action and adjust **Travel speed (m/s)**. Defaults are now three times the original speeds (e.g. motorcycle 5.4 m/s, car/SUV 4.8 m/s, motorboat 4.2 m/s); explicit saved speeds are retained. Shared passengers follow automatically. Travel does not retime the animation. Stage a clear route: walls, furniture and other actors do not stop vehicles, and there is no water simulation. Outdoor sets now have extended paths, landscaping and waterfronts across a 360 m performance area, with placement up to ±200 m on X/Z.
- **Custom cast:** in the builder, **Save character** downloads a small `.ara-character.json` with all editable settings; **Open character** reopens it. In Studio, **+ Custom** imports that file as another cast member, preserving the existing characters and film. Custom characters count toward the five-character limit, can be edited via Character builder, survive reload, and can be removed with Undo.

- **Camera shots:** full-body, medium or close framing, on the **whole cast** or **one character**.
- **Limits:** up to **16 actions per character**, **12 camera shots** and **60 seconds** per film. Each item lasts 0.1–12 seconds.

Drag either edge of a timeline clip to adjust its timing. The right edge of an action or shot changes its duration and shifts later clips; its left edge adjusts the boundary with the previous clip, keeping the selected clip’s end fixed. The first action/shot starts at zero. Text, speech, sound effects and music have independent start/end handles. Timing respects the film limits and shared-vehicle boarding constraints. **Escape** cancels; **Undo** reverses a completed drag in one step. Handles also accept Left/Right (one frame), or Shift + Left/Right (0.1 seconds). Audio edges change the playback window; source trimming remains a separate control.

## Move the camera

Each camera shot can have its own angle. Select its camera block and enable **Custom camera for this shot**, then set **Angle**, **Elevation**, **Distance** and **Movement**. Orbiting or zooming the preview edits the active custom shot. Disable the option to inherit **Film camera defaults** again. Shots without overrides keep the film’s camera settings, including older projects. The same cuts appear in playback, PNGs and MP4 exports.

- **Orbit:** drag the background. Alt-drag or right-drag also works over a character.
- **Zoom:** scroll, or pinch on a touch screen. With the picture focused, **+** and **−** zoom and **Home** resets.
- **Rotate with the keyboard:** the arrow keys, when no character is selected.
- **Camera movement:** locked, slow push-in or gentle orbit, on top of your chosen angle.

The angle is saved with the film, so the preview, saved frames and the exported video match. Walls cut away when you look in from outside. Choose **landscape (16:9)** or **portrait (9:16)**, and edit the film's name in the top bar; **Show title in the film** adds it as a caption. Selection rings and name tags never appear in saved images or videos.

## Subtitles, text and comic bubbles

Choose **Text & subtitles** above the timeline, then add a **Subtitle**, **Text** or **Bubble**.

- **Styles:** subtitle plates, outlined text, speech bubbles, thought bubbles and comic bursts.
- **Placement:** **Fixed in the frame**, or **Follow** a character so the text moves with their head.
- **Timing:** set the start, duration, size and colours. Up to **64 cues** can overlap.
- **SRT:** **Import SRT** adds timed subtitles, and **Save SRT** exports them. SRT keeps text and timing only; styles are saved in the project.

Text is visual only: it doesn't create speech or lip-sync.

## Speech

Choose **Sound** above the timeline. Up to **24 speech clips** can overlap, each with its own start, duration, speaker, volume, pan, speed and trim.

There are three ways to add a voice:

1. **Typed dialogue:** write the line, choose one of four English voices, then **Generate all speech** (or **Generate this clip**). The first time downloads a speech model of about 265 MB; it runs on your device, and your dialogue isn't sent anywhere.
2. **Record:** allow the microphone, record and stop. Recording needs HTTPS or localhost.
3. **Upload:** a WAV, MP3, M4A, Ogg or WebM file, up to 60 seconds and 24 MB, with **Attach audio** or **Replace audio**.

**Quick read-through with a device voice** uses your browser's built-in voices, with no download. It's for rehearsing only: it can't take effects and isn't included in exports.

- **Voice effects:** **Natural**, **Robotic**, **Dramatic**, **Radio**, **Telephone** and **Echo**. **Preview voice** plays the result.
- **Fit duration to audio** matches the clip to its take. A shorter clip cuts the take; a longer one adds silence.
- **Nothing missing:** dialogue still waiting for a voice shows **Add speech audio** under the preview and in the export dialog.

Assigning a speaker doesn't add lip-sync or place the voice in the scene.

## Music

Choose from **nine recorded tracks**, grouped by genre: Dramatic Adventure Trailer, Tropical Relaxing Pop, Jazz Restaurant Music, Horror, Urban Hip Hop Beat / Hip Hop Story, Spy Opening Scene, Afrobeat Instrumental / Alone, Spy Agent Mission Music and Old School Salsa 02. The picker shows each creator and length.

Only the chosen track downloads. The film uses its beginning, with your volume and fades, and lowers the music under dialogue.

Music follows the whole film by default. Drag its timeline edges or enable **Custom music timing** in Sound to choose a start and duration. Fades follow that window; turn custom timing off to follow the film again.

## Sound effects

**Sound effects** above the timeline opens nine recordings, grouped by category: suppressed pistol, rifle shot, body fall, motorcycle/car/boat engines, wind, forest birds and ocean. Engine takes last eight seconds and ambient takes last four seconds. Enable **Loop until cue ends** for longer engine or ambience beds. The recording repeats from **Trim start** to its end at the chosen speed, stopping exactly at the cue’s end. Looping is off by default; longer non-looping windows leave silence after the recording. LLM Assist lists every ID, source duration and the optional `loop` field.

1. Listen, then **Add at playhead**.
2. Set the start time to the moment of the shot or impact.
3. Adjust duration, trim, speed (0.5–2×), volume (0–200%) and pan. **Duplicate** adds another after it.

Up to **64 effects** can overlap the dialogue and music. Tag an effect with a character to keep things organised, or leave it as a **Scene sound**. Effects don't make anything happen on screen: a thump doesn't make a character fall, so direct the matching action yourself.

## LLM Assist

**LLM Assist** in the top bar turns a description into an editable film, using any AI assistant you like: ChatGPT, Claude, Gemini or another. No API key is needed and Studio sends nothing on its own.

1. **Describe your film,** or pick one of the **Ideas**. Tick **Start from my current film** to revise what you have.
2. **Get the film JSON:** **Copy guide** (or **Save as .txt**) and give it to your assistant. The guide holds your description and everything the assistant needs: the locations, character controls, animations, equipment, text, speech, sound effects, music, the JSON format, an example and Studio's limits.
3. **Review and build:** **Paste reply**, paste into the box, or **Open file**. You can paste the whole reply; Studio finds the JSON inside it. A summary card lists the location, cast, length, shots, actions, text, sound and music. If something's wrong, it says what and offers **Copy fix request** to send back. **Build film** replaces your project, and Undo brings the old one back.

- **Voices are prepared for you:** typed dialogue in a valid reply is generated while you review, with progress, **Stop generation** and retry.
- **Try an example:** loads *Agents of Mild Competence: The Warehouse*, a 30-second, five-character spy comedy with its original dialogue, sound effects and music. No speech download needed.
- **Shortcuts:** Ctrl/Cmd+Enter in the description copies the guide; in the JSON box it builds. Drafts survive reloads.

The guide is built from Studio's own catalogues, so new sets, presets, animations and equipment appear in it automatically.

### Characters in film JSON

The assistant can design each character with the same controls as the [character builder](characters.md#character-llm-assist). Use `params` on its own, or with a `preset` to start from:

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

- **Or embed a builder character:** put a whole character-builder reply (`"kind": "ara-character"`) or a `.params.json` in the actor's `character` field. Don't combine `preset` with `character`.
- **What's kept:** anything left out keeps the preset's value, or the default. Arrays and maps you supply replace the inherited ones. The actor's own `detail`, `weapon` and `carry` win over the character's.

A sound effect cue goes in the film's `audio` object:

```json
{"effects":[{"id":"landing","sound":"body-fall-thump","start":2.4,"volume":0.8}]}
```

The normal **Open** button accepts the same JSON. Anything invalid (unknown presets or fields, bad camera targets, out-of-range timings) is rejected before any character is built.

## Save and export

- **Automatic:** Studio saves on this device as you work. A reload brings back the film, the view, your selection, the playhead, open editors, LLM Assist drafts and your Undo history.
- **Save project:** downloads an editable `.ara-studio.json`. Films with recorded or generated voices save as a `.ara-studio.zip` bundle with the audio included (up to 128 MB). **Open** loads either one, on any device.
- **Save frame:** the current picture as a PNG.
- **Export film:** a 30 fps MP4 at 720p or 1080p, with sound. **Save soundtrack WAV** exports the audio on its own.

Recordings and generated voices are stored in your browser, which can clear them; save a project bundle to keep them safe. Projects point to Ara's built-in characters, sets and sounds rather than copying them, so keep the same Ara version to reopen them exactly.

**Video export** needs HTTPS or localhost, and a browser that can encode MP4 video (current Chrome, Edge or Safari). If sound can't be encoded, save the WAV separately or use another browser. Rendering can take longer than playback; keep the tab open. Five detailed characters in a long film need more memory and time.

## What Studio doesn't do yet

- Lip-sync for dialogue
- Characters touching or holding each other, or handing over props
- Collisions and pathfinding
- Importing your own models

Each character's performance is directed on its own, on a shared clock.

## Assets and licences

- **Sets:** original geometry and textures in the source code.
- **Music and sound effects:** supplied for Ara. Credits ship in `media/music/CREDITS.txt` and `media/effects/CREDITS.txt`. The recordings keep their own rights and aren't covered by the MIT code licence.
- **Speech:** the optional Supertonic 2 model and voices are **OpenRAIL-M**, including its use restrictions, and are downloaded only when you generate speech. ONNX Runtime Web is MIT. Notices ship in `third-party/speech/` and are linked from the sound editor.
- **Video:** [Mediabunny](https://mediabunny.dev/) (MPL 2.0) encodes the MP4. Every build includes its licence and source in `third-party/mediabunny/`, linked from the export dialog.

Character assets and motion capture keep their usual terms. Hosting, the speech model and the Studio tests are covered in [Self-hosting](self-hosting.md#studio).

### Entering and leaving vehicles

Choose **Board…**, the matching riding/driving action, then **Alight from…** from the animation search. There are 26 entry/exit actions across all ten vehicles, including driver/passenger roles for all three cars. Use the full clip duration for entry/exit and keep **Move through set** off; those actions contain their own footwork. Riding can travel at an adjustable speed between them. Car doors and the motorboat’s boarding gate open and close with the action.

Boarding/alighting now play at twice their original speed: full actions take 1.6–2.2 seconds. New actions and **Original timing** use those durations; existing longer timeline beats finish the motion sooner and hold its end pose.

Every scheduled vehicle is present from the beginning, waiting at its first entry. It stays parked after exit even when its actor boards a different vehicle. For **Ride motorcycle → Alight → Run → Board motorboat → Drive boat**, Studio places the boat at the end of the approach and retains the motorcycle behind. Scrubbing, Save/Open, Undo, reload and MP4 use the same timeline-derived state. Reusing an identity returns to that physical vehicle; different identities create separate props of the same model.

### Share a vehicle

1. Give the operator a matching boarding/riding/alighting sequence.
2. Select another character’s matching vehicle action. In **Vehicle**, choose **Share · [operator]** and select a **Seat**. The link applies to the complete contiguous entry/ride/exit sequence.
3. Add waiting or walking beats to synchronize entry. Passengers follow the vehicle’s placement, yaw and movement automatically; no copied speed, hand-set offsets or duplicate hidden prop is required.
4. Keep the operator stationary while anyone boards/alights. Stagger use of the motorboat gate, motorcycle, canoe or rowing-boat entry. Cars use separate front doors; the SUV also opens its rear doors. Occupied seats and boarding a moving vehicle are rejected with an explanation.

| Vehicle | Occupants |
| --- | --- |
| Convertible / sports car | Driver + front passenger |
| SUV | Driver + front passenger + two rear passengers |
| Motorboat | Helm operator + two aft passengers |
| Motorcycle / canoe / rowing boat | Rider/operator + one passenger |
| Bicycle / horse / kayak | One rider |

Passengers use the host model’s animations; **Seat** supplies the appropriate seated or pillion performance, fitted to their own body. Exit leaves them on the ground while the vehicle can depart. Add walking approaches and space waiting characters apart; this is authored staging, not collision avoidance.

LLM Assist uses per-beat `vehicleId` and `vehicleSeat`. For example, the operator’s `{"clip":"drive_boat","duration":5,"move":true,"vehicleId":"launch","vehicleSeat":"operator"}` can be shared by a passenger using the same `vehicleId`, `vehicleSeat:"passenger-left"` and `move:false`. Keep those fields on entry and exit too. The other aft seat is `passenger-right`; car seats are `front-passenger`, `rear-left` and `rear-right` where supported. The operator’s character supplies vehicle colours and body fit. Existing unlinked projects retain automatic actor-owned vehicles.

### Armed riding

Choose a weapon in Equipment, then a riding/driving action. In that action’s inspector, **Weapon action** chooses Wield, Aim / present, Fire (pistol/rifle) or Hide weapon; Match animation automatically wields while riding and hides during boarding/alighting. **Aim (°)** sets heading relative to the character: 0 forward, positive left, negative right. The vehicle and riding mechanics stay attached. Canoe/kayak/rowing strokes pause while armed; hidden resumes normal paddling.

The same actor can board with free hands, ride armed, then exit without changing its character recipe. For example, equip `weapon:pistol` once and use these sequential beats:

```json
[
  {"clip":"board_motorcycle","duration":1.7,"move":false},
  {"clip":"ride_motorcycle","duration":3,"move":true,"weaponPose":"fire","weaponYaw":-60},
  {"clip":"alight_motorcycle","duration":1.7,"move":false}
]
```

LLM Assist includes the fields, defaults and restrictions. Pose/direction survive Save/Open, reload and Undo. Fire is a recoil performance; time gunshot effects yourself. There are no automatic projectiles, targets, muzzle flashes or damage. Weapon model selection remains actor-wide; the beat controls its use and visibility.
