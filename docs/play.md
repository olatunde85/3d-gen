# Ara Play

Ara Play turns character recipes and a few mission choices into a playable game. Open `/play/` with `npm run dev`, or serve the production build. **Game setup** organizes creation into Mission, Cast, Challenge and Atmosphere. The mission sequence and Add mission action stay visible above every section; a persistent label names the mission and section being edited. Hero and life-budget controls are explicitly shared across the game. **LLM Assist** produces a complete capability guide for an external assistant and accepts its JSON for validation and preview.

Five measured locations, objective chains, enemy roles, ground and helicopter extraction, combat, story cues and independent game ZIPs use the same simulation in preview and export. The creator chooses the story beats; Ara stages characters, routes, terminals, supplies and vehicles automatically.

## Game modes

**Game setup → Mission → What kind of game?** chooses the rules: **Mission** (the staged maps described below), **Arcade race** or **Endless runner**. Race and runner games keep the same four sections: **Mission** picks the circuit or course and the format (laps, or the runner's goal); **Cast** picks your car and the field of rivals, or the chaser, beside the usual character tabs; **Challenge** sets handling, boosts and pickups, or pace, obstacles and power-ups; **Atmosphere** keeps the music. Mission-only controls are set aside while an arcade mode is chosen. Every mode uses the same hero, cast, music, chapters, saved setups and independent game ZIP. Enemy characters drive the rival cars or play the runner's chaser. In JSON, `"mode": "race"` or `"mode": "runner"` sits at the top level with a matching `race` or `runner` object. Each chapter plays its own mode, chosen under **What kind of game?** while that chapter is selected, so one campaign can run a mission, then a street race, then a rooftop escape. A chapter without a `mode` plays the first chapter's mode and, within that mode, inherits its race or runner settings unless it sets its own. In race and runner games the sequence above the sections lists cup races or run stages, or campaign chapters when modes are mixed, and **Make it yours** sets the title and briefing. Each race or stage opens on a briefing card with its briefing, if one is set, and the cup or stage list with finished chapters ticked; **Next race** or **Next stage** opens that briefing. Until the creator names it, an arcade game or chapter takes the name of its circuit or course; a chapter added in an arcade mode takes the next unused circuit or course.

### Arcade race

Choose one of eleven circuits, or supply a custom circuit as 6–64 `[x, z]` control points in metres with a width of 10–24 m and any circuit theme. Custom loops are 400–6000 m long, cannot cross or touch themselves, and need corners no tighter than the road allows. Built-in circuits add ramps, and City Loop and Neon District have shortcuts.

| Circuit | Theme | Ground |
| --- | --- | --- |
| City Loop, Desert Run, Harbour Sprint, Forest Ring | City, desert, harbour, forest | Level road with hills, mesas or skyline in the distance |
| Glacier Loop | Snow and ice | Snowy pines and peaks; the road rolls with the hills; soft snow verges, ice patches and icy traction; rain falls as snow |
| Palm Coast | Tropical coast | Palms, beach huts and the sea beside the road; sand verges slow cars that run wide |
| Neon District | Neon night city | Towers with lit windows, neon signs spilling colour on a wet road, lit barrier strips; always at night |
| Jungle Falls | Jungle | A dirt road through rainforest past waterfalls; mud verges and mud patches; fireflies at night |
| Lagoon Bridges | Lagoon city | City islands joined by bridges over a lagoon, with parked minibuses and tricycles and roadside stalls |
| Mountain Pass | Mountain pass | Switchbacks that climb and fall up to 11% past cliffs and cuttings behind guard rails |
| Kart Arena | Kart arena | A short, tight circuit inside tyre walls and grandstands full of spectators |

Climbs slow cars and descents speed them up; cars tilt with the road and the camera follows them up and down. Soft verges beside the road are drivable but slow, mud patches drag and ice patches take away grip for a moment. Each circuit stands on its own land, which meets the road and rises or falls away from it, under a sky with a distant horizon of peaks, palms, canopy, skyline or mesas.

| Setting | Effect |
| --- | --- |
| `laps` | 1–9 laps; laps are split into three sectors with live deltas against your best lap |
| `opponents` | 3–7 AI racers following a racing line that brakes for each corner; repeated characters race under numbered names |
| `aiSkill` | Easy, medium, hard or expert pace and cornering. Expert rivals run past their car's listed top speed, brake late, take corners faster, fire nitro early and barely ease off when they lead |
| `rubberBand` | Cars behind the player speed up slightly and cars ahead ease off, so races stay close |
| `handling` | **Drift**: hold Drift while steering at speed to slide and charge a boost released on exit; **Grip**: Drift brakes |
| `nitro` | A meter that refills slowly and from drift boosts; hold Nitro on straights |
| `pickups` | Boost pads; item boxes giving a boost, an oil slick to drop behind or a nitro refill; oil-slick hazards |
| `ghost` | Records the best lap and replays it as a translucent car |
| `traction` | `icy` makes every car slide wide; `normal` keeps full grip. Without it, snow circuits are icy and the others normal |
| `car` | Sports car, muscle car, saloon, go-kart, SUV, pickup, danfo, van, box truck, motorcycle, scooter, quad bike or keke, each with its own top speed, acceleration and grip, plus a paint colour |

A countdown starts each race; throttle pressed just before GO gives a launch boost. Walls bounce cars back instead of wrecking them, and a car that is stuck or driving the wrong way returns to the road. **F** returns the player to the road at any time. The HUD shows position, laps, lap and best times, the ghost delta, speed, nitro, drift charge, the held item and a minimap. The results show a podium, the finishing order with car colours and gaps to the winner, the race and best-lap times with any new records, and in a cup the cash earned and the points table.

Best laps, best race times and the best-lap ghost are kept per circuit in the browser. **Copy ghost link** shares the ghost: anyone opening the game with that link races against it on the same circuit. Each game has a **daily challenge** on a circuit chosen by the date. With chapters, the races form a **cup**: points go 10-8-6-5-4-3-2-1, places pay cash, and the **Garage** spends that cash on other cars and paint, comparing each car's top speed, acceleration, grip and turning.

### Endless runner

The course is generated from straights, corners and T-junctions in the chosen theme and gets harder with distance: shorter straights, tighter spacing and more combined obstacles. Every obstacle leaves a way through.

| Obstacle | Way through |
| --- | --- |
| Low barrier | Jump |
| Overhead bar | Slide |
| Gap | Jump |
| Lane blocker | Change lane |
| Moving cart | Change lane |
| Armed enemy | Shoot it down your lane (F, Enter or the Shoot button), or change lane |

Armed enemies rise into view about 32 m ahead in one lane. **Cast → Armed enemies** chooses which enemy appears (`runner.gunman`; automatic picks an armed enemy other than the chaser, and an unarmed one is given a pistol) and the runner's gun (`runner.weapon`; automatic uses the chapter's loadout gun, else a pistol). The runner carries that gun throughout the run. A shot travels down the runner's own lane and drops the nearest enemy within 38 m for 150 points and two coins. An enemy still standing in the runner's lane at 14 m fires once: a shield, hoverboard or boost takes the hit, otherwise the runner stumbles. Running into one ends the run.

