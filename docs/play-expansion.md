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
- [x] Add optional timed delivery, street race and bounty contracts with measured starts/routes, clear failure and cash rewards. Both are toggled per chapter and included in portable JSON and the playable export.
- [ ] Give desert compound, market street and urban block distinct footprints, authored interiors, opening doors, stairs and roof paths; verify indoor/outdoor combat and traversal on every map. Distinct measured perimeters and street solids are implemented; interiors, stairs and roof routes remain.
- [ ] Add a free-roam city district between chapters, mission markers, civilians, parked cars and escalating one-to-three-star police heat.
- [ ] Add player-drivable motorcycle, sports car and SUV; vehicle damage/smoke, armed/ramming pursuit, and chase/escort objectives. Pickup collision damage, smoke and checkpoint restoration are implemented; new vehicles and chase/escort gameplay remain.
- [ ] Carry cash, purchases, branch choices and story flags across chapters and reloads. Cash, purchases and the safehouse shop are implemented; branch choices, flags and conditional briefings remain.

## Placement audit

- A five-chapter campaign with an urban night vault and hard pickup route exposed buildings placed across the chapter 3 escape lane. The urban annex and shopfront now sit outside that lane. A market stall also blocked the parked pickup in all cover layouts; it has been moved.
- Placement and fitted vehicle errors now identify the failed route or objective, map, layout, variation and obstruction. Check placements includes a whole-campaign validity result, so shared chapter errors cannot appear as a clean report.
- Regression checks cover the urban chapter, all 108 district pickup lanes, fitted hard courses, pursuit bays, side jobs, objective chains, exports and LLM Assist.
