# Changelog

Releases of the `ara3d` package (command-line tool, browser library, `<ara-character>` embed and MCP server) and of `ara3d-data`, the character data the library loads. Versions follow [semantic versioning](https://semver.org/). While the version starts with 0, a minor release (0.6 → 0.7) can change how something behaves; patch releases only fix things.

## 0.16.0 — 2026-11-24

- **Your own characters:** `ara3d export --model hero.fbx` takes a rigged character made in another tool (GLB, glTF, VRM or FBX, such as a Mixamo, Ready Player Me, VRoid or Character Creator character) and bakes Ara's animations and any `--pack` into it. Its skeleton is recognised by its names and shape (Mixamo, Character Creator, Unreal, Daz, VRoid, MMD/CATS and Blender naming, hand-made rigs too), and it's stood up, turned forwards and measured in metres. Textures and Unity material colours beside it are found in its folder. Repeat `--model` for several. See [Your own characters](https://ara3dgen.com/docs/import-characters/).
- **Props on them:** `--weapon`, `--carry` and `--vehicle` fit Ara's props to a model: a weapon on a `WeaponR` socket fitted to its knuckles, a bag in its left hand, and the phone, broom, parcel, gym weights, parachute, head load and vehicles in the animations that use them.
- **Models up to 200 MB** on the command line.

## 0.15.0 — 2026-11-24

- **Content packs: your own animations.** `ara3d pack <folder>` turns animation files (FBX from Mixamo and most tools, glTF/GLB, BVH) into one `.ara-pack.json`, retargeted onto Ara's rig, fingers included. Names come from the files, groups are guessed from the names, loops are found from the motion and duplicate files are skipped. `ara3d pack check` lists a pack; `ara3d pack new` and `pack build` take a `pack.json` for setting everything yourself. See [Content packs](https://ara3dgen.com/docs/packs/).
- **Packs everywhere:** `ara3d export --pack` and `ara3d animations --pack`; the library's `packs` option and `readPack()`; the embed's `packs` attribute; and a `packs` list for the MCP tools `create_character`, `list_animations` and `create_film`. A pack's animations are named `<pack>/<animation>`, and the pack's ID picks all of them.
- **Films list their packs** and load them wherever they open, so a film link works in a browser that has never seen the pack.
- **Unique names in exports:** an animation named like another, such as a pack's "Walk" beside Ara's, carries its pack's name in GLB and FBX files.
- **Schemas** for packs (`pack.v1.json`) and for `pack.json` (`pack-source.v1.json`); `ara3d schema pack` prints the first.

## 0.14.0 — 2026-11-23

- **Faster films over MCP:** the first `film_guide` answer is a short quickstart: the format, a worked example, the sets, presets, everyday animations and music, with the chosen set's staging map when `location` is given. Most films need nothing more; the full rules are topics.
- **Routes:** a film character can have `start: { x, z }` and actions with `to: { x, z }`. Ara works out the facing, travel and duration, and the walk covers its metres at any body size.
- **Facing, off stage and expressions per action:** `face` turns a character from that action on, `hidden` keeps it off stage (not drawn, framed or staging-checked) for entrances and exits, and `expression` changes the face mid-film.
- **Characters by link:** a builder link (`https://ara3dgen.com/app/#c=…`) works as a film character.
- **Items the actions need:** phone calls and texting bring a phone, sweeping a broom, the carry clips a box, head loads the basin, parachuting the rig and the lifts their gym weights, in films and in `create_character`.
- **Link first:** `create_character` returns the builder link and writes files only when `formats` is given. `height_cm` sets the height in centimetres.
- **Clearer errors:** a wrong ID lists the allowed ones.
- **259 animations, with Fitness:** squats, lunges, high knees, push-ups, plank, sit-ups, a coach's clap and point, dumbbell curls, kettlebell swing, barbell back squat and deadlift. Carry `dumbbells`, `kettlebell`, `barbell` or `gym_weights` (all of them); each weight shows only in its lifts.
- **65 preset characters:** The Gym Instructor and The Powerlifter.
- **Pencil skirts** start as plain fabric in one colour; lace and ankara prints are still there.

## 0.13.0 — 2026-11-21

- **248 animations, with football:** shots, straight and inside-foot passes (to the left, forward and to the right), receiving, chest control, headers and jumping headers, standing and slide tackles, a defensive wall (stance and jump), goalkeeper ready, catch, punch and high and low dives, picking up, bouncing and throwing the ball (side, two-hand, low and an overhead throw-in), and the Siu celebration. These clips bring their own football prop.
- **Goalkeeper gloves:** `keeper_gloves`, padded gloves that cover the fingers.
- **MCP answers fit:** no answer is longer than 20,000 characters. Guide topics, big set maps and `character_schema` come in numbered parts.
- **MCP set maps:** `film_guide` gives any set's staging map (`topic: "location-map"` with `location`), and `create_film` runs Studio's staging check and lists anything a character or vehicle walks through.
- **MCP games:** `create_game` describes every chapter. Chapter modes come in any order, such as a mission after a runner or a race. A chapter with a different story leaves the first chapter's objective steps behind.
- **Fixed:** a briefcase or package in a night mission now has a reachable spot on every map.

## 0.12.0 — 2026-11-20

- **Fuller facial hair:** mustaches, goatees and beards are denser and even, with crisp edges, and stop just below the nostrils.
- **Mustache:** bulkier and arched, highest under the nose with the ends drooping past the corners of the mouth.
- **Goatee:** clean edges round both lips, solid sides joining the mustache to the chin, and nothing under the jaw.
- **Short and full beards:** stop a little in front of the ears.
- Dark `beardColor` values render slightly lighter, so dark facial hair looks dark brown, not black.

## 0.11.0 — 2026-11-20

- **63 preset characters:** 13 new ones: The Doctor, The Lab Scientist, The Explorer, The Chef, The Photographer, The DJ, The Basketball Player, The Footballer, The Beach Dude, The Gamer, and three teens: The Schoolboy, The Schoolgirl and The Cool Kid. See them on the [characters page](https://ara3dgen.com/characters/).
- **Numbered jerseys:** `football_shirt` and `basketball_jersey` carry a number from 0 to 99, set with `garmentStyles.<id>.number`, in plain, stripes, hoops (football), sport print or jersey knit.
- **New clothes and props:** chef jacket, chef hat, bib apron, over-ear headphones, knee-high sports socks, a uniform shirt without epaulettes (`school_shirt`), and a camera on a neck strap with its own joint.
- **Take a picture:** a new clip (`take_picture`) that lifts the camera to the eye and fires the shutter twice. 219 animations in all.
- **Fixed:** the long overcoat lies cleanly over any top, with smooth lapels and nothing showing through at the neck, shoulders or lower coat.
- **Fixed:** backpack straps run straight down the chest and curve under the arms, over the clothes at the front and back.

## 0.10.0 — 2026-11-20 (with ara3d-data 1.2.0)

- **50 preset characters:** 18 new ones: The Resort Guest, The Lifeguard, The Paramedic, The Nurse, The Flight Attendant, The Airline Pilot, The Dispatch Rider, The Road Worker, The Street Racer, The Police Officer (USA), The MMA Fighter, The Mob Boss, The Clown, The Masked Robber, The Getaway Driver, The Security Guard, The Motorcycle Cop and The Army Medic. See them all on the [characters page](https://ara3dgen.com/characters/).
- **New clothes and gear** for them: scrubs, a resort shirt, loose shorts, a singlet, a racing jacket and racer shirt, a biker vest, a fur jacket, a neck scarf, epaulettes, a hard hat and an open-face helmet.
- **Fixed:** the hi-vis vest stays on the chest over a long shirt, and the singlet keeps clean armholes when the arms rise.

## 0.9.0 — 2026-11-18

- **Handshake:** a two-person clip. Both characters play it, standing face to face 0.75 m apart, each 0.1 m to the other's right; their right hands meet, shake three times and let go. See [Two people](https://ara3dgen.com/docs/animations/) in the animations guide.
- **Laugh hard:** a new motion-captured laugh that leans back and doubles over.
- **Cheer** raises the fists to head height once every 0.8 seconds with a soft bounce, instead of fast double pumps and hops.
- **Laugh** is smoother: two bouts of rounded laughs that fade into a breath, with a slow sway.
- 218 animations in all.

## 0.8.0 — 2026-11-18

- **Films and games for AI assistants:** `ara3d mcp` gains `film_guide`, `create_film`, `game_guide` and `create_game`. An assistant writes an Ara Studio film or an Ara Play game; the tools check it as Studio and Play do, save it, and return a link that opens it. The guides come in topics, so each answer fits what assistants accept. See the [MCP guide](https://ara3dgen.com/docs/mcp/).
- **Game schema:** `ara3d schema game` prints the Ara Play game schema, also published at `ara3dgen.com/schemas/play-game.v2.json`. Game files may name it in a `$schema` field.
- **Fixed:** the hi-vis vest's reflective bands stay on the chest when an arm rises, and the vest no longer shows through them.
- **Fixed:** laughing lifts the upper lip far enough to show the upper teeth.

## 0.7.4 — 2026-11-18

- **Fixed:** the tank top, tactical vest, hi-vis vest and leather armour have clean strap edges at every detail level, and the straps stay clean when the arms rise (waving, cheering).
- **Fixed:** an open mouth no longer shows red walls at its corners. The gums split cleanly between the jaws, and the inside of the mouth is in shadow. Exported characters have a `Mouth` material for it, beside `Skin`.

## 0.7.3 — 2026-11-17 (with ara3d-data 1.1.0)

- Loads ara3d-data 1.1.0 again, now that it's on npm, so the faster loading from 0.7.0 is back: the first character usually takes 2–4 MB.

## 0.7.2 — 2026-11-17

- **Fixed:** characters build again from the default CDN. 0.7.0 and 0.7.1 ask for ara3d-data 1.1.0, which isn't available on npm yet. 0.7.2 loads ara3d-data 1.0.0, which has no web copy, so the first character downloads about 10 MB, as in 0.6.

## 0.7.1 — 2026-11-17

- **Fixed:** an expression set with `hero.setExpression()` now holds while animations play. Before, the clip's own copy of the face replaced it at the clip's first blink.
- Clips that move the face (laugh, talk, the hit reactions) add their movement on top of the expression in `hero.update(delta)`, so call it every frame after `mixer.update(delta)`. The GLB in `hero.glb` and from the command line keeps the full face animation.

## 0.7.0 — 2026-11-17 (with ara3d-data 1.1.0)

- **Faster loading:** the library downloads only the body shapes a character uses. The first character usually takes 2–4 MB instead of about 10 MB, and each different character after it adds well under 1 MB.
- Low and medium detail use textures up to 1024 pixels across. High detail keeps the full-size ones.
- ara3d-data 1.1.0 adds the web copy of the data these use (`assets/web/`). With older data, the library loads the full files instead.

## 0.6.0 — 2026-11-17

- `hero.locomotion(mixer)` blends idle, walk and run by speed, with steps that keep pace with the ground.
- `hero.lookAt(target)` turns the head and neck towards a point or an object. The embed gains `look-at="pointer"` and `look-at="camera"`.
- `hero.lipSync(source)` moves the mouth with an `<audio>` or `<video>` element, a microphone or a Web Audio node.
- Starter templates for three.js, React Three Fiber and plain HTML, each with a StackBlitz link.
- Asking for the `texting` or `phone_call` clips brings the phone, unless a carried item is chosen. This applies to the library, embed, command line and MCP server.

## 0.5.0 — 2026-11-17

- Embed: the `clips` attribute loads extra clips, `playClip()` blends between them without rebuilding, and `snapshot()` and `restart()` were added.
- Embed: a `margin` attribute for room around the character, a shade that follows a moving character, and framing based on the space the animations fill.
- Embed: while loading, it shows a wireframe of a man or a woman to match the character, styleable as `::part(figure)` and `::part(status)`.

## 0.4.0 — 2026-11-16

- `ara3d mcp`: a Model Context Protocol server, so AI assistants can list presets, animations and props and build characters to GLB, FBX, OBJ or ZIP files. See the [MCP guide](https://ara3dgen.com/docs/mcp/).

## 0.3.2 — 2026-11-16

- Embed: a loading figure and progress line, and clearer error messages.
- Data downloads that fail, stall or meet a busy server are retried up to four times.
- Pages opened straight from disk explain that they need a web server.

## 0.3.1 — 2026-11-16

- **Fixed:** at low detail, skin no longer shows through coats and jackets as the character moves.

## 0.3.0 — 2026-11-16

- The `<ara-character>` embed: one script tag and one element put a live, animated character on any web page.
- `hero.playSequence(mixer, "walk 3s, wave, cheer x2")` chains clips with blends between them. The embed's `animation` attribute takes the same lists.
- `VEHICLE_CLIPS` lists the clip that shows each vehicle in use.

## 0.2.0 — 2026-11-16 (with ara3d-data 1.0.0)

- The browser library: `createCharacter()` builds rigged, animated three.js characters in a background worker, and `createCharacterGLB()` returns the GLB bytes. Types are included.
- Accepts presets, random seeds, builder share links and character files.
- Faces: `setExpression()`, `setMouth()`, `setFace()` and blinking.
- `colors` recolours outfits, shoes, carried items and vehicles.
- `PRESET_NAMES`, `ANIMATIONS` and `PROPS` lists.
- ara3d-data 1.0.0: the character data, served by jsDelivr.

## 0.1.0 — 2026-11-15

- The `ara3d` command-line tool: `export`, `presets`, `animations`, `props`, `new` and `schema`.
  - Characters from presets, seeds or `params.json` files, in GLB, FBX and OBJ.
  - Choice of animations, root motion, per-clip files and props.
- The character data downloads once on first run and is cached for offline use.
- Published JSON schemas for character files and Studio films at `ara3dgen.com/schemas/`.