Clipping a low barrier or a bar is a **stumble**: the runner slows and the chaser closes in, and a second stumble soon after is caught. Hitting a blocker or cart, falling into a gap, or missing a corner ends the run unless a shield or boost is active. **Revive** continues the run for coins, doubling the price each time.

Coins sit in lines and arcs over jumps. Power-ups are the coin magnet, shield, speed boost, ×2 score, spring boots, hoverboard and coin rush, each shown on the course as a small model of itself over a ring in its colour. Spring boots jump high enough to clear overhead bars and to land on tall blocks and train roofs: the runner runs along a roof until it ends and drops back down, and pressing slide in the air brings them straight down to pick a landing. Anything that cannot be stood on bounces a spring-booted runner back up. On a hoverboard (a self-balancing board with a wheel at each end) the runner stands tall and rolls about a third faster than running, over low barriers and gaps; a crash breaks the board instead of ending the run, and a board never runs out over a gap. Coin rush turns every obstacle on the stretch ahead into coins and closes the gaps for a few seconds, pulling the coins in from every lane. In the train yard half the trains stand still, one to three carriages long, with coins along their roofs. Score is distance plus coins, times the multiplier. Three missions at a time (for example collect coins, run a distance or jump a number of times) raise the multiplier when all three are done. Coins are banked once per run, and the run's result shows distance, coins, multiplier, best score and mission progress. The **Shop** spends banked coins on five levels of each power-up and on extra runners: the enemies. A `goal` of distance, coins or score completes a stage; with chapters, each stage opens the next. `seed` gives every player the same course, and the **daily run** uses a course chosen by the date.

