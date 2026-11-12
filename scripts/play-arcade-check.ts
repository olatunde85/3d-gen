/** Arcade race and endless runner contracts: settings, rules, generation, records and portable JSON. */
import assert from 'node:assert/strict';
import { nodeLibrary } from './node-assets';
import { castsCompanion, chapterProject, chapterSettings, defaultProject, parseProject } from '../src/play/project';
import { skyLook } from '../src/play/arcade/weather';
import { parsePlayInput, raceExample, runnerExample, generatePlayGuide, describeGame } from '../src/play/assist';
import { defaultRace, defaultRunner, gameTitle, isAutomaticTitle, parseRace, parseRunner, retitle } from '../src/play/arcade/modes';
import { TRACK_IDS, TRACK_TEMPLATES, buildTrack, locate, parseTrack, trackPoint } from '../src/play/arcade/track';
import { CAR_STATS, RaceGame, idleInput } from '../src/play/arcade/race';
import { LANE, RunnerGame, missionSet } from '../src/play/arcade/runner';
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
    for (const c of game.cars) { const p = locate(game.track, c.x, c.z, c.hint);if (!p.onShortcut) maxOff = Math.max(maxOff, Math.abs(p.lateral) - game.track.width / 2); }
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
  assert.equal(chapterProject(race, 2).race!.track, 'harbour-sprint');assert.equal(chapterProject(race, 1).mode, 'race');assert.equal(Object.hasOwn(chapterSettings(race, 'x'), 'mode'), false);
  assert.deepEqual(parseProject(JSON.stringify(race), cat), race);
  const runner = parsePlayInput(JSON.stringify(runnerExample()), cat);assert.equal(runner.mode, 'runner');assert.equal(runner.runner!.chaser, runner.enemies[0].id);
  assert.match(describeGame(race).facts[0], /Arcade race/);assert.match(describeGame(runner).facts[0], /Endless runner/);
  const guide = generatePlayGuide(cat, 'A street racing cup');for (const term of ['GAME MODES', ...TRACK_IDS, 'temple-ruins', 'bar-high', 'rubberBand', 'RACE CUP EXAMPLE']) assert.ok(guide.includes(term), term);
  const chapter = raceExample() as unknown as { chapters: Record<string, unknown>[] };chapter.chapters[0].mode = 'runner';assert.throws(() => parsePlayInput(JSON.stringify(chapter), cat), /mode/);
});
check('built-in circuits satisfy the custom circuit rules and custom loops are validated', () => {
  for (const t of TRACK_TEMPLATES) { parseTrack({ points: t.points, width: t.width });const track = buildTrack(t);assert.ok(track.length > 900 && track.length < 1500, t.id);const p = trackPoint(track, 200, 2.5), at = locate(track, p.x, p.z);assert.ok(Math.abs(at.s - 200) < 2.5 && Math.abs(at.lateral - 2.5) < 0.2, t.id); }
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
console.log(`${checks} arcade race and runner contracts passed.`);
