# Ara Play expansion

This roadmap tracks the requested gameplay expansion. Assets and performances come from Ara's existing character and Studio systems; gameplay, navigation, resource rules and portable exports must be verified separately.

Every milestone includes editor controls, strict portable JSON, LLM Assist documentation, saved setup migration, independent game exports and relevant gameplay/pose/browser checks. Existing games keep their current behaviour when new optional settings are omitted.

## 1. Combat, locations and atmosphere

- [x] Shared pistol/rifle weapon rules, character performances and portable weapon variants.
- [x] Riflemen, elevated snipers, heavy suppressors and squad leaders with morale effects.
- [x] Studio-library combat, movement and ambient sound with bounded playback.
- [x] Measured desert compound, market street and urban block maps with safe actors, cover, objectives, vehicle lanes and support anchors.
- [x] Dawn, day, dusk and night; rain, fog and sandstorm; flashlights and floodlights affecting perception.

## 2. Written missions and replay

- [x] Automatically staged, ordered reach/download/defend/eliminate/survive/escort objectives.
- [x] Hold-to-download interaction, defensive timers, named targets and bounded reinforcement waves.
- [x] Melee, silent rear takedowns, noise investigation and discovered bodies.
- [x] Difficulty presets, no-alarm/no-damage/par-time medals, chapter rewards and persistent weapon unlocks.
- [x] Twelve meaningful arrangements per location, validated through the same navigation contracts.

## 3. Vehicles and air support

- [x] Collision-checked enemy pickup pursuit using real fitted drivers and measured routes.
- [x] Aiming and firing from a moving pickup with supported mounted performances.
- [x] A waiting helicopter, fitted boarding/alighting and automatic extraction for player and companion.
- [x] Helicopter observation support with an actual aircraft, spotlight and radio reports.

## 4. Story delivery

- [x] Short imported Studio-film openings and endings, with skip/pause and reliable failure recovery.
- [x] Voiced briefings and event/step-triggered radio lines, plus optional prepared/uploaded audio.
- [x] Timed subtitles, captions and actor speech/thought text.
- [x] Reload-safe local media, portable editable project bundles and self-contained playable exports.

## Completion checks

A feature is complete only when it can be configured, validated, played and exported. Character poses must retain bone lengths and supported hand/seat contacts. Navigation must use rendered solid geometry; enemies and vehicles cannot bypass it. Night visibility and cover must affect the same sight and shot tests used by the runtime. Objective and campaign retries must restore resources and rewards atomically. Audio and media failures must not stop gameplay. LLM Assist must advertise implemented capabilities only.

## Boarding and settings follow-up

- Shared helicopter entry now routes each occupant around the fuselage to their own fitted door, with capsule separation and an allowance based on route length. Same-side and touching parties, four aircraft headings, two capsule sizes, all five maps, blocked doors and repeat boarding are covered by `scripts/play-boarding-access-check.ts`.
- Aircraft entry, flight and exit hide the firearm prop, while mixed-size guest cabin fitting preserves skeleton proportions and exact upright alighting anchors.
- The mission sequence and Add mission action are outside the scrolling settings. Every section retains its current mission title, index and section label. Hero and life budget controls are labelled as shared. Chrome checks cover desktop, 320/390 px phones and landscape.
- The production build passes. All 605 output files are below Cloudflare's 25 MiB per-file limit; the largest is 14.16 MiB. Desktop/touch combat, shared boarding, persistent mission context and independent media exports have passed browser checks.

## Next gameplay expansion

The next release grows Play from staged chapters into a connected district. Keep the same strict JSON, editable bundles, independent exports and browser checks for every addition.

- [x] Let opening and ending scenes start from Ara Studio JSON or a Studio project bundle. Render locally to portable film media. Add microphone recording and female/male generated voice choices per dialogue line.
- [x] Keep equipped guns visible on defeated enemies. Spread chained objectives and check routes again after placing terminals.
- [x] Name the chapter, objective, layout and variation in placement errors; provide a downloadable per-chapter **Check placements** JSON report.
- [x] Add optional timed delivery, street race and bounty contracts with measured starts/routes, clear failure and cash rewards. All three are toggled per chapter and included in portable JSON and the playable export. Delivery now needs a parcel handoff; bounty needs a return to the contact for payment.
- [x] Give desert compound, market street and urban block distinct footprints, enterable rooms, automatic doors, stairs and roof paths. The urban block also has a suspended upper room with a walkable lower room and floor that blocks sight and shots between levels.
- [x] Add a free-roam city district between chapters, mission markers, walking civilians, parked cars and escalating one-to-three-star police heat. The mission marker launches the next chapter when the player stops a car and loses police heat.
- [x] Add player-drivable motorcycle, sports car and SUV; vehicle damage/smoke, armed pursuit, and chase/escort objectives. The moving chase target loops through a district vehicle lane; convoy driving pauses if the player falls behind. Pursuit driver ramming behaviour remains a further improvement.
- [x] Carry cash, purchases, branch choices and story flags across chapters and reloads. Chapters can choose a later chapter, set a flag and change a later briefing; the safehouse shop remains between playable chapters.
- [x] Cap download interactions at 15 seconds, widen defend areas to a visible 10-metre radius, and bring armed backup assaults into defend objectives. Defend time still follows the configured objective duration and can include one to three assaults.
- [ ] Expand side jobs with separate characters, vehicles, routes and consequences so they feel like activities in the district instead of optional marker runs. Delivery has a courier handoff and visible backpack; races now use a longer course, countdown and visible AI rival. Dedicated side job characters and lasting consequences remain.