Each theme draws its own obstacles, props, floor, sky and what lies below the gaps:

| Theme | Jump | Slide under | Lane blockers | Moving carts | Below the gaps and around |
| --- | --- | --- | --- | --- | --- |
| Temple ruins | Fallen slabs | Stone lintels | Broken walls | Mine carts | Jungle far below; pillars and ferns |
| City rooftops | Barriers | Pipes | Rooftop blocks | Carts | The street far below; skyline |
| Desert canyon | Rock ledges | Timber beams | Rock blocks | Carts | Canyon floor between rock walls |
| Market street | Produce crates | Striped awnings | Parked tricycles | Yellow minibuses | Trenches in the road; stalls under umbrellas on raised pavements |
| Snowy peaks | Snowdrifts | Icicle beams | Ice blocks | Giant snowballs | Snowfields; ice-cave arches and falling snow |
| Beach boardwalk | Cool boxes | Volleyball nets | Surfboard racks | Ice-cream carts | The sea under the planks; palms, umbrellas and beach huts |
| Neon city | Lit kerbs | Neon beams | Sign blocks | Night cars | The lit city far below; always at night |
| Jungle ruins | Mossy logs | Hanging vines | Stone idols | Rolling boulders | A river under broken bridges; stone gateways |
| Train yard | Buffer stops | Signal barriers | Parked wagons | Carriages, 6.5 m long | Rails in every lane, platforms, gantries and tunnels |
| Volcano | Magma vents | Charred beams | Basalt columns | Fire boulders | Lava; drifting embers |
| Haunted forest | Grave rows | Low branches | Broken fences | A runaway hearse | Fog, dead trees and fireflies; always at night |

#### Medals

Every race and run stage awards bronze, silver or gold, and the best medal for each stage is kept with the game's local records. The briefing card shows the three medals with the best one won lit, and the result card names the medal earned and marks a new best. Races award gold, silver and bronze for first, second and third; **Challenge → Medals → Podium medals** turns them off (`"race": {"medals": false}`). Runs award medals for score targets in one run, 1,500, 4,000 and 8,000 points unless the creator sets their own under **Challenge → Medals** (`"runner": {"medals": {"bronze": 1500, "silver": 4000, "gold": 8000}}`, each above the one before). On a stage with a goal, the goal must be reached first. `"medals": false` turns runner medals off. Daily runs and challenges award no medals.

#### Objects to find

**Mission → Objects to find** lists up to eight objects placed along the course, stored as `runner.objects`. Each object has:

- a **type**, which sets its 3D model and default name: dossier, sealed letter, old map, journal, magnifier, brass key, compass, ancient dagger, figurine, tribal mask, amulet, gemstone, crown, treasure box or hourglass
- a **name** of up to 40 characters, such as "The Minister's dossier"
- an **icon** for the HUD and cards: any object type, or a clue symbol (star, question mark, eye, fingerprint, footprints, lock, skull, flag, puzzle piece, feather, moon or map pin)
- a **count** of 1 to 10 pieces to collect
- an optional **clue** of up to 160 characters, shown when the object is found

Objects appear one at a time and in list order, so clues can tell a story. Each floats in a soft beam of light in a lane clear of obstacles, gaps and carts, at least 70 m ahead, and never on a junction branch. A missed object turns up again about 40 m further on. During the run, a chip for each object sits under the score, counting pieces and lighting up once the object is complete. Finding one shows its name and clue.

