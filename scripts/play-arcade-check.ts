/** Arcade race and endless runner contracts: settings, rules, generation, records and portable JSON. */
import assert from 'node:assert/strict';
import { nodeLibrary } from './node-assets';
import { castsCompanion, chapterProject, chapterSettings, defaultProject, parseProject, posesOf } from '../src/play/project';
import { skyLook } from '../src/play/arcade/weather';
import { parsePlayInput, raceExample, runnerExample, generatePlayGuide, describeGame } from '../src/play/assist';
import { type RunnerSettings, RUNNER_THEMES, RUNNER_THEME_NAMES, defaultRace, defaultRunner, gameTitle, isAutomaticTitle, parseRace, parseRunner, retitle, runnerGoalLabel, runnerMedalTargets } from '../src/play/arcade/modes';
import { DEFAULT_RUNNER_MEDALS, raceMedal, runnerMedal } from '../src/play/arcade/medals';
import { RUNNER_GENERIC_ICONS, RUNNER_OBJECT_TYPES } from '../src/play/arcade/objects';
import { ICONS } from '../src/play/arcade/icons';
import { TRACK_GROUNDS, TRACK_IDS, TRACK_TEMPLATES, buildTrack, locate, parseTrack, trackPoint, trackTemplate } from '../src/play/arcade/track';
import { RUNNER_KITS } from '../src/play/arcade/runner-kits';
import { CAR_STATS, RaceGame, idleInput } from '../src/play/arcade/race';
import { LANE, RunnerGame, TRAIN_CAR, missionSet } from '../src/play/arcade/runner';
import { decodeGhost, encodeGhost } from '../src/play/arcade/records';
import { clipById } from '../src/core/anim/clips';

const lib = await nodeLibrary(), cat = lib.catalog;let checks = 0;
function check(name: string, fn: () => void) { fn();checks++;console.log('OK', name); }
const names = { player: 'You', drivers: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] };
/** The AI controller drives the player car too, so whole races run without a person. */
function runRace(game: RaceGame, seconds = 400) {
  const auto = (game as unknown as { aiInput: (c: unknown) => ReturnType<typeof idleInput> }).aiInput.bind(game), events: string[] = [];let maxOff = 0;
  for (let i = 0; i < seconds * 60 && game.cars.some((c) => c.finished === undefined); i++) {
    game.update(1 / 60, game.status !== 'countdown' ? { ...auto(game.player), item: false } : idleInput());
    for (const e of game.drain()) events.push(e.type);
    for (const c of game.cars) { const p = locate(game.track, c.x, c.z, c.hint);if (!p.onShortcut) maxOff = Math.max(maxOff, Math.abs(p.lateral) - game.track.width / 2 - game.track.ground.verge); }
  }
  return { events, maxOff };
}
/** A simple bot reads the next obstacles and answers each with a lane change, jump, slide or turn. */
function botInput(g: RunnerGame) {
  const s = g.current, input = { left: false, right: false, jump: false, slide: false }, v = g.speed;
  for (const t of s.things.filter((t) => !t.hit && t.d + t.length > g.d - 0.3).sort((a, b) => a.d - b.d).slice(0, 2)) {
    const dist = t.d - g.d, mine = t.lanes & (1 << (g.lane + 1));
    if ((t.kind === 'blocker' || t.kind === 'cart') && mine && dist < v * 0.9 + 3) { const free = [-1, 0, 1].filter((l) => !(t.lanes & (1 << (l + 1)))).sort((a, b) => Math.abs(a - g.lane) - Math.abs(b - g.lane))[0];if (free > g.lane) input.left = true;else if (free < g.lane) input.right = true;break; }
    if (((t.kind === 'barrier-low' && mine) || t.kind === 'gap') && dist < v * 0.2 + 0.8 && dist > 0 && g.grounded) { input.jump = true;break; }
    if (t.kind === 'bar-high' && dist < v * 0.25 + 0.6 && dist > 0 && g.sliding <= 0.1 && g.grounded) { input.slide = true;break; }
  }
  if (s.length - g.d < 6 && !g.queuedTurn && !input.left && !input.right) { if (s.end === 'left' || s.end === 'junction') input.left = true;else input.right = true; }
  return input;
}
/** Run the 3.6 s countdown in small steps, as the player does. */
const countdown = (g: RaceGame) => { while (g.status === 'countdown') g.update(1 / 60, idleInput()); };
const profile = () => ({ upgrades: {}, missionLevel: 0, missions: [0, 0, 0], bank: 0 });