## Arcade modes

Race and runner games reuse the cast, vehicles, audio, music, chapters, cash and exports, with their own rules, cameras, HUDs and level generation.

- [x] A top-level `mode` of `mission`, `race` or `runner`, with strict `race` and `runner` JSON, chapter overrides, editor controls, LLM Assist guidance and examples, saved setups and independent exports.
- [x] The feel of speed: a lens that widens with speed, impact shake, speed lines and a soft edge blur, boost flashes, dust, sparks and drift smoke, slow motion on near misses, engine pitch across each car's speed range, synthesised coin, boost, crash, whoosh and countdown sounds, and music that builds with pace.
- [x] Arcade input: swipes, one-thumb steering with automatic throttle, optional tilt steering, touch buttons, and the existing keyboard and gamepad.
- [x] A one-tap retry that resets the rules in place, local best times and scores, and daily challenges for both modes.
- [x] Fixed-step rules, batched drawing of repeated objects, reusable course pieces, coins and obstacles, runner pieces generated ahead and dropped behind, a world origin that follows long runs, and hidden distant drivers.
- [x] Arcade racing: four built-in circuits and custom JSON circuits with walls, ramps, a shortcut and themed scenery; countdown, laps, sector splits and wrong-way detection; three to seven AI racers on a racing line with rubber-banding and skill levels; drift boosts, nitro, wall bounces and respawn; position, speedometer, minimap and podium; boost pads, item boxes and hazards; best-lap ghosts shared as links; cups with points, cash, a garage of four cars and paint.
- [x] Endless runner: themed courses of straights, corners, junctions and gaps with rising difficulty; three lanes with lane changes, jumps, slides and turns; new slide, turning lean and stumble-recovery clips; low barriers, overhead bars, gaps, blockers and moving carts; coins, magnet, shield, boost and multiplier; a chaser after stumbles; scoring with multipliers, coin revives, missions, upgrades and unlockable runners.
- [ ] Online leaderboards need a hosted service; records and daily challenges are kept in each browser.
- [ ] Compressed textures and distance detail levels for scenery meshes.

## Recent gameplay and presentation fixes

- LLM Assist and imported Play JSON generate missing voiced dialogue using the selected male or female voice; existing recorded audio stays intact.
- Branch selection shows destination chapters as selectable cards. Health pickups clear blood stains, and the pistol pickup uses a blended animation. The safehouse now sells a health upgrade without a vest visual.
- Vehicle checkpoints save a safe stand position and retries move the player out of any car hull. The pickup's base driving speeds are 20/29/40 m/s by pace, with 14 m/s reverse, quicker acceleration and stronger braking; other vehicle models retain their fitted speed multipliers.

## City configuration and repair pass

- Game setup and portable JSON now configure city length, pedestrian count, parked vehicle count, police heat, repair and gun shops, pedestrian fights, weapon switching, and driving radio with a country code. The default vast district is 300 m wide by 600 m long. The two smaller choices use the same 1:2 width-to-length ratio.
- Two low-detail Ara characters in distinct T-shirts populate clear, fixed sidewalks by default. Officers use the Ara Nigeria Police uniform. A repair marker charges $100 for a damaged vehicle; a pawn marker sells the next unlocked firearm or ammunition. Optional street fights pay $25 once per pedestrian and raise police heat. Number keys 1–3 holster, equip a pistol or equip a rifle when available.
- The vehicle view now captures its model at construction, so taking a parked motorcycle keeps the motorcycle when boarding and driving. A stopped motorcycle can enter a street race at its start marker. Races show a prominent win or loss result.
- The optional radio requests current country codes and top working stations from Radio Browser when enabled. It streams only while driving, has a Next station control, and stops on exit or pause. Internet and a playable station stream are required. Radio Browser's [API reference](https://docs.radio-browser.info/) defines the station search, country codes and station click endpoint.
- Retry checks every parked vehicle hull and keeps the hub gate open. Landing clears capsule overlap at platform edges. The renderer caps pixel ratio and shadow resolution, city buildings use simpler meshes, and static collision and occlusion data are reused instead of rebuilt each frame.

## Latest city controls

- A parked motorcycle can be boarded again from either clear side. Its handlebar stays fixed to the bike when the rider aims. The marker names the motorcycle. Press **J** while driving to switch radio stations.
- Repair and gun shops are labelled, walkable buildings with doors that open on approach and close after departure. Their purchase markers sit inside the shops.
- Pedestrian hostility can be peaceful, retaliatory, mixed at random, or hostile. Street fights now take more than one hit; pedestrians can pursue and punch back. The fight-for-cash option still controls whether peaceful pedestrians can be attacked.
- LLM Assist has a **Generate missing dialogue audio during preview** checkbox beside the pasted JSON controls. Turning it off keeps recorded audio and uses device speech for missing lines.
- `npm run test:play` runs the focused gameplay checks; `npm run test:play:full` retains the exhaustive map and campaign matrix. The focused command uses `node --import tsx` so it runs without the `tsx` IPC server.

## Placement audit

- A five-chapter campaign with an urban night vault and hard pickup route exposed buildings placed across the chapter 3 escape lane. The urban annex and shopfront now sit outside that lane. A market stall also blocked the parked pickup in all cover layouts; it has been moved.
- Placement and fitted vehicle errors now identify the failed route or objective, map, layout, variation and obstruction. Check placements includes a whole-campaign validity result, so shared chapter errors cannot appear as a clean report.
- Regression checks cover the urban chapter, all 108 district pickup lanes, fitted hard courses, pursuit bays, side jobs, objective chains, exports and LLM Assist.