The **Find objects** goal (`"goal": {"type": "objects"}`) completes the run once every piece has been found in one run, and needs at least one object. With any other goal the objects are bonus finds worth 250 points each. The briefing card lists the objects to find, and the result card shows what was found with each clue. Objects use their own random sequence, so adding them never changes a seeded course.

### Character moments

**Cast → Player → Character moments** applies to every chapter and is stored as the top-level `poses` (`{"lookAround": true, "dance": true}`, both on by default). With **Look around before the start**, the hero plays the look-around animation while a mission or runner briefing is open. With **Dance on a win**, the hero dances (the groove dance) on a completed mission, and a reached runner goal ends the run: the runner stops, the camera swings round to face them while they dance, and the results follow. Without the dance, missions end with a cheer, and a single runner stage carries on past its goal for a high score while a stage in a series ends there. Race drivers stay in their cars.

### Time and weather

**Atmosphere → Light, weather & sound** sets the time of day and weather for races and runs, stored as `mission.environment.time` and `weather`; each chapter can choose its own. Dawn and dusk tint the sky and lower the sun. Dusk and night switch on every car's headlamps with light pools on the road ahead, lamp posts with pools along the circuit, and lamps and a lantern pool around the runner. Night runs keep a bright moonlit fill, a longer view and faintly lit obstacles so the course stays readable. Rain darkens and wets the road so it reflects, with falling streaks and the Heavy rain recording; fog closes in the view; a sandstorm adds an orange haze, blowing dust and the Sandstorm recording. Both recordings loop with a crossfaded seam, and filtered noise stands in until they load. Weather sound falls silent while the game is paused or the page is in the background. Thicker fog also shortens the draw distance. The lamps and pools are batched additive decals rather than real lights, so night and weather add a handful of draw calls and no extra lighting cost. Race and runner games have no companion; companion settings stay in the JSON but are unused.

### Controls and feel

| Race | Runner | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- | --- |
| Accelerate / brake | — | W / S or ↑ / ↓ | Right / left trigger | The car accelerates by itself; Brake button |
| Steer | Change lane, turn at corners | A / D or ← / → | Left stick or d-pad | Drag the thumb (race) or swipe (runner) |
| Drift | Jump | Space (runner: also W / ↑) | A | Drift button / swipe up |
| Nitro | Slide | Shift (runner: S / ↓) | RB or X (runner: B) | Nitro button / swipe down |
| Item / back to road | — | E / F | B / Y | Item button |
| Restart | Restart | R | Back | Restart on the pause card |
| Pause | Pause | Escape or P | Start | Pause button |

A race or run applied from Game setup or LLM Assist opens on its briefing card; it starts when the player presses Start.

Tilt steering can be switched on from the pause card on phones. The lens widens with speed, impacts shake the camera, speed lines and a soft edge blur grow with pace, boosts flash the screen and near misses briefly slow time; reduced-motion settings soften these effects. Engine pitch follows the car's speed, other sound effects are synthesised in the browser, and the music gains tempo and volume as a race goes on or a run speeds up. **R** restarts immediately without reloading the scene. Opening Game setup pauses the game.

Both modes run fixed-step rules, draw repeated objects in batches and reuse course pieces, coins and obstacles instead of creating new ones. Runner pieces are generated ahead of the player and dropped behind, and the world moves back toward the origin on long runs. Distant drivers are hidden. Leaderboards are local to each browser.

## Mission and locations

Choose Freight depot, Military base, Desert compound, Market street or Urban block. Each has its own solid geometry, measured starts, patrol lanes, roof positions and extraction anchors. Walls and props block movement, sight, bullets and grenade blasts. Twelve arrangements combine three staging patterns with four cover packs. Open, Balanced and Cover-rich layouts remain available.

Three ready-made goals remain available:

- **Escape:** collect the key and unlock the gate, or collect vehicle keys and drive out.
- **Rescue:** free the companion and reach extraction together. With pickup extraction, the rescue unlocks the truck; there is no additional key hunt.
- **Clear:** defeat every enemy, then extract. Use starting or findable firearms.

