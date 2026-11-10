# Ara Play

Ara Play turns character recipes and a few mission choices into a playable game. Open `/play/` with `npm run dev`, or serve the production build. **Game setup** organizes creation into Mission, Cast, Challenge and Atmosphere. The mission sequence and Add mission action stay visible above every section; a persistent label names the mission and section being edited. Hero and life-budget controls are explicitly shared across the game. **LLM Assist** produces a complete capability guide for an external assistant and accepts its JSON for validation and preview.

Five measured locations, objective chains, enemy roles, ground and helicopter extraction, combat, story cues and independent game ZIPs use the same simulation in preview and export. The creator chooses the story beats; Ara stages characters, routes, terminals, supplies and vehicles automatically.

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
| Defend | Stay inside the marked zone | 3–180 seconds; default 60 |
| Eliminate | Defeat a selected enemy | Existing enemy ID |
| Survive | Defeat successive squad waves | 1–3 waves |
| Escort | Bring the companion to the marked point | Companion appearance and health |

Steps are reorderable. Ara spreads their automatically chosen positions across the map and checks every route after adding terminal geometry. Download and defence progress pause outside their zone. Ambush waves reuse the configured squad, with a two-second break and a clear entry bay; a player blocking that bay delays entry. Escort chains start with the companion following, rather than adding a separate rescue interaction. Extraction follows the completed chain. Cargo and ordered road checkpoints still apply.

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

A pickup waits from the first frame and stays where it is parked. Approach the driver’s door to board. A rescued companion walks to the opposite door, boards using a fitted passenger performance, and must be seated before driving. Stop before alighting; both occupants can leave and reboard. Actual body size determines cabin clearance and entry anchors. Steering, braking, reverse, walls, props and people use a swept vehicle hull.

Armed drivers can aim, fire and reload while driving. Studio’s mounted weapon layer preserves the seat, feet and control hand. The reachable aim cone is ±110° horizontally and -45° to +60° vertically; the shot uses the same clamped direction. Boarding/alighting hide firearms. Grenades, jumping and crouching remain unavailable while riding.

**Enemy pickup pursuit** assigns the first non-sniper enemy as the truck’s driver. That actor retains their health and weapon. The truck is visible from the start. A bounded arc planner and the real vehicle motor handle pursuit and reversing; blocked routes stop it rather than passing through geometry or people. Defeating its driver stops the pursuit.

**Helicopter extraction** adds a clear landing area beyond the compound and a waiting aircraft. Complete the mission, bring the companion nearby if applicable, and interact beside the right door. Both characters follow collision-checked ground routes to their own measured doors, including when they arrive together on the same side. The pilot waits for the companion to walk around the fuselage; route length determines the approach allowance. Both then use Studio’s native fitted boarding. A seated countdown allows Interact to alight; otherwise the helicopter lifts off and completes extraction. The player does not manually pilot the aircraft.

**Helicopter overwatch** adds a hovering aircraft, spotlight and directional contact reports. It observes; it does not attack or prevent incoming damage. Add a voiced Overwatch story cue with blank text to speak the live contact report.

## Lighting, weather and sound

Atmosphere provides Dawn, Day, Dusk and Night, plus Clear, Rain, Fog and Sandstorm. Night and adverse weather reduce guard visibility. Floodlights have measured solid posts; their lighting reach is shared with perception. A player flashlight reveals nearby terrain and makes the player easier to spot. Close contact and sound still matter at night.

Choose quiet ambience, automatic ambience, wind, forest/birds or ocean from Studio’s compressed recordings. Automatic ambience uses wind in the desert or poor weather, birds at a daytime market, and quiet elsewhere. Combat/movement effects include gunshots, impacts, punches, footsteps and body falls. Pickup engines use the recorded engine loop. Playback is bounded, lazy, pause-aware and respects master mute. Audio failures do not stop gameplay.

Choose allowed camera views and the starting view. Players switch among permitted views with V, the camera button or the pause menu. Third person and Close follow start directly behind the character near eye height, with a slight 3° downward tilt. Players can lower the tilt to a fully level view. Orbit and Close follow support horizontal rotation and vertical tilt; fixed Overhead/Isometric views retain their intended elevation. Creators can disable rotation or zoom. Background music comes from the same compressed music library as Studio and loops during active play.

## Story, text and voice

Atmosphere → **Story & dialogue** accepts a Studio JSON or project ZIP and renders it locally into a portable film, or accepts an MP4/WebM. Films are limited to 60 seconds and 24 MiB after rendering. Films play before/after that chapter and are skippable. A missing or unsupported clip cannot permanently block the mission.