check('modes default to missions and arcade settings are strict', () => {
  const p = parseProject(JSON.stringify(defaultProject()), cat);assert.equal(p.mode, undefined);
  for (const bad of [{ laps: 0 }, { laps: 10 }, { opponents: 2 }, { opponents: 8 }, { aiSkill: 'pro' }, { pickups: ['boost-pad', 'boost-pad'] }, { car: { model: 'tank' } }, { car: { color: 'red' } }, { surprise: true }, { track: 'moon-base' }]) assert.throws(() => parseRace(bad));
  for (const bad of [{ lanes: 4 }, { startSpeed: 30, maxSpeed: 20 }, { obstacles: [] }, { chaser: 'nobody' }, { goal: { type: 'distance' } }, { goal: { type: 'endless', target: 5 } }, { theme: 'moon' }, { seed: -1 }]) assert.throws(() => parseRunner(bad, ['enemy-1']));
  assert.deepEqual(parseRace(undefined), defaultRace());assert.deepEqual(parseRunner(undefined, ['enemy-1']), defaultRunner());
  const mission = defaultProject() as unknown as Record<string, unknown>;mission.race = {};assert.throws(() => parseProject(JSON.stringify(mission), cat), /need mode/);
});
check('race and runner games round-trip through portable JSON, chapters and LLM Assist', () => {
  const race = parsePlayInput(JSON.stringify(raceExample()), cat);assert.equal(race.mode, 'race');assert.equal(race.chapters!.length, 2);
  assert.equal(chapterProject(race, 2).race!.track, 'harbour-sprint');assert.equal(chapterProject(race, 1).mode, 'race');assert.equal(chapterSettings(race, 'x').mode, 'race');
  assert.deepEqual(parseProject(JSON.stringify(race), cat), race);
  const runner = parsePlayInput(JSON.stringify(runnerExample()), cat);assert.equal(runner.mode, 'runner');assert.equal(runner.runner!.chaser, runner.enemies[0].id);
  assert.match(describeGame(race).facts[0], /Arcade race/);assert.match(describeGame(runner).facts[0], /Endless runner/);
  const guide = generatePlayGuide(cat, 'A street racing cup');for (const term of ['GAME MODES', ...TRACK_IDS, 'temple-ruins', 'bar-high', 'rubberBand', 'RACE CUP EXAMPLE']) assert.ok(guide.includes(term), term);
  const chapter = raceExample() as unknown as { chapters: Record<string, unknown>[] };chapter.chapters[0].mode = 'runner';delete chapter.chapters[0].race;
  // Campaigns mix modes: a runner stage and a mission between races, each keeping only its own mode's settings.
  const mixed = parsePlayInput(JSON.stringify(chapter), cat);assert.equal(chapterProject(mixed, 1).mode, 'runner');assert.ok(chapterProject(mixed, 1).runner);assert.equal(chapterProject(mixed, 1).race, undefined);assert.equal(chapterProject(mixed, 2).mode, 'race');
  chapter.chapters[0].mode = 'mission';const withMission = parsePlayInput(JSON.stringify(chapter), cat);assert.equal(chapterProject(withMission, 1).mode, undefined);assert.equal(chapterProject(withMission, 1).race, undefined);assert.deepEqual(parseProject(JSON.stringify(withMission), cat), withMission);
  chapter.chapters[0].race = {};assert.throws(() => parsePlayInput(JSON.stringify(chapter), cat), /need mode/);
});
check('race and runner chapters never stage mission cargo inherited from the first chapter', () => {
  // A depot package fits the first mission by day; the chapter's night lighting props block it, which only matters if the race is staged as a mission.
  const race = raceExample() as unknown as Record<string, any>, riders = Array.from({ length: 5 }, (_, i) => ({ ...race.enemies[0], id: `rider-${i + 1}` }));
  const game = { ...race, mode: 'mission', race: undefined, mission: { story: 'escape', extraction: 'pickup', location: 'depot', layout: 'balanced', variation: 0, cargo: 'package' }, chapters: [{ id: 'night-ride', mode: 'race', identity: { title: 'Night Ride', briefing: '' }, enemies: riders, race: race.race, mission: { environment: { time: 'night', weather: 'clear' } } }] };
  const p = parsePlayInput(JSON.stringify(game), cat);assert.equal(chapterProject(p, 1).mode, 'race');
  const asMission = { ...game, chapters: [{ ...game.chapters[0], mode: 'mission', race: undefined }] };
  assert.throws(() => parsePlayInput(JSON.stringify(asMission), cat), /night-ride › cargo \(package\).*inherited from chapter-1 › mission\.cargo/);
});
check('runner enemies stand in one lane, fall to a shot down that lane, and fire once if left standing', () => {
  const settings = { ...defaultRunner(), obstacles: ['gunman'] as RunnerSettings['obstacles'], powerUps: [] as RunnerSettings['powerUps'], chaser: 'none' };
  // Shooting whenever an enemy stands in the runner's lane clears them all without a stumble.
  const shooter = new RunnerGame(settings, profile(), 11);shooter.start();assert.equal(shooter.armed, true);
  for (let i = 0; i < 60 * 40 && shooter.status === 'running'; i++) { const ahead = shooter.current.things.some((t) => t.kind === 'gunman' && !t.hit && t.lanes & (1 << (shooter.lane + 1)) && t.d > shooter.d && t.d - shooter.d < 30);shooter.update(1 / 60, { ...botInput(shooter), shoot: ahead && i % 4 === 0 }); }
  const shooterEvents = shooter.drain().map((e) => e.type);
  assert.ok(shooter.stats.enemies >= 5, `enemies shot: ${shooter.stats.enemies}`);assert.equal(shooterEvents.includes('enemy-fire'), false, 'no enemy got a shot off');assert.equal(shooter.status, 'running');
  // Never shooting and staying in lane: the enemy fires first, then the runner runs into it.
  const idle = new RunnerGame(settings, profile(), 11);idle.start();const events: string[] = [];
  for (let i = 0; i < 60 * 40 && idle.status === 'running'; i++) { idle.update(1 / 60, { left: false, right: false, jump: false, slide: false });events.push(...idle.drain().map((e) => e.type)); }
  assert.ok(events.includes('enemy-fire') && events.includes('stumble'), events.join(','));assert.equal(idle.downReason, 'crash');
  assert.equal(new RunnerGame({ ...settings, obstacles: ['blocker'] }, profile(), 11).armed, false, 'runs without enemies have no gun');
});
check('built-in circuits satisfy the custom circuit rules and custom loops are validated', () => {
  for (const t of TRACK_TEMPLATES) { parseTrack({ points: t.points, width: t.width });const track = buildTrack(t);assert.ok(track.length > 600 && track.length < 1600, t.id);const p = trackPoint(track, 200, 2.5), at = locate(track, p.x, p.z);assert.ok(Math.abs(at.s - 200) < 2.5 && Math.abs(at.lateral - 2.5) < 0.2, t.id); }
  assert.throws(() => parseTrack({ points: [[0, 0], [200, 200], [200, 0], [0, 200], [-50, 100], [-60, 20]] }), /crosses|tighter/);
  assert.throws(() => parseTrack({ points: [[0, 0], [10, 0], [10, 10], [0, 10], [-5, 5], [-3, 2]] }), /long|tighter/);
  const oval = parseTrack({ name: 'Oval', theme: 'forest', width: 16, points: [[0, 0], [0, 200], [60, 260], [140, 260], [200, 200], [200, 0], [140, -60], [60, -60]] });assert.equal(typeof oval, 'object');
});
check('every AI field finishes on every circuit and walls keep cars on the road', () => {
  for (const track of TRACK_IDS) {
    const game = new RaceGame({ ...defaultRace(), track, laps: 2, pickups: ['boost-pad', 'item-box', 'hazard'] }, names, 3), r = runRace(game);
    assert.equal(game.status, 'finished', track);assert.equal(game.cars.filter((c) => c.finished === undefined).map((c) => c.id).join(), '', `${track}: every car finishes`);
    assert.ok(r.maxOff < 1.2, `${track} left the road by ${r.maxOff.toFixed(2)} m`);for (const e of ['beep', 'go', 'lap', 'sector', 'finish']) assert.ok(r.events.includes(e), `${track} ${e}`);
    assert.equal(game.result!.position, game.position(game.player));assert.ok(game.player.lapTimes.length === 2 && game.bestGhost!.length > 100);
  }
});
check('races are deterministic, rubber-banding keeps the pack close and ghosts replay the best lap', () => {
  const a = new RaceGame(defaultRace(), names, 9), b = new RaceGame(defaultRace(), names, 9);runRace(a);runRace(b);
  assert.deepEqual(a.cars.map((c) => c.finished), b.cars.map((c) => c.finished));
  const banded = new RaceGame({ ...defaultRace(), rubberBand: true }, names, 4), loose = new RaceGame({ ...defaultRace(), rubberBand: false }, names, 4);
  for (const g of [banded, loose]) { for (let i = 0; i < 60 * 40; i++) g.update(1 / 60, g.status === 'racing' ? { ...idleInput(), throttle: 0.55, steer: (g as unknown as { aiInput: (c: unknown) => { steer: number } }).aiInput(g.player).steer } : idleInput()); }
  const spread = (g: RaceGame) => Math.max(...g.cars.map((c) => c.best)) - g.player.best;assert.ok(spread(banded) < spread(loose), `${spread(banded)} vs ${spread(loose)}`);
  const ghost = new RaceGame(defaultRace(), names, 9, { lap: a.bestLap!, frames: a.bestGhost! });countdown(ghost);for (let i = 0; i < 600; i++) ghost.update(1 / 60, { ...idleInput(), throttle: 1 });assert.ok(ghost.ghostPose(), 'ghost visible during the lap');
  const code = encodeGhost(a.bestLap!, a.bestGhost!), back = decodeGhost(code)!;assert.ok(code.length < 4000, `ghost link ${code.length} characters`);
  assert.ok(Math.abs(back.lap - a.bestLap!) < 0.002);for (const [i, f] of back.frames.entries()) assert.ok(Math.hypot(f.x - a.bestGhost![i].x, f.z - a.bestGhost![i].z) < 0.08);
  assert.equal(decodeGhost('not-a-ghost'), undefined);
});
check('cars bounce off walls instead of wrecking, respawn when stuck and warn when driving the wrong way', () => {
  const g = new RaceGame({ ...defaultRace(), opponents: 3 }, names, 2);countdown(g);
  const p = g.player;p.yaw += Math.PI / 2;let walls = 0;for (let i = 0; i < 240; i++) { g.update(1 / 60, { ...idleInput(), throttle: 1 });walls += g.drain().filter((e) => e.type === 'wall').length; }
  assert.ok(walls > 0 && Math.abs(locate(g.track, p.x, p.z).lateral) < g.track.width / 2 + 0.5 && p.speed >= 0);
  p.yaw += Math.PI;p.vx = p.vz = 0;for (let i = 0; i < 180; i++) g.update(1 / 60, { ...idleInput(), throttle: 1 });assert.ok(p.wrongWay > 0.8 || g.drain().some((e) => e.type === 'respawn'));
  g.update(1 / 60, { ...idleInput(), respawn: true });assert.ok(g.drain().some((e) => e.type === 'respawn') && p.respawning > 0);
  assert.ok(Object.values(CAR_STATS).every((s) => s.top >= 40 && s.grip > 6));
});
check('runner courses always leave a way through, recycle pieces and move the world back to the origin', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const g = new RunnerGame({ ...defaultRunner(), speedRamp: 'steep', chaser: 'none' }, profile(), seed);g.start();let pieces = 0, rebases = 0;
    for (let i = 0; i < 120 * 160 && g.status === 'running'; i++) {
      g.update(1 / 120, botInput(g));rebases += g.drain().filter((e) => e.type === 'rebase').length;pieces = Math.max(pieces, g.segments.length + g.branches.length);
      for (const s of [...g.segments, ...g.branches]) for (const t of s.things) if (t.kind === 'blocker' || t.kind === 'cart') assert.notEqual(t.lanes, 0b111, 'a blocker row leaves a free lane');
      const p = g.position;assert.ok(Math.abs(p.x) < 700 && Math.abs(p.z) < 700, 'origin follows the runner');
    }
    assert.ok(g.distance > 1500, `seed ${seed} ran ${g.distance.toFixed(0)} m (${g.status} ${g.downReason})`);assert.ok(pieces <= 9, 'course pieces are recycled');
  }
});
check('stumbles bring the chaser, two close together end the run, shields and revives save it', () => {
  const g = new RunnerGame({ ...defaultRunner(), chaser: 'enemy-1' }, profile(), 3);g.start();
  const stumble = () => (g as unknown as { stumble(): void }).stumble();stumble();assert.equal(g.status, 'running');assert.ok(g.chaser < 3);stumble();assert.equal(g.status, 'down');assert.equal(g.downReason, 'caught');
  assert.equal(g.canRevive(99), false);assert.ok(g.canRevive(100));assert.equal(g.revive(), 100);assert.equal(g.status, 'running');assert.ok(g.power.shield > 0);assert.equal(g.reviveCost(), 200);
  const crash = (g as unknown as { down(r: string): void });g.power.shield = 0;crash.down('crash');g.end();assert.equal(g.status, 'over');
  const h = new RunnerGame({ ...defaultRunner(), goal: { type: 'coins', target: 10 } }, profile(), 5);h.start();
  for (let i = 0; i < 120 * 120 && !h.goalReached && h.status === 'running'; i++) h.update(1 / 120, botInput(h));assert.ok(h.goalReached, 'coin goal reached');
  assert.equal(missionSet(0).length, 3);assert.ok(missionSet(4)[0].kind === missionSet(0)[0].kind && missionSet(4)[0].target > missionSet(0)[0].target);
});
check('runner obstacles demand the right move: jump low barriers, slide under bars, change lane around blockers', () => {
  const g = new RunnerGame({ ...defaultRunner(), chaser: 'none', obstacles: ['bar-high'] }, profile(), 11);g.start();
  for (let i = 0; i < 120 * 30 && g.status === 'running'; i++) g.update(1 / 120, { ...botInput(g), slide: false });assert.ok(g.stumbles > 0, 'running into a bar trips the runner');
  assert.equal(LANE, 1.8);for (const id of ['run_slide', 'run_lean_left', 'run_lean_right', 'stumble_recover']) assert.ok(clipById.get(id), id);
});
check('runner objects parse strictly, keep their names, icons, counts and clues, and need entries for the objects goal', () => {
  const r = parseRunner({ goal: { type: 'objects' }, objects: [{ type: 'dossier', name: "The Minister's dossier", icon: 'fingerprint', clue: 'Signed in red ink.' }, { type: 'dagger', count: 3 }] }, ['enemy-1']);
  assert.deepEqual(r.objects, [{ type: 'dossier', name: "The Minister's dossier", icon: 'fingerprint', count: 1, clue: 'Signed in red ink.' }, { type: 'dagger', name: 'Ancient dagger', icon: 'dagger', count: 3 }]);
  assert.equal(runnerGoalLabel(r), 'Find 4 objects');assert.equal(runnerGoalLabel({ goal: { type: 'objects' }, objects: [r.objects![1]] }), 'Find the ancient dagger ×3');
  assert.equal(parseRunner({ objects: [] }, ['enemy-1']).objects, undefined);
  for (const bad of [{ goal: { type: 'objects' } }, { goal: { type: 'objects', target: 2 }, objects: [{ type: 'gem' }] }, { objects: [{ type: 'laptop' }] }, { objects: [{ type: 'gem', name: '' }] }, { objects: [{ type: 'gem', name: 'x'.repeat(41) }] }, { objects: [{ type: 'gem', count: 0 }] }, { objects: [{ type: 'gem', count: 11 }] }, { objects: [{ type: 'gem', icon: 'rocket' }] }, { objects: [{ type: 'gem', clue: 'x'.repeat(161) }] }, { objects: [{ type: 'gem', colour: 'red' }] }, { objects: Array.from({ length: 9 }, () => ({ type: 'gem' })) }]) assert.throws(() => parseRunner(bad, ['enemy-1']), Error, JSON.stringify(bad));
  for (const icon of [...RUNNER_OBJECT_TYPES, ...RUNNER_GENERIC_ICONS]) assert.ok(ICONS[icon], `icon ${icon}`);
});
check('runner objects appear one at a time in clear lanes, in list order, return when missed and complete the objects goal', () => {
  const objects = [{ type: 'dossier' as const, name: 'Dossier', icon: 'dossier' as const, count: 1 }, { type: 'dagger' as const, name: 'Ancient dagger', icon: 'dagger' as const, count: 2 }, { type: 'chest' as const, name: 'Treasure box', icon: 'chest' as const, count: 1 }];
  for (const seed of [2, 9, 21]) {
    const g = new RunnerGame({ ...defaultRunner(), chaser: 'none', goal: { type: 'objects' }, objects }, profile(), seed);g.start();
    const order: number[] = [];let placed = 0, last: unknown;
    for (let i = 0; i < 120 * 240 && !g.goalReached && g.status === 'running'; i++) {
      const input = botInput(g), f = g.liveFind;
      // Head for the object's lane once the way is clear, as a player would.
      if (f && !input.left && !input.right && !input.jump && !input.slide && g.current.finds.includes(f) && f.d - g.d < 30 && f.lane !== g.lane) { if (f.lane > g.lane) input.left = true;else input.right = true; }
      g.update(1 / 120, input);
      if (g.liveFind && g.liveFind !== last) {
        placed++;const live = g.liveFind, s = [...g.segments].find((x) => x.finds.includes(live))!;assert.ok(s, 'the object sits on the path ahead, never on a junction branch');
        assert.equal(g.segments.concat(g.branches).flatMap((x) => x.finds).filter((x) => !x.taken).length, 1, 'one object at a time');
        assert.ok(!s.things.some((t) => t.lanes & (1 << (live.lane + 1)) && (t.kind === 'cart' || (live.d > t.d - 3 && live.d < t.d + t.length + 3))), 'no obstacle in the object lane');
        assert.ok(!s.gaps.some(([a, b]) => live.d > a - 2 && live.d < b + 2), 'not over a gap');
      }
      last = g.liveFind;
      for (const e of g.drain()) if (e.type === 'find') order.push(e.item);
    }
    assert.ok(g.goalReached, `seed ${seed}: every object found (${g.found} after ${g.distance.toFixed(0)} m, ${g.status} ${g.downReason})`);
    assert.deepEqual(order, [0, 1, 1, 2], 'objects come in list order');assert.ok(g.allFound());assert.ok(placed >= 4);
  }
  // A runner who never reaches for them sees each missed object return further on.
  const h = new RunnerGame({ ...defaultRunner(), chaser: 'none', objects: [{ type: 'gem', name: 'Gem', icon: 'gem', count: 1 }] }, profile(), 4);h.start();let appearances = 0, seen: unknown;
  for (let i = 0; i < 120 * 90 && h.status === 'running' && !h.allFound(); i++) { const input = botInput(h), f = h.liveFind;
    if (f && h.current.finds.includes(f) && !input.left && !input.right && f.lane === h.lane && f.d - h.d < 12) { const side = [h.lane + 1, h.lane - 1].find((l) => Math.abs(l) <= 1 && !h.current.things.some((t) => !t.hit && t.lanes & (1 << (l + 1)) && t.d + t.length > h.d - 1 && t.d < f.d + 3));if (side !== undefined) { if (side > h.lane) input.left = true;else input.right = true; } }
    h.update(1 / 120, input);if (h.liveFind && h.liveFind !== seen) appearances++;seen = h.liveFind; }
  assert.ok(appearances >= 3, `a missed object returns (${appearances} appearances)`);
  // Objects never change the course itself.
  const plain = new RunnerGame({ ...defaultRunner(), chaser: 'none' }, profile(), 7), withObjects = new RunnerGame({ ...defaultRunner(), chaser: 'none', objects }, profile(), 7);
  for (const k of [plain, withObjects]) { k.start();for (let i = 0; i < 120 * 20 && k.status === 'running'; i++) k.update(1 / 120, botInput(k)); }
  assert.deepEqual(withObjects.segments.map((x) => x.things.map((t) => [t.kind, t.d, t.lanes])), plain.segments.map((x) => x.things.map((t) => [t.kind, t.d, t.lanes])));
});
check('medals follow podium places and score targets, and character moments are shared settings', () => {
  assert.deepEqual([1, 2, 3, 4].map(raceMedal), [3, 2, 1, 0]);
  const t = { bronze: 100, silver: 200, gold: 300 };assert.deepEqual([99, 100, 250, 300].map((n) => runnerMedal(n, t)), [0, 1, 2, 3]);assert.equal(runnerMedal(999, t, false), 0, 'a stage goal comes first');
  assert.deepEqual(parseRunner({ medals: t }, ['enemy-1']).medals, t);assert.equal(parseRunner({ medals: false }, ['enemy-1']).medals, false);assert.equal(runnerMedalTargets(defaultRunner()), DEFAULT_RUNNER_MEDALS);
  for (const bad of [{ medals: { bronze: 300, silver: 200, gold: 400 } }, { medals: { bronze: 0 } }, { medals: true }, { medals: { platinum: 1 } }]) assert.throws(() => parseRunner(bad, ['enemy-1']), Error, JSON.stringify(bad));
  assert.equal(parseRace({ medals: false }).medals, false);assert.equal(parseRace({ medals: true }).medals, undefined);assert.throws(() => parseRace({ medals: 'gold' }));
  assert.equal(parseRunner({ theme: 'market-street' }, ['enemy-1']).theme, 'market-street');assert.ok(clipById.get('look_around') && clipById.get('dance_groove'));
  const base = defaultProject() as unknown as Record<string, unknown>;
  assert.deepEqual(posesOf(parseProject(JSON.stringify(base), cat)), { lookAround: true, dance: true });
  assert.deepEqual(parseProject(JSON.stringify({ ...base, poses: { dance: false } }), cat).poses, { lookAround: true, dance: false });
  for (const bad of [{ dance: 'yes' }, { wave: true }, []]) assert.throws(() => parseProject(JSON.stringify({ ...base, poses: bad }), cat));
});
check('race and runner games ignore companion boarding and read the chapter atmosphere', () => {
  const base = { ...defaultProject(), mission: { ...defaultProject().mission, story: 'rescue' as const, extraction: 'pickup' as const }, vehicle: { color: '#aa3322', pace: 'standard' as const, model: 'danfo' as const } };
  assert.throws(() => parseProject(JSON.stringify(base), cat), /Companion boarding/);
  for (const mode of ['race', 'runner'] as const) {
    const p = parseProject(JSON.stringify({ ...base, mode, ...(mode === 'race' ? { race: defaultRace() } : { runner: defaultRunner() }) }), cat);
    assert.equal(castsCompanion(p), false, mode);
  }
  assert.equal(castsCompanion(parseProject(JSON.stringify({ ...base, vehicle: { color: '#aa3322', pace: 'standard' } }), cat)), true);
  const theme = { sky: '#aebfca', fog: [90, 420] as [number, number] }, day = skyLook(theme), night = skyLook(theme, { time: 'night', weather: 'clear' }), rain = skyLook(theme, { time: 'day', weather: 'rain' }), fog = skyLook(theme, { time: 'dusk', weather: 'fog' });
  assert.equal(day.lamps, 0);assert.equal(day.wet, false);assert.deepEqual(day.fog, [90, 420]);
  assert.equal(night.lamps, 1);assert.ok(night.sun < 0.5 && night.sky.getHSL({ h: 0, s: 0, l: 0 }).l < 0.15);
  assert.ok(rain.wet && rain.fog[1] < 300);assert.ok(fog.fog[1] < 200 && fog.lamps >= 0.5);
});
check('arcade games take circuit and course names instead of mission titles', () => {
  const race = { mode: 'race' as const, race: { ...defaultRace(), track: 'desert-run' }, identity: { title: 'Rescue getaway' } };
  assert.equal(gameTitle(race), 'Desert Run');retitle(race);assert.equal(race.identity.title, 'Desert Run');
  race.race.track = 'forest-ring';retitle(race);assert.equal(race.identity.title, 'Forest Ring');
  const runner = { mode: 'runner' as const, runner: { ...defaultRunner(), theme: 'city-rooftops' as const }, identity: { title: 'Next mission 3' } };
  retitle(runner);assert.equal(runner.identity.title, 'City rooftops');
  const own = { mode: 'race' as const, race: defaultRace(), identity: { title: 'Lagos Cup' } };retitle(own);assert.equal(own.identity.title, 'Lagos Cup');assert.equal(gameTitle(own), 'Lagos Cup');
  const back = { identity: { title: 'Forest Ring' } };retitle(back);assert.equal(back.identity.title, 'The Depot');
  assert.ok(isAutomaticTitle('The Depot') && isAutomaticTitle('') && !isAutomaticTitle('Ara Grand Prix'));
});
check('themed circuits climb, slide and slow as their ground says', () => {
  for (const t of TRACK_TEMPLATES) {
    assert.equal(typeof parseTrack({ name: t.name, theme: t.theme, width: t.width, points: t.points }), 'object', `${t.id} is a clean loop`);
    const track = buildTrack(t), steep = Math.max(...track.samples.map((s, i) => Math.abs(track.samples[(i + 1) % track.samples.length].y - s.y) / track.spacing));
    assert.ok(steep <= 0.115, `${t.id} grade ${steep.toFixed(3)}`);assert.ok(Math.abs(track.samples[0].y) < 1e-6 && Math.abs(track.samples[10].y) < 0.05, `${t.id} starts level`);
  }
  const pass = buildTrack(trackTemplate('mountain-pass')!), heights = pass.samples.map((s) => s.y);assert.ok(Math.max(...heights) - Math.min(...heights) > 15, 'the mountain pass climbs');
  assert.ok(buildTrack(trackTemplate('glacier-loop')!).patches.every((p) => p.kind === 'ice') && buildTrack(trackTemplate('jungle-falls')!).patches.some((p) => p.kind === 'mud'));
  assert.ok(buildTrack(trackTemplate('lagoon-bridges')!).bridges.length === 2 && TRACK_GROUNDS.beach.verge > 0);
  const icy = new RaceGame({ ...defaultRace(), track: 'glacier-loop' }, names, 1), dry = new RaceGame({ ...defaultRace(), track: 'glacier-loop', traction: 'normal' }, names, 1);assert.ok(icy.icy && !dry.icy);
  assert.equal(new RaceGame({ ...defaultRace(), track: 'city-loop', traction: 'icy' }, names, 1).icy, true);assert.throws(() => parseRace({ traction: 'wet' }));assert.equal(parseRace({ traction: 'icy' }).traction, 'icy');
  // On ice a car keeps sliding sideways for longer.
  const slide = (g: RaceGame) => { countdown(g);const c = g.player;Object.assign(c, { vx: Math.cos(c.yaw) * 8 + Math.sin(c.yaw) * 30, vz: -Math.sin(c.yaw) * 8 + Math.cos(c.yaw) * 30 });for (let i = 0; i < 30; i++) g.update(1 / 60, { ...idleInput(), throttle: 1 });return Math.abs(c.vx * Math.cos(c.yaw) - c.vz * Math.sin(c.yaw)); };
  assert.ok(slide(icy) > slide(dry) * 1.5, 'ice keeps the slide');
  // Running wide onto the sand slows a car; climbing slows it more than descending.
  const beach = new RaceGame({ ...defaultRace(), track: 'palm-coast', opponents: 3 }, names, 1);countdown(beach);const b = beach.player, s = beach.track.samples[30];
  Object.assign(b, { x: s.x + s.tz * (beach.track.width / 2 + 2), z: s.z - s.tx * (beach.track.width / 2 + 2), yaw: Math.atan2(s.tx, s.tz), vx: s.tx * 40, vz: s.tz * 40, hint: 30 });
  for (let i = 0; i < 30; i++) beach.update(1 / 60, { ...idleInput(), throttle: 1 });assert.ok(b.speed < 38, `sand verge slows (${b.speed.toFixed(1)})`);
});
check('every runner theme builds a fair course, and train-yard carriages are long', () => {
  for (const theme of RUNNER_THEMES) {
    const r = parseRunner({ theme, seed: 5 }, ['enemy-1']), g = new RunnerGame(r, profile(), 5);g.start();
    assert.equal(r.theme, theme);assert.ok(RUNNER_KITS[theme] && RUNNER_THEME_NAMES[theme], theme);
    // Train-yard trains are whole carriages: moving ones single, parked ones up to three coupled together.
    const carts = g.segments.flatMap((s) => s.things.filter((t) => t.kind === 'cart'));assert.ok(carts.every((t) => theme === 'train-yard' ? (t.moving ? t.length === TRAIN_CAR : [1, 2, 3].includes(t.length / TRAIN_CAR)) : t.length === 2.2), theme);
  }
});
check('spring boots clear bars, land on train roofs, drop on demand and step off the end', () => {
  const idle = { left: false, right: false, jump: false, slide: false };
  const yard = new RunnerGame({ ...parseRunner({ theme: 'train-yard', seed: 5, obstacles: ['cart'], chaser: 'none' }, ['enemy-1']) }, profile(), 5);yard.start();
  let roof = 0, landed = 0, maxY = 0;
  for (let i = 0; i < 60 * 40 && yard.status === 'running'; i++) {
    yard.power.springs = 9;const s = yard.current, t = s.things.filter((t) => !t.hit && t.d + t.length > yard.d).sort((a, b) => a.d - b.d)[0], input = { ...idle };
    if (t) { const lane = [-1, 0, 1].find((_, k) => t.lanes & (1 << k))!, dist = t.d - yard.d;if (!t.moving) { if (yard.lane !== lane && yard.y === 0) input[lane > yard.lane ? 'left' : 'right'] = true;else if (dist > 0 && dist < yard.speed * 0.32 + 1.5 && yard.grounded) input.jump = true; } else if (yard.lane === lane && dist < 30) input[lane < 1 ? 'left' : 'right'] = true; }
    if (s.length - yard.d < 6 && !yard.queuedTurn) input[s.end === 'right' ? 'right' : 'left'] = true;
    yard.update(1 / 60, input);maxY = Math.max(maxY, yard.y);if (yard.floor > 0 && yard.grounded) roof += 1 / 60;
    for (const e of yard.drain()) if (e.type === 'land' && yard.floor > 0) landed++;
  }
  assert.equal(yard.status, 'running');assert.ok(landed >= 4 && roof > 3, `roof landings ${landed}, ${roof.toFixed(1)} s on roofs`);assert.ok(maxY > 3.4, 'spring jumps go high');
  // Off the roof the runner drops to the ground; down in the air brings them straight back.
  const g = new RunnerGame(parseRunner({ theme: 'temple-ruins', seed: 3, chaser: 'none' }, ['enemy-1']), profile(), 3);g.start();g.current.things.length = 0;g.current.gaps.length = 0;
  g.power.springs = 9;g.update(1 / 60, { ...idle, jump: true });for (let i = 0; i < 12; i++) g.update(1 / 60, idle);
  const high = g.y;g.update(1 / 60, { ...idle, slide: true });assert.ok(g.vy <= -10, 'down drops fast');let t = 0;while (!g.grounded && t < 2) { g.update(1 / 60, { ...idle, slide: true });t += 1 / 60; }
  assert.ok(high > 1.5 && t < 0.4, `dropped from ${high.toFixed(2)} m in ${t.toFixed(2)} s`);
  // Spring jumps clear an overhead bar that a normal jump runs into.
  for (const springs of [0, 9]) {
    const b = new RunnerGame(parseRunner({ theme: 'temple-ruins', seed: 3, obstacles: ['bar-high'], chaser: 'none' }, ['enemy-1']), profile(), 3);b.start();
    const bar = b.current.things[0];b.current.things.splice(1);b.current.gaps.length = 0;bar.d = b.d + 4.2;let stumbles = 0;
    for (let i = 0; i < 90; i++) { b.power.springs = springs;b.update(1 / 60, { ...idle, jump: i === 0 });for (const e of b.drain()) if (e.type === 'stumble') stumbles++; }
    assert.equal(stumbles, springs ? 0 : 1, `springs ${springs}`);
  }
});
check('a hoverboard glides over low barriers and gaps and breaks instead of the runner; coin rush turns obstacles into coins', () => {
  const idle = { left: false, right: false, jump: false, slide: false };
  const board = new RunnerGame(parseRunner({ theme: 'temple-ruins', seed: 4, obstacles: ['barrier-low', 'gap'], chaser: 'none' }, ['enemy-1']), profile(), 4);board.start();
  let stumbles = 0, breaks = 0;
  for (let i = 0; i < 60 * 25 && board.status === 'running'; i++) {
    board.power.hoverboard = 9;const s = board.current;board.update(1 / 60, { ...idle, left: s.length - board.d < 6 && s.end !== 'right', right: s.length - board.d < 6 && s.end === 'right' });
    for (const e of board.drain()) { if (e.type === 'stumble') stumbles++;if (e.type === 'board-break') breaks++; }
  }
  assert.equal(board.status, 'running');assert.ok(board.distance > 200 && stumbles === 0 && breaks === 0, `${board.distance.toFixed(0)} m, ${stumbles} stumbles`);
  // A blocker hit breaks the board; the next one ends the run.
  const crash = new RunnerGame(parseRunner({ theme: 'temple-ruins', seed: 4, obstacles: ['blocker'], chaser: 'none' }, ['enemy-1']), profile(), 4);crash.start();crash.power.hoverboard = 9;
  for (let i = 0; i < 60 * 20 && crash.status === 'running'; i++) { const s = crash.current;crash.update(1 / 60, { ...idle, left: s.length - crash.d < 6 && s.end !== 'right', right: s.length - crash.d < 6 && s.end === 'right' });if (crash.drain().some((e) => e.type === 'board-break')) breaks++; }
  assert.equal(breaks, 1);assert.equal(crash.downReason, 'crash');assert.equal(crash.power.hoverboard, 0);
  // Coin rush: nothing ahead can be hit for the rush and the coins are collected without steering.
  const rush = new RunnerGame(parseRunner({ theme: 'temple-ruins', seed: 6, chaser: 'none' }, ['enemy-1']), profile(), 6);rush.start();
  rush.current.pickups.push({ id: 9999, kind: 'coin-rush', d: rush.d + 0.5, lane: 0, taken: false });rush.update(1 / 60, idle);
  assert.ok(rush.power['coin-rush'] > 3);const converted = rush.current.things.filter((t) => t.hit).length, coinsAhead = rush.current.coins.length;assert.ok(converted >= 1 && rush.current.gaps.every(([a]) => a > rush.d + 50), `${converted} obstacles turned to coins`);const before = rush.coins;let t = 0;
  while (rush.power['coin-rush'] > 0 && rush.status === 'running') { const s = rush.current;rush.update(1 / 60, { ...idle, left: s.length - rush.d < 6 && s.end !== 'right', right: s.length - rush.d < 6 && s.end === 'right' });t += 1 / 60; }
  assert.equal(rush.status, 'running');assert.ok(rush.coins - before > 5 && coinsAhead > 0 && t > 3, `${rush.coins - before} coins in ${t.toFixed(1)} s`);
});
check('expert rivals lap faster than hard ones', () => {
  const finish = (aiSkill: 'hard' | 'expert') => { const g = new RaceGame({ ...defaultRace(), track: 'forest-ring', laps: 1, aiSkill, rubberBand: false, pickups: [] }, names, 3);runRace(g);return Math.min(...g.cars.filter((c) => c.ai).map((c) => c.finished ?? 999)); };
  const hard = finish('hard'), expert = finish('expert');assert.ok(expert < hard * 0.96 && expert < 999, `expert ${expert.toFixed(1)} s vs hard ${hard.toFixed(1)} s`);
});
console.log(`${checks} arcade race and runner contracts passed.`);