An optional briefcase or package is a required additional objective. Interact from any reachable side; Ara faces the item and cancels blocked approaches instead of trapping the character. Secured cargo becomes mission inventory.

Choose On foot, Pickup or Helicopter extraction. Pickup challenges provide Easy (inside the compound), Standard (approximately 150 m) or Hard (approximately 300 m) routes. Longer routes include physical roadblocks, cones and ordered checkpoints; route difficulty is independent from vehicle pace.

**Build an objective chain** replaces the fixed goal with one to eight ordered steps:

| Step | Player action | Configuration |
| --- | --- | --- |
| Reach | Enter a marked area | Optional objective wording |
| Download | Hold E / Interact beside a terminal | 3–180 seconds; default 8 |
| Defend | Stay inside the marked 8 m zone, in sight of its marker | 3–180 seconds; default 60 |
| Eliminate | Defeat a selected enemy | Existing enemy ID |
| Survive | Defeat successive squad waves | 1–3 waves |
| Escort | Bring the companion to the marked point | Companion appearance and health |
| Chase | Catch the courier vehicle while driving | Needs vehicle extraction and a ground enemy driver |
| Convoy | Stay close to the convoy until it reaches extraction | Needs vehicle extraction and a ground enemy driver |

Steps are reorderable. Ara spreads their automatically chosen positions across the map and checks every route after adding terminal geometry. Download and defence progress pause outside their zone. A defence zone counts only from the open ground around its marker: inside the ring but behind a wall is a different block, and the objective note says to step into the open. Once the first assault starts, attackers update on the defender every few seconds and close in from their own sides. Ambush waves reuse the configured squad, with a two-second break and a clear entry bay; a player blocking that bay delays entry. The chase courier flees across its side of the gate: it heads for whichever open lane is furthest from you, turns away when cut off, backs out when it bumps into something and speeds up when you get within 30 m. Escort chains start with the companion following, rather than adding a separate rescue interaction. Extraction follows the completed chain. Cargo and ordered road checkpoints still apply.

## Cast and combat

The hero, each of one to five enemies, and the companion can use presets, imported character settings or complete custom character recipes. Customize the squad together or edit individuals. Body settings, clothing and props come from the character builder; gameplay weapons come from equipment and enemy response.

| Equipment / role | Behavior |
| --- | --- |
| Pistol | 12-round magazine; deliberate single shots |
| Rifle | 30-round magazine; automatic fire while held |
| Guard | Capture, pistol or rifle response; adjustable health |
| Rifleman | Telegraphs aimed bursts |
| Elevated sniper | One of two measured roof anchors; longer sight/range and a longer warning |
| Heavy | 300 default health; suppressing bursts toward last-known cover |
| Squad leader | 150 default health; defeating the leader reduces remaining guards’ detection and chase speed, with a brief retreat |

Ammunition is finite or unlimited reserve; unlimited reserve still requires reloading. Optional weapon pickups and objective unlocks start the hero unarmed. Chapter completion can unlock a pistol or rifle; the strongest unlocked firearm carries to later chapters. Combat steps require a starting or findable firearm, avoiding circular objective unlocks.

Shots use height-aware cover tests and stop at the first living actor. Allies block shots without friendly bullet damage. Grenades use swept flight, visible arcs, bounces and a 2.6-second fuse. Blast exposure checks solid cover; the hero and companion can be hurt by explosions. Defeated actors and their equipped guns remain visible in the world. Bullet impacts produce directional reactions and blood; deaths use Ara’s fall animations. A seated driver slumps instead of falling through the vehicle. Shooting never shakes or redirects the camera.

**X / Melee** punches a nearby, visible target. Approach an unaware enemy from behind while crouched for a silent takedown. Range and line of sight are checked at contact, so attacks cannot pass through walls. Ordinary punches alert nearby guards. **Stealth senses** adds running-footstep investigations and body discovery; Night enables it in manual setup, and JSON uses `mission.stealth:true`. Leaving it off retains the original pursuit rules. Gunfire, explosions and engines also cause investigations. With stealth senses, patrols can discover bodies, including those left by quiet takedowns. A body is reported once per observer.