Add up to 24 cues triggered by mission start, a time, an objective number, detection, overwatch, reinforcement arrival, objective completion or extraction. Cues support subtitles, captions and comic speech/thought bubbles following the selected character. Text timers pause with the game. Each cue plays once per run; checkpoint retries can replay later cues. Cues can also use any recorded Studio sound effect.

Enable **Voice this line** or **Read opening briefing aloud** for native device speech. Device voices vary. **Generate all speech** prepares selected lines with Studio’s on-device speech engine, record speech directly in Play, or attach an audio recording. Choose from two female and two male generated voices for each line. Prepared speech is stored locally and exported as audio; players do not download speech models. Native speech remains a fallback when a prepared line is unavailable. Generate or attach speech for consistent playback across devices.

Story media is content-addressed and stored in browser-owned IndexedDB so reloading preserves it. It does not grant access to arbitrary files on a device. JSON contains references; attached files travel in an editable project ZIP and in the independent game ZIP. The importer rejects external media URLs, unsupported paths, oversized files and mismatched asset hashes.

## Checkpoints, campaigns and replay

Automatic checkpoints save completed goals, defeated targets, collected supplies, ammunition, grenades, cargo and rewards together. Chain checkpoints retain completed steps. Pickup road checkpoints restore safe parked positions and ordered route progress. Retries consume a life, preserve the run’s accumulated time, and provide three seconds of protection. Active ordnance and partial actions are cleared. Checkpoints Off restarts the mission’s objectives.

Campaigns contain the first mission plus up to four additional chapters. The hero, remaining life budget and strongest unlocked firearm carry forward; chapters can independently choose locations, objectives, casts, atmosphere, music and story. Beginning a chapter restores its configured health/ammunition. Reloading resumes the latest unlocked chapter, with prior chapter scores and weapon unlocks. Restart campaign clears campaign progress.

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

- **Save setup** writes `.ara-play.json` without attachments, or `.ara-play.zip` with local story media. **Open setup** accepts both. It imports character settings separately through Cast.
- **Download game ZIP** includes an independent HTML/JavaScript player, exact generated characters, selected textures, recorded sounds/music and story media. It does not run the character generator or require Ara services.
- `locations.json` contains the selected base map contracts; `staging.json` contains each configured mission’s measured solids, actor starts, objectives, paths, floodlights and extraction area.
- Unzip and serve the folder with a static host or the local HTTP instructions in its README. Browser module/media rules require HTTP rather than opening `index.html` through `file://`.
- Game preparation validates every chapter and its fitted vehicle/aircraft clearance before replacing the current preview. Failure preserves the working game.

LLM Assist’s generated guide enumerates the live capabilities, exact library IDs, custom character schema, media rules and measured maps. Its parser uses the same project and staging rules as manual setup. **Check placements** downloads a per-chapter JSON report with objective coordinates, routes, and specific placement errors. No API key, arbitrary script execution or arbitrary coordinate editor is included.

## Verification and code

`npm run test:play` covers mission migration, navigation, traversal, independent enemy AI, checkpoints, combat, grenades, extraction, progression, campaigns, maps, chains, stealth/melee, specialist roles, aircraft, pursuit, story validation and the LLM contract. `npm run test:play:poses` audits actual generated rigs, supported contacts, upright recovery, hit reactions and bone lengths, including rifle and mounted aim across body sizes. Same-side aircraft approach checks cover every map, four headings, touching occupants, two capsule sizes and reboarding.

The `--boarding-ui` browser check covers shared helicopter approach and persistent mission context across all settings tabs at desktop, phone and landscape sizes. Focused browser checks include `npm run test:play:browser -- --expansion` and `--expansion-export` for the new workflow, film attachment and independent ZIP. Existing `--access`, `--cover`, `--combat`, `--campaign`, `--campaign-export`, `--driving-export`, `--assist` and other flags cover the established gameplay and editor. Chrome checks write ignored screenshots and test downloads to `out/play/`. `ARA_TEST_NATIVE_GPU=1` selects the Mac graphics backend; the default uses SwiftShader.

`runtime.ts` owns fixed-step gameplay. `mission.ts`, `locations.ts`, `staging.ts` and `objectives.ts` own measured staging. `enemy-ai.ts`, `enemy-roles.ts`, `weapons.ts` and `combat.ts` own perception and combat. `driving.ts`, `pursuit.ts`, `air.ts` and their views reuse fitted Ara vehicles. `actor.ts` and combat/traversal/stance performance helpers reuse Ara’s existing rigs and clips. `story.ts`, `story-view.ts`, `media.ts` and `project-bundle.ts` own portable story delivery. `player.ts` is shared by creator preview and the independent game player.
