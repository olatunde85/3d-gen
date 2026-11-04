# Ara Studio

Studio turns Ara characters into short films with dialogue, sound and music. Open **Studio** in the character builder's bottom toolbar, or go to `/studio/`. It's an early preview: films run up to 60 seconds with up to five characters.

## The workspace

- **Left:** the cast and their equipment.
- **Centre:** the film preview, with the timeline below it.
- **Right:** the selected action, placement and camera settings.
- **More room for the picture:** **Expand** (or **F**) hides the side panels and the timeline rows. Drag the bar between the preview and the timeline to resize them; double-click it to reset. Both are remembered.

Use the top-bar **Undo** for any edit, including moves, camera changes and the title. **Space** plays or pauses.

## Find a location

Search **50 sets**, or filter by **Studios**, **Workplaces**, **Homes**, **Leisure**, **City** and **Outdoors**. They include executive and open-plan offices, a boardroom, a classroom, a newsroom, bedrooms, a living room, a kitchen, beaches, pools, a hotel lobby, a café, a forest trail and a harbour.

Changing the set keeps your cast, performances, camera shots and title. Every set is original, built in the browser, with no downloads.

## Direct the cast

- **Add characters:** bring your exact character from the builder, or pick an Ara preset. **Add character** grows the cast to **five**. New characters start in a free spot and the others stay where they are.
- **Select:** click a character in the picture, or their name under **The cast**. The selected character gets a gold ring and a name tag. Click the background, press **Escape** or use **Deselect** to clear it. Equipment and placement say so if you try to use them with nobody selected.
- **Move:**
  - Drag a character across the floor, or choose **Click to place** (or Shift-click the ground).
  - **Arrow keys** move the selected character 0.1 m, relative to your view. Hold **Shift** or **Ctrl/Cmd** with **Left/Right** to turn 5°, or **Up/Down** to raise or lower 0.05 m.
  - The placement fields set the exact position, facing and height.
- **Arrange the group:** **Side by side**, **Conversation** (a semicircle) or **Facing each other**.
- **Equipment:** under **Equipment**, give the selected character a weapon (rifle, pistol, sword or knife) or a bag (straw tote, handbag, briefcase or backpack).
- **Edit in the builder:** **Character builder** opens the selected character for editing. The builder's **Studio** button brings you back with only that character changed. Save your project first if your browser blocks session storage.

Removing a character also tidies up camera shots and captions that pointed at them. Their recordings and sound effects stay, assigned to the narrator.

## Actions and camera shots

The timeline has a **camera lane** and a **performance lane for each character**, all on the same clock. The **Select a shot or action** menu reaches very short items in longer films.

- **Actions:** choose from **77 animations**, searchable by name and category. Set a duration, or use the clip's own length. One-off actions hold their last pose; looping actions repeat.
- **Move through the set:** walking, running and strafing clips can travel. There's no collision detection, so characters will walk through walls, furniture and each other. Give them a clear path.
- **Sitting:** seated clips use the set's own furniture. Studio moves the character onto the nearest free chair, sofa, armchair, bench, stool or log, facing the way it faces, at the right height. Drag a seated character towards another seat to switch. Sets with nowhere to sit, such as studios, beaches and streets, say so.
- **Props:** a bicycle appears for the cycling clip, and weapon clips use the character's equipment. Other vehicles aren't created, and hands don't grab set props or other characters.
- **Camera shots:** full-body, medium or close framing, on the **whole cast** or **one character**.
- **Limits:** up to **16 actions per character**, **12 camera shots** and **60 seconds** per film. Each item lasts 0.1–12 seconds.

## Move the camera

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

## Sound effects

**Sound effects** above the timeline opens the effects library: **Suppressed pistol shot** and **Body fall thump**.

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