Difficulty (Easy, Normal, Hard) changes incoming damage and visibility. Aggression separately controls each enemy’s detection, pursuit and search behavior. **Leave no trace** fails on detection, shots or explosions; it is unavailable for the fixed Clear goal and pickup extraction.

## Vehicles and air support

A pickup waits from the first frame and stays where it is parked; **Drivable vehicle** swaps it for a sports car, SUV, motorcycle, saloon, muscle car, danfo minibus, van, box truck, keke tricycle, scooter, quad bike or go-kart, each with its own top speed. Cars, vans and trucks are boarded through the driver’s door; the keke, scooter and quad are mounted like the motorcycle. A rescued companion rides in the pickup. The city district’s parked fleet mixes all of these with a city bus. **Moving traffic** (Off, Light or Normal) sends cars, danfos, vans, trucks and yellow taxis around the side streets in the right-hand lane: they slow for corners, queue, stop for people and the player, sound the horn when kept waiting and pull out around stopped vehicles. Moving cars block the player’s car, walkers and gunfire. Local districts have no side streets, so they have no moving traffic. With police on, the patrol chases in a marked police saloon with flashing lights. Approach the driver’s door to board. A rescued companion walks to the opposite door, boards using a fitted passenger performance, and must be seated before driving. Stop before alighting; both occupants can leave and reboard. Actual body size determines cabin clearance and entry anchors. Steering keeps full lock for manoeuvring; at speed the wheel turns in more gently and the lock eases off, so fast driving carves steady arcs. Steering, braking, reverse, walls, props and people use a swept vehicle hull.

Armed drivers can aim, fire and reload while driving. Studio’s mounted weapon layer preserves the seat, feet and control hand. The reachable aim cone is ±110° horizontally and -45° to +60° vertically; the shot uses the same clamped direction. Boarding/alighting hide firearms. Grenades, jumping and crouching remain unavailable while riding.

**Enemy pickup pursuit** assigns the first non-sniper enemy as the truck’s driver. That actor retains their health and weapon. The truck is visible from the start. A bounded arc planner and the real vehicle motor handle pursuit and reversing; blocked routes stop it rather than passing through geometry or people. Defeating its driver stops the pursuit.

**Helicopter extraction** adds a clear landing area beyond the compound and a waiting aircraft. Complete the mission, bring the companion nearby if applicable, and interact beside the right door. Both characters follow collision-checked ground routes to their own measured doors, including when they arrive together on the same side. The pilot waits for the companion to walk around the fuselage; route length determines the approach allowance. Both then use Studio’s native fitted boarding. A seated countdown allows Interact to alight; otherwise the helicopter lifts off and completes extraction. The player does not manually pilot the aircraft.

**Helicopter overwatch** adds a hovering aircraft, spotlight and directional contact reports. It observes; it does not attack or prevent incoming damage. Add a voiced Overwatch story cue with blank text to speak the live contact report.

## Lighting, weather and sound

Atmosphere provides Dawn, Day, Dusk and Night, plus Clear, Rain, Fog and Sandstorm. Night and adverse weather reduce guard visibility. Floodlights have measured solid posts; their lighting reach is shared with perception. A player flashlight reveals nearby terrain and makes the player easier to spot. Close contact and sound still matter at night.

Choose quiet ambience, automatic ambience, wind, forest/birds, ocean, heavy rain or sandstorm from Studio’s compressed recordings. Automatic ambience uses heavy rain in rain, the sandstorm recording in a sandstorm, wind in fog or the desert, birds at a daytime market, and quiet elsewhere. Combat/movement effects include gunshots, impacts, punches, footsteps and body falls. Pickup engines use the recorded engine loop. Playback is bounded, lazy, pause-aware and respects master mute. Audio failures do not stop gameplay.

Choose allowed camera views and the starting view. Players switch among permitted views with V, the camera button or the pause menu. Third person and Close follow start directly behind the character near eye height, with a slight 3° downward tilt. Players can lower the tilt to a fully level view. Orbit and Close follow support horizontal rotation and vertical tilt; fixed Overhead/Isometric views retain their intended elevation. Creators can disable rotation or zoom. Background music comes from the same compressed music library as Studio and loops during active play.

## Story, text and voice

Atmosphere → **Story & dialogue** accepts a Studio JSON or project ZIP and renders it locally into a portable film, or accepts an MP4/WebM. Films are limited to 60 seconds and 24 MiB after rendering. Films play before/after that chapter in every mode and are skippable. The opening film plays when a mission, race or run first starts; the ending film plays when a mission is won, a race is finished or a run goal is reached. Retries and daily challenges skip the films. A missing or unsupported clip cannot permanently block the game.

Add up to 24 cues triggered by mission start, a time, an objective number, detection, overwatch, reinforcement arrival, objective completion or extraction. Cues support subtitles, captions and comic speech/thought bubbles following the selected character. Text timers pause with the game. Each cue plays once per run; checkpoint retries can replay later cues. Cues can also use any recorded Studio sound effect.

Enable **Voice this line** or **Read opening briefing aloud** for native device speech. Device voices vary. **Generate all speech** prepares selected lines with Studio’s on-device speech engine, record speech directly in Play, or attach an audio recording. Choose from two female and two male generated voices for each line. Prepared speech is stored locally and exported as audio; players do not download speech models. Native speech remains a fallback when a prepared line is unavailable. Generate or attach speech for consistent playback across devices.

Story media is content-addressed and stored in browser-owned IndexedDB so reloading preserves it. It does not grant access to arbitrary files on a device. JSON contains references; attached files travel in an editable project ZIP and in the independent game ZIP. The importer rejects external media URLs, unsupported paths, oversized files and mismatched asset hashes.

## Checkpoints, campaigns and replay

Automatic checkpoints save completed goals, defeated targets, collected supplies, ammunition, grenades, cargo and rewards together. Chain checkpoints retain completed steps. Pickup road checkpoints restore safe parked positions and ordered route progress. Retries consume a life, preserve the run’s accumulated time, and provide three seconds of protection. Active ordnance and partial actions are cleared. Checkpoints Off restarts the mission’s objectives.

Campaigns contain the first chapter plus up to nine more, and each chapter can be a mission, a race or a run. When a chapter finishes, **Next** opens the free-roam city district before the following chapter whenever the campaign has a mission in it, whatever the modes on either side; driving to the city's marker opens that chapter in its own mode. Cups and run stages with no missions go straight from one chapter to the next. The hero, remaining life budget and strongest unlocked firearm carry forward between missions; chapters can independently choose locations, objectives, casts, atmosphere, music and story. Beginning a chapter restores its configured health/ammunition. Reloading resumes the latest unlocked chapter, with prior chapter scores and weapon unlocks. Restart campaign clears campaign progress.

Completed runs award **No alarms**, **No damage** and **Under par** medals. Default par time is 180 seconds and can be changed. Retry history cannot erase damage or alarms. Medal records persist locally and chapter results carry their awarded medals. Scoring can be Off, Objectives or Action; action scoring additionally rewards defeated enemies.

## Controls

| Control | Action |
| --- | --- |
| WASD / arrows | Move; vehicle throttle and steering while driving |
| Shift / Run | Sprint; stands up from crouch |
| C / Crouch | Crouch or stand |
| X / Melee | Punch; rear crouched approach enables a silent takedown |
| E / Interact | Use, board, alight, companion wait/follow; hold for downloading |
| Space / Jump | Jump, vault or climb; brake while driving |
| Right mouse / Q / Aim | Aim |
| Left mouse / F / Fire | Fire; hold for automatic rifle fire |
| R / Reload | Reload |
| G / Grenades | Aim a grenade; F/click/Throw releases it |
| L / flashlight button | Toggle flashlight |
| V / camera button | Switch permitted camera view |
| Drag / scroll | Rotate and tilt / zoom, if enabled |
| Escape | Cancel grenade aiming or pause |

Agile movement chooses vaults and climbs from measured heights and safe landings. Parked pickups can be climbed from the hood or rear tailgate, walked across and climbed from the bed onto the roof. Occupied vehicles cannot be climbed. Return to ground level to board. Grounded movement disables jumping/traversal. Crouching lowers actual sight, bullet and blast geometry; it is not invulnerability.

## Save, import and export

- While a game loads, the briefing card names it from the saved setup: its mode, circuit, course or location, title, briefing and key facts, over a plain backdrop for missions, races or runs. The 3D view appears once the cast is ready, and progress shows under the button.

- **Save setup** writes `.ara-play.json` without attachments, or `.ara-play.zip` with local story media. **Open setup** accepts both. It imports character settings separately through Cast. **Start over** clears every setting back to a fresh mission setup after a confirmation; save first to keep the current one.
- **Download game ZIP** includes an independent HTML/JavaScript player, exact generated characters, selected textures, recorded sounds/music and story media. It does not run the character generator or require Ara services.
- `locations.json` contains the selected base map contracts; `staging.json` contains each configured mission’s measured solids, actor starts, objectives, paths, floodlights and extraction area.
- Unzip and serve the folder with a static host or the local HTTP instructions in its README. Browser module/media rules require HTTP rather than opening `index.html` through `file://`.
- Game preparation validates every chapter and its fitted vehicle/aircraft clearance before replacing the current preview. Failure preserves the working game.

LLM Assist’s generated guide enumerates the live capabilities, exact library IDs, custom character schema, media rules and measured maps. Its parser uses the same project and staging rules as manual setup. **Check placements** downloads a per-chapter JSON report with objective coordinates, routes, and specific placement errors. No API key, arbitrary script execution or arbitrary coordinate editor is included.

## Verification and code

`npm run test:play` covers mission migration, navigation, traversal, independent enemy AI, checkpoints, combat, grenades, extraction, progression, campaigns, maps, chains, stealth/melee, specialist roles, aircraft, pursuit, story validation and the LLM contract. `scripts/play-arcade-check.ts` (part of `npm run test:play`) covers mode parsing, custom circuits, full AI races on every circuit, walls, respawn, ghosts and their links, runner course generation, chasers, revives, goals, objects to find, medals and character moments. `npm run test:play:browser -- --arcade` plays a race cup to its podium, a runner to its results and shop, checks phone layouts, exports a race game and switches back to a mission. `npm run test:play:poses` audits actual generated rigs, supported contacts, upright recovery, hit reactions and bone lengths, including rifle and mounted aim across body sizes. Same-side aircraft approach checks cover every map, four headings, touching occupants, two capsule sizes and reboarding.

The `--boarding-ui` browser check covers shared helicopter approach and persistent mission context across all settings tabs at desktop, phone and landscape sizes. Focused browser checks include `npm run test:play:browser -- --expansion` and `--expansion-export` for the new workflow, film attachment and independent ZIP. Existing `--access`, `--cover`, `--combat`, `--campaign`, `--campaign-export`, `--driving-export`, `--assist` and other flags cover the established gameplay and editor. Chrome checks write ignored screenshots and test downloads to `out/play/`. `ARA_TEST_NATIVE_GPU=1` selects the Mac graphics backend; the default uses SwiftShader.

`runtime.ts` owns fixed-step gameplay. `mission.ts`, `locations.ts`, `staging.ts` and `objectives.ts` own measured staging. `enemy-ai.ts`, `enemy-roles.ts`, `weapons.ts` and `combat.ts` own perception and combat. `driving.ts`, `pursuit.ts`, `air.ts` and their views reuse fitted Ara vehicles. `actor.ts` and combat/traversal/stance performance helpers reuse Ara’s existing rigs and clips. `story.ts`, `story-view.ts`, `media.ts` and `project-bundle.ts` own portable story delivery. `player.ts` is shared by creator preview and the independent game player. `arcade/` holds the race and runner modes: `modes.ts` (settings), `track.ts`, `race.ts` and `race-view.ts`, `runner.ts` and `runner-view.ts`, `objects.ts` and `runner-objects.ts` (objects to find and their models), `market.ts` (market street shapes), `medals.ts`, and the shared `player.ts`, `hud.ts`, `input.ts`, `feel.ts`, `sfx.ts`, `records.ts` and `editor.ts`.
