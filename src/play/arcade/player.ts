/**
 * The arcade player for race and runner modes, sharing the creator preview and exported games with the mission
 * player: fixed-step rules, the speed feel, sound and music, HUD and cards, one-tap retry, local records, ghosts,
 * daily challenges, the championship cup and garage, and runner upgrades and characters.
 */
import type { GameScene } from '../scene';
import type { PlayCast } from '../cast';
import type { GameActor } from '../actor';
import type { PlayerHooks } from '../player';
import { chapterProject, gameStem, type PlayProject } from '../project';
import { EngineSound } from '../engine-sound';
import { GameMusic } from '../music';
import { RaceGame, CAR_STATS, POINTS, type RaceInput } from './race';
import { RunnerGame, type RunnerInput } from './runner';
import { RaceView } from './race-view';
import { RunnerView } from './runner-view';
import { ArcadeHud, clock, ordinal, type CardAction, type Standing } from './hud';
import { iconSvg } from './icons';
import { ArcadeInput } from './input';
import { SpeedFeel } from './feel';
import { ArcadeSfx } from './sfx';
import { TRACK_IDS } from './track';
import { RACE_CARS, RUNNER_THEME_NAMES, gameTitle, runnerGoalLabel, type RaceCar, type RaceSettings, type RunnerSettings } from './modes';
import { cupRecord, dailySeed, decodeGhost, encodeGhost, ghostLink, linkedGhost, raceRecord, runnerRecord, saveCup, saveRace, saveRunner, today, trackKey, type RunnerRecord } from './records';

const CAR_PRICES: Record<RaceCar, number> = { keke: 200, scooter: 250, danfo: 300, van: 300, truck: 300, saloon: 400, suv: 400, pickup: 400, quad: 500, kart: 500, motorcycle: 600, muscle: 700, sports_car: 800 };
const PAINTS: string[] = ['#c8372d', '#2d6fc8', '#e2b23a', '#3c9a5f', '#8a4fc0', '#ececec', '#2b2b30'];
const CASH = [600, 400, 250, 150, 100, 80, 60, 40];
const UPGRADES = ['magnet', 'shield', 'boost', 'multiplier'] as const;
const RUNNER_PRICE = 1000;

/** One name per opponent: characters repeat when there are fewer than the field, so repeats get car numbers. */
function settingsCount(names: string[], opponents: number) {
  const list = Array.from({ length: opponents }, (_, i) => names[i % Math.max(1, names.length)] ?? 'Rival');
  return list.map((name, i) => (list.filter((n) => n === name).length > 1 ? `${name} #${i + 2}` : name));
}
export type ArcadePlayer = ReturnType<typeof mountArcade>;
export function mountArcade(scene: GameScene, initialProject: PlayProject, initialCast: PlayCast, hooks: PlayerHooks = {}, play = false) {
  const canvas = scene.canvas, stage = canvas.parentElement!, renderer = scene.renderer;
  const hud = new ArcadeHud(stage), feel = new SpeedFeel(), input = new ArcadeInput(canvas), sfx = new ArcadeSfx(), engine = new EngineSound();
  const music = new GameMusic(new URL(import.meta.env.BASE_URL, location.href).href);
  hud.root.prepend(feel.overlay);
  let root = initialProject, cast = initialCast, active = false, paused = false, last = performance.now(), size = { w: 0, h: 0 };
  let phase: 'intro' | 'playing' | 'down' | 'results' = 'intro', chapter = 0, daily = false, settled = 0, reviveTimer = 0, touchHeld = new Set<string>(), stickX = 0, stickY = 0;
  let race: RaceGame | undefined, raceView: RaceView | undefined, runner: RunnerGame | undefined, runnerView: RunnerView | undefined, ghostIndex = 0;
  let project = root;
  const mode = () => (root.mode === 'runner' ? 'runner' : 'race');
  const gameKey = () => `${gameStem(root.identity.title)}-${mode()}`;
  const rounds = () => 1 + (root.chapters?.length ?? 0);
  const castFor = (index: number) => (index === 0 ? cast : cast.chapters?.[index - 1] ?? cast);
  const drivers = (index: number) => { const c = castFor(index);return [...c.guards.values()]; };
  const audioOn = () => scene.combat.enabled;
  const setupOpen = () => !!(document.getElementById('setup') as HTMLDialogElement | null)?.open;

  function dispose() {
    raceView?.dispose();runnerView?.dispose();raceView = undefined;runnerView = undefined;race = undefined;runner = undefined;
  }
  /** The race settings for this round, with the garage car when racing a cup. */
  function raceSettings(): RaceSettings {
    const base = project.race!, cup = cupRecord(gameKey());
    if (daily) { const seed = dailySeed(gameKey());return { ...base, track: TRACK_IDS[seed % TRACK_IDS.length], laps: 2 }; }
    return cup.car && rounds() > 1 ? { ...base, car: { model: cup.car as RaceCar, color: cup.paint ?? base.car.color } } : base;
  }
  function runnerActor(record: RunnerRecord): GameActor {
    const c = castFor(chapter), choice = record.runner;
    const pick = choice === 'companion' ? c.companion : choice && choice !== 'hero' ? c.guards.get(choice) : undefined;
    return (pick ?? c.hero).clone();
  }
  /** Build the rules and scene for the current chapter; cheap enough to run on every mode switch. */
  function setup() {
    dispose();project = chapterProject(root, Math.min(chapter, rounds() - 1));feel.reset();
    if (mode() === 'race') {
      const settings = raceSettings(), key = trackKey(settings.track), record = raceRecord(gameKey(), key);
      const ghost = settings.ghost ? linkedGhost(key) ?? (record.ghost ? decodeGhost(record.ghost) : undefined) : undefined;
      // Repeated characters race under numbered names, so the standings stay readable.
      const others = drivers(chapter), base = others.map((a) => a.render.character.params.name || 'Rival'), count = settingsCount(base, settings.opponents);
      const names = { player: project.character.name || 'You', drivers: count };
      race = new RaceGame(settings, names, daily ? dailySeed(gameKey()) : 1 + chapter, ghost);
      raceView = new RaceView(race, castFor(chapter).hero.clone(), others.length ? others : [castFor(chapter).hero], settings.ghost ? castFor(chapter).hero.clone() : undefined, renderer, project.mission.environment);
      ghostIndex = 0;hud.reset(`${race.track.name.toUpperCase()} / ARCADE RACE`);
    } else {
      const settings: RunnerSettings = project.runner!, record = runnerRecord(gameKey());
      runner = new RunnerGame(settings, { upgrades: record.upgrades, missionLevel: record.missionLevel, missions: record.missions, bank: record.bank }, daily ? dailySeed(gameKey()) : settings.seed ?? Date.now() % 100000);
      const chaser = settings.chaser !== 'none' ? castFor(chapter).guards.get(settings.chaser)?.clone() : undefined;
      runnerView = new RunnerView(runner, runnerActor(record), chaser, project.mission.environment);hud.reset(`${settings.theme.replace('-', ' ').toUpperCase()} / ENDLESS RUN`);
    }
    music.configure(project.music, true);music.setPlaying(false);
    phase = 'intro';intro();
  }
  const controls = () => mode() === 'race'
    ? matchMedia('(pointer:coarse)').matches ? 'Drag your thumb to steer: the car accelerates by itself. Hold Drift through corners for a boost; tap Nitro on straights.' : 'W/↑ accelerate · A D / ← → steer · S/↓ brake · Space drift · Shift nitro · E item · F back to track · R restart · Esc pause'
    : matchMedia('(pointer:coarse)').matches ? 'Swipe left or right to change lane and to turn at corners, up to jump and down to slide.' : 'A D / ← → change lane and turn at corners · W/↑/Space jump · S/↓ slide · R restart · Esc pause';
  function help() {
    if (mode() === 'race') hud.setHelp([['W / S', 'accelerate / brake'], ['A / D', 'steer'], ['Space', 'drift'], ['Shift', 'nitro'], ['E', 'item'], ['F', 'back to track'], ['R', 'restart']], 'Drag to steer · buttons to brake, drift and boost');
    else hud.setHelp([['A / D', 'lane and turn'], ['W / Space', 'jump'], ['S', 'slide'], ['R', 'restart']], 'Swipe to change lane, turn, jump and slide');
  }
  /** The race result or run being shown; each start makes a new run token so records settle once per game. */
  let settled_: object | undefined, runRef: object = {}, settledNotes = { newLap: false, newRace: false, earned: 0 };
  /** Short fact chips under the briefing title. */
  function facts(items: string[]) { const d = document.createElement('div');d.className = 'arcade-facts';for (const t of items) { const s = document.createElement('span');s.textContent = t;d.append(s); } return d; }
  const micro = (text: string) => Object.assign(document.createElement('p'), { className: 'micro', textContent: text });
  const title = () => gameTitle(project);
  function intro() {
    help();
    const briefing = project.identity.briefing.trim();
    /** Cup races or run stages with their names, ticking those already won or cleared. */
    const steps = (done: number) => rounds() > 1 && !daily ? [hud.progress(Array.from({ length: rounds() }, (_, i) => ({ label: gameTitle(chapterProject(root, i)), state: i === chapter ? 'current' as const : i < done ? 'done' as const : 'next' as const })))] : [];
    if (race) {
      const settings = race.settings, record = raceRecord(gameKey(), trackKey(settings.track)), cup = cupRecord(gameKey());
      const kicker = daily ? `DAILY CHALLENGE · ${today()}` : rounds() > 1 ? `CUP · RACE ${chapter + 1} OF ${rounds()}` : 'ARCADE RACE';
      const stats = hud.stats([['BEST LAP', record.bestLap ? clock(record.bestLap) : '—'], ['BEST RACE', record.bestRace ? clock(record.bestRace) : '—'], ...(rounds() > 1 && !daily ? [['CUP POINTS', String(cup.points[project.character.name || 'You'] ?? 0), 'hot'] as [string, string, 'hot'], ['CASH', `$${cup.cash}`] as [string, string]] : [])]);
      hud.show(kicker, title(), [...steps(cup.complete ? rounds() : cup.round), ...(briefing ? [hud.briefing(briefing)] : []), facts([race.track.name, `${settings.laps} ${settings.laps === 1 ? 'lap' : 'laps'}`, `${settings.opponents + 1} cars`, CAR_STATS[settings.car.model].name]), stats, ...(linkedGhost(trackKey(settings.track)) ? [hud.badges(['RACING A SHARED GHOST'])] : []), micro(controls())], [
        { label: 'Start race', primary: true, run: start },
        ...(daily ? [{ label: 'Back to the main race', run: () => { daily = false;setup(); } }] : [{ label: 'Daily challenge', run: () => { daily = true;setup(); } }]),
        ...(rounds() > 1 && !daily ? [{ label: 'Garage', run: garage }] : []),
      ], 'brief');
    } else if (runner) {
      const record = runnerRecord(gameKey()), settings = runner.settings, objects = settings.objects ?? [];
      const kicker = daily ? `DAILY RUN · ${today()}` : rounds() > 1 ? `STAGE ${chapter + 1} OF ${rounds()}` : 'ENDLESS RUNNER';
      const target = runnerGoalLabel(settings);
      const stats = hud.stats([['BEST', record.best ? Math.floor(record.best).toLocaleString() : '—'], ['FURTHEST', record.bestDistance ? `${Math.floor(record.bestDistance).toLocaleString()} m` : '—'], ['BANK', `● ${record.bank}`, 'hot'], ...(daily && record.daily[today()] ? [['TODAY', Math.floor(record.daily[today()]).toLocaleString()] as [string, string]] : [])]);
      hud.show(kicker, title(), [...steps(record.stage ?? 0), ...(briefing ? [hud.briefing(briefing)] : []), facts([RUNNER_THEME_NAMES[settings.theme], target, settings.chaser !== 'none' ? 'Chaser' : 'No chaser']), ...(objects.length ? [hud.section(settings.goal.type === 'objects' ? 'Find them all' : 'Bonus finds', hud.objectList(objects), micro('Objects appear one at a time inside a beam of light. Miss one and it turns up again further on.'))] : []), stats, micro(controls())], [
        { label: 'Run', primary: true, run: start },
        ...(daily ? [{ label: 'Back to the main run', run: () => { daily = false;setup(); } }] : [{ label: 'Daily run', run: () => { daily = true;setup(); } }]),
        { label: 'Shop', run: shop },
      ], 'brief');
    }
    renderHud();
  }
  /** One-tap start or retry: rules reset in place, the scene stays loaded. */
  function start() {
    sfx.unlock();engine.unlock();music.unlock();hooks.stopPreview?.();hud.hideCard();input.clear();feel.reset();
    if (race) { race.reset();raceView!.events([], feel);ghostIndex = 0; }
    runRef = {};
    if (runner) { runner.reset(daily ? dailySeed(gameKey()) : runner.settings.seed ?? Date.now() % 100000);runnerView!.reset();runner.start(); }
    phase = 'playing';paused = false;settled = 0;music.setPlaying(true);canvas.focus({ preventScroll: true });
    touchButtons();
  }
  function touchButtons() {
    if (race) hud.touchButtons([{ id: 'brake', label: 'BRAKE' }, ...(race.settings.handling === 'drift' ? [{ id: 'drift', label: 'DRIFT' }] : []), ...(race.settings.nitro ? [{ id: 'nitro', label: 'NITRO' }] : []), ...(race.settings.pickups.includes('item-box') ? [{ id: 'item', label: 'ITEM' }] : [])], (id, down) => { if (down) touchHeld.add(id);else touchHeld.delete(id); });
    else hud.touchButtons([], () => {});
  }
  function setPause(next: boolean) {
    if (phase !== 'playing' || paused === next) return;paused = next;music.setPlaying(!next);
    if (next) hud.show('PAUSED', title(), [hud.section('Controls', controls())], [
      { label: 'Keep playing', primary: true, run: () => setPause(false) },
      { label: 'Restart', run: start },
      ...('DeviceOrientationEvent' in window && matchMedia('(pointer:coarse)').matches ? [{ label: input.tilt ? 'Tilt steering: on' : 'Tilt steering: off', run: async () => { if (input.tilt) input.tilt = false;else await input.enableTilt();setPause(false);setPause(true); } }] : []),
      ...(mode() === 'race' ? [{ label: 'Quit to start', run: () => { paused = false;setup(); } }] : [{ label: 'End run', run: () => { paused = false;runner!.status = 'down';runner!.end();results(); } }]),
    ]);
    else { hud.hideCard();canvas.focus({ preventScroll: true }); }
  }
  // ---- Input ----
  function raceInput(): RaceInput {
    const pad = input.gamepad(), coarse = matchMedia('(pointer:coarse)').matches, k = (...c: string[]) => input.held(...c);
    const keySteer = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    const steer = keySteer || pad?.stick || (input.tilt ? input.tiltValue : 0) || input.thumb;
    const keyThrottle = (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0), padThrottle = pad ? pad.throttle - pad.brake : 0;
    const autoThrottle = coarse && !keyThrottle && !padThrottle && !touchHeld.has('brake');
    return {
      throttle: keyThrottle || padThrottle || (autoThrottle ? 1 : touchHeld.has('brake') ? -1 : 0), steer: Math.max(-1, Math.min(1, steer)),
      brake: race?.settings.handling === 'grip' && k('Space'), drift: k('Space') || !!pad?.held[0] || touchHeld.has('drift'),
      nitro: k('ShiftLeft', 'ShiftRight') || !!pad?.held[5] || !!pad?.held[2] || touchHeld.has('nitro'),
      item: input.tap('KeyE', 'ControlLeft', 'ControlRight') || !!pad?.edge[1] || (touchHeld.has('item') && touchHeld.delete('item')),
      respawn: input.tap('KeyF') || !!pad?.edge[3],
    };
  }
  function runnerInput(): RunnerInput {
    const pad = input.gamepad(), swipes = input.takeSwipes(), flick = (value: number, previous: number) => Math.abs(value) > 0.6 && Math.abs(previous) <= 0.6;
    const left = input.tap('KeyA', 'ArrowLeft') || swipes.includes('left') || !!pad?.edge[14] || (!!pad && flick(pad.stick, stickX) && pad.stick < 0);
    const right = input.tap('KeyD', 'ArrowRight') || swipes.includes('right') || !!pad?.edge[15] || (!!pad && flick(pad.stick, stickX) && pad.stick > 0);
    const jump = input.tap('KeyW', 'ArrowUp', 'Space') || swipes.includes('up') || !!pad?.edge[0] || !!pad?.edge[12] || (!!pad && flick(pad.stickY, stickY) && pad.stickY < 0);
    const slide = input.tap('KeyS', 'ArrowDown') || input.held('KeyS', 'ArrowDown') && !runner!.grounded || swipes.includes('down') || !!pad?.edge[1] || !!pad?.edge[13] || (!!pad && flick(pad.stickY, stickY) && pad.stickY > 0);
    stickX = pad?.stick ?? 0;stickY = pad?.stickY ?? 0;
    // Tilt moves between the three lanes; sideways swipes still turn at corners. Tilting right means the right lane (-1).
    const tiltLane = input.tilt ? (input.tiltValue > 0.35 ? -1 : input.tiltValue < -0.35 ? 1 : 0) : undefined;
    return { left, right, jump, slide, tiltLane };
  }
  // ---- Events ----
  function raceEvents() {
    const g = race!, list = g.drain(), player = g.player.id;raceView!.events(list, feel);
    for (const e of list) {
      if (e.type === 'beep') { sfx.play('beep');hud.say(String(e.count), 0.9); }
      if (e.type === 'go') { sfx.play('go');hud.say(e.launch ? 'LAUNCH!' : 'GO!', 1, 'good'); }
      if ('car' in e && e.car !== player) continue;
      if (e.type === 'wall') sfx.play('crash', e.strength / 20);
      if (e.type === 'bump') sfx.play('bump', e.strength / 10);
      if (e.type === 'boost' || e.type === 'pad') { sfx.play('boost');if (e.type === 'boost') hud.say('BOOST', 0.6, 'good'); }
      if (e.type === 'spin') { sfx.play('spin');hud.say('SPIN!', 0.8, 'bad'); }
      if (e.type === 'respawn') hud.say('BACK ON TRACK', 0.9);
      if (e.type === 'item') sfx.play('item');
      if (e.type === 'drift-ready') sfx.play('item');
      if (e.type === 'land') sfx.play('land', e.strength / 8);
      if (e.type === 'near-miss') { feel.slowMotion(0.25);sfx.play('whoosh'); }
      if (e.type === 'sector' && e.delta !== undefined) hud.say(`S${e.sector} ${e.delta <= 0 ? '−' : '+'}${Math.abs(e.delta).toFixed(2)}`, 1, e.delta <= 0 ? 'good' : 'bad');
      if (e.type === 'lap') { sfx.play(e.best ? 'best' : 'lap');hud.say(e.best && e.lap > 1 ? `BEST LAP ${clock(e.time)}` : e.lap === g.settings.laps - 1 ? 'FINAL LAP' : `LAP ${clock(e.time)}`, 1.6, e.best ? 'good' : 'normal'); }
      if (e.type === 'finish') { sfx.play(e.position <= 3 ? 'win' : 'lose');hud.say(`${ordinal(g.position(g.player))}!`, 2.2, e.position <= 3 ? 'good' : 'normal'); }
    }
  }
  function runnerEvents() {
    const g = runner!, list = g.drain();runnerView!.events(list, feel);
    for (const e of list) {
      if (e.type === 'coin') sfx.play('coin');
      if (e.type === 'jump') sfx.play('jump');
      if (e.type === 'slide') sfx.play('slide');
      if (e.type === 'land') sfx.play('land', 0.4);
      if (e.type === 'turn') sfx.play('whoosh');
      if (e.type === 'stumble') { sfx.play('stumble');hud.say(g.settings.chaser === 'none' ? 'STUMBLE' : 'STUMBLE · THEY ARE CLOSE', 1, 'bad'); }
      if (e.type === 'find') {
        const o = g.settings.objects![e.item], n = Math.min(g.found[e.item], o.count);sfx.play(e.all ? 'best' : 'item');
        hud.showFound(o, e.all ? 'EVERYTHING FOUND' : o.count > 1 ? `FOUND ${n} OF ${o.count}` : 'FOUND');
      }
      if (e.type === 'power') { sfx.play('power');hud.say({ magnet: 'MAGNET', shield: 'SHIELD', boost: 'BOOST', multiplier: '×2 SCORE' }[e.kind], 1, 'good'); }
      if (e.type === 'shield-break') { sfx.play('shield');hud.say('SHIELD SAVED YOU', 1, 'good'); }
      if (e.type === 'smash') sfx.play('bump', 0.7);
      if (e.type === 'near-miss') { sfx.play('whoosh');hud.say('CLOSE CALL', 0.8, 'good'); }
      if (e.type === 'mission') { sfx.play('best');hud.say('MISSION COMPLETE', 1.4, 'good'); }
      if (e.type === 'goal') { sfx.play('win');hud.say('GOAL REACHED', 1.6, 'good');if (rounds() > 1) { g.status = 'won';phase = 'results';setTimeout(results, 900); } }
      if (e.type === 'revive') sfx.play('shield');
      if (e.type === 'crash' || e.type === 'fall' || e.type === 'caught') { sfx.play('crash', 1);sfx.play('lose');hud.say(e.type === 'caught' ? 'CAUGHT!' : e.type === 'fall' ? 'FELL!' : 'CRASH!', 1.2, 'bad');phase = 'down';reviveTimer = 0.9; }
    }
  }
  // ---- Results ----
  function results() {
    phase = 'results';music.setPlaying(false);engine.update(false, 0, false);
    if (race) raceResults();else runnerResults();
  }
  function raceResults() {
    const g = race!, key = trackKey(g.settings.track), record = raceRecord(gameKey(), key), r = g.result!;
    // Records and cup points are settled once per race; reopening the card from the garage only shows them again.
    const fresh = settled_ !== r;
    if (fresh) {
      settled_ = r;const newLap = r.bestLap < (record.bestLap ?? Infinity), newRace = r.time < (record.bestRace ?? Infinity);settledNotes = { newLap, newRace, earned: 0 };
      if (newLap) { record.bestLap = r.bestLap;if (g.bestGhost?.length && g.bestLap !== undefined) record.ghost = encodeGhost(g.bestLap, g.bestGhost); }
      if (newRace) record.bestRace = r.time;
      record.top.push({ time: r.time, position: r.position, date: today() });saveRace(gameKey(), key, record);
    }
    const { newLap, newRace } = settledNotes, notes = [...(newLap ? ['NEW BEST LAP'] : []), ...(newRace ? ['NEW BEST RACE'] : [])];
    const standings = g.standings(), times = g.projectedTimes(), lead = times.get(standings[0].id)!;
    const rows: Standing[] = standings.map((c, i) => { const t = times.get(c.id)!;return { place: i + 1, name: c.driver, color: c.color, time: `${clock(t)}${c.finished === undefined ? '*' : ''}`, gap: i ? `+${(t - lead).toFixed(2)}` : 'WIN', you: !c.ai }; });
    const stats: [string, string, ('good' | 'hot' | '')?][] = [['TIME', clock(r.time), newRace ? 'good' : ''], ['BEST LAP', clock(r.bestLap), newLap ? 'good' : '']];
    const right: HTMLElement[] = [], actions: CardAction[] = [{ label: 'Race again', primary: true, run: start }];
    let cupWin = '';
    if (rounds() > 1 && !daily) {
      const cup = cupRecord(gameKey()), you = project.character.name || 'You';
      if (fresh && cup.round === chapter && !cup.complete) {
        standings.forEach((c, i) => { const name = c.ai ? c.driver : you;cup.points[name] = (cup.points[name] ?? 0) + (POINTS[i] ?? 0); });
        settledNotes.earned = CASH[r.position - 1] ?? 0;cup.cash += settledNotes.earned;cup.round = chapter + 1;cup.complete = cup.round >= rounds();saveCup(gameKey(), cup);
      }
      const order = Object.entries(cup.points).sort((a, b) => b[1] - a[1]);
      stats.push(['CASH', `$${cup.cash}`, 'hot'], ...(settledNotes.earned ? [['EARNED', `+$${settledNotes.earned}`, 'good'] as [string, string, 'good']] : []));
      right.push(hud.section(cup.complete ? 'Final cup standings' : `Cup after race ${chapter + 1} of ${rounds()}`, hud.bars(order.map(([name, value]) => ({ name, value, you: name === you })))));
      if (cup.complete) cupWin = order[0]?.[0] === you ? 'YOU WIN THE CUP' : `${order[0]?.[0].toUpperCase()} WINS THE CUP`;
      if (!cup.complete && chapter + 1 < rounds()) actions.unshift({ label: `Next race: ${gameTitle(chapterProject(root, chapter + 1))}`, primary: true, run: () => { chapter++;setup(); } });
      actions.push({ label: 'Garage', run: garage });
      if (cup.complete) actions.push({ label: 'Restart the cup', run: () => { saveCup(gameKey(), { round: 0, points: {}, cash: 0, garage: cup.garage, car: cup.car, paint: cup.paint, complete: false });chapter = 0;setup(); } });
    }
    if (actions.filter((a) => a.primary).length > 1) actions[1] = { ...actions[1], primary: false };
    if (record.ghost && navigator.clipboard) actions.push({ label: 'Copy ghost link', run: () => { void navigator.clipboard.writeText(ghostLink(key, record.ghost!)).then(() => hud.say('LINK COPIED', 1, 'good')); } });
    if (!daily) actions.push({ label: 'Daily challenge', run: () => { daily = true;setup(); } });
    const highlights = [...(cupWin ? [cupWin] : []), ...notes];
    const left = [hud.podium(rows.slice(0, 3)), hud.section('Results', hud.standings(rows), ...(rows.some((x) => x.time.endsWith('*')) ? [micro('* Still racing: estimated from their pace.')] : []))];
    right.unshift(hud.stats(stats), ...(highlights.length ? [hud.badges(highlights)] : []));
    hud.show(daily ? `DAILY CHALLENGE · ${today()}` : `RACE COMPLETE · ${g.track.name.toUpperCase()}`, `${ordinal(r.position)} place`, [hud.columns(left, right)], actions, 'wide', hud.aside('OF', `${g.cars.length} cars`));
  }
  function runnerResults() {
    const g = runner!, record = runnerRecord(gameKey()), score = Math.floor(g.score), won = g.status === 'won' || g.goalReached;
    // Coins are banked once per run; reopening the card from the shop only shows the result again.
    if (settled_ !== runRef) {
      settled_ = runRef;settledNotes = { newLap: score > record.best, newRace: g.distance > record.bestDistance, earned: g.coins };
      record.bank += g.coins;record.missions = g.missionsDone.map(Number);record.missionLevel = g.profile.missionLevel;
      if (score > record.best) record.best = score;
      record.bestDistance = Math.max(record.bestDistance, g.distance);record.top.push({ score, distance: Math.floor(g.distance), coins: g.coins, date: today() });
      if (daily) record.daily[today()] = Math.max(record.daily[today()] ?? 0, score);
      if (won && rounds() > 1) record.stage = Math.max(record.stage ?? 0, chapter + 1);
      saveRunner(gameKey(), record);
    }
    const best = settledNotes.newLap, notes = [...(best ? ['NEW HIGH SCORE'] : []), ...(settledNotes.newRace ? ['FURTHEST RUN'] : [])];
    const stats = hud.stats([['DISTANCE', `${Math.floor(g.distance).toLocaleString()} m`], ['COINS', `● ${g.coins}`, 'hot'], ['MULTIPLIER', `×${g.multiplier}`], ['BEST', record.best.toLocaleString(), best ? 'good' : '']]);
    const objects = g.settings.objects ?? [], finds = objects.length ? [hud.section(`Objects · ${objects.reduce((n, o, i) => n + Math.min(g.found[i] ?? 0, o.count), 0)} of ${objects.reduce((n, o) => n + o.count, 0)}`, hud.objectList(objects, g.found))] : [];
    const missions = hud.section(`Missions · ×${1 + record.missionLevel} multiplier`, hud.checklist(g.missions.map((m, i) => ({ label: m.label, done: !!g.missionsDone[i], progress: g.missionProgress(i) }))), micro('Finish all three to raise your score multiplier.'));
    const actions: CardAction[] = [{ label: 'Run again', primary: true, run: start }, { label: 'Shop', run: shop }];
    if (rounds() > 1 && (won || g.settings.goal.type === 'endless') && chapter + 1 < rounds()) { actions[0] = { ...actions[0], primary: false };actions.unshift({ label: `Next stage: ${gameTitle(chapterProject(root, chapter + 1))}`, primary: true, run: () => { chapter++;setup(); } }); }
    if (!daily) actions.push({ label: 'Daily run', run: () => { daily = true;setup(); } });
    const kicker = daily ? `DAILY RUN · ${today()}` : won ? 'GOAL REACHED' : { crash: 'CRASHED', fall: 'FELL', caught: 'CAUGHT' }[g.downReason ?? 'crash'] ?? 'RUN OVER';
    hud.show(`${kicker} · ${RUNNER_THEME_NAMES[g.settings.theme].toUpperCase()}`, `${score.toLocaleString()} points`, [hud.columns([stats, ...(notes.length ? [hud.badges(notes)] : []), ...finds], [missions])], actions, 'wide', hud.aside('BANK', `● ${record.bank.toLocaleString()}`));
  }
  function revivePrompt() {
    const g = runner!, record = runnerRecord(gameKey()), cost = g.reviveCost();
    if (!g.canRevive(record.bank)) { g.end();results();return; }
    hud.show('ONE MORE GO?', 'Keep running', [hud.stats([['COST', `● ${cost}`, 'hot'], ['THIS RUN', `● ${g.coins}`], ['BANKED', `● ${record.bank}`]]), 'Carry on from here with a shield.'], [
      { label: `Continue · ● ${cost}`, primary: true, run: () => { const fromRun = Math.min(g.coins, cost);g.coins -= fromRun;record.bank -= cost - fromRun;saveRunner(gameKey(), record);g.revive();hud.hideCard();phase = 'playing';music.setPlaying(true);canvas.focus({ preventScroll: true }); } },
      { label: 'End run', run: () => { g.end();results(); } },
    ]);
  }
  // ---- Shop and garage ----
  const grid = (...items: HTMLElement[]) => { const d = document.createElement('div');d.className = 'arcade-shop arcade-grid';d.append(...items);return d; };
  function shop() {
    const record = runnerRecord(gameKey());
    const upgrades = UPGRADES.map((kind) => {
      const level = record.upgrades[kind] ?? 0, price = (level + 1) * 250;
      const tile = hud.tile({ icon: iconSvg(kind), title: { magnet: 'Magnet', shield: 'Shield', boost: 'Boost', multiplier: '×2 Score' }[kind], tag: level >= 5 ? 'MAX' : `● ${price}`, note: 'Lasts longer each level', disabled: level >= 5 || record.bank < price, run: () => { record.bank -= price;record.upgrades[kind] = level + 1;saveRunner(gameKey(), record);shop(); } });
      tile.append(hud.pips(level, 5));return tile;
    });
    const c = castFor(chapter), people: [string, string][] = [['hero', c.hero.render.character.params.name || 'Hero'], ...(c.companion ? [['companion', c.companion.render.character.params.name || 'Companion'] as [string, string]] : []), ...[...c.guards.entries()].map(([id, a]) => [id, a.render.character.params.name || id] as [string, string])];
    const named = people.map(([, name], i) => (people.filter(([, n]) => n === name).length > 1 ? `${name} #${people.slice(0, i + 1).filter(([, n]) => n === name).length}` : name));
    const runners = people.map(([id], i) => { const name = named[i];
      const owned = id === 'hero' || record.runners.includes(id), chosen = (record.runner ?? 'hero') === id;
      return hud.tile({ icon: iconSvg('runner'), title: name, tag: chosen ? 'RUNNING' : owned ? 'OWNED' : `● ${RUNNER_PRICE}`, pressed: chosen, disabled: !owned && record.bank < RUNNER_PRICE, run: () => { if (!owned) { record.bank -= RUNNER_PRICE;record.runners.push(id); } record.runner = id;saveRunner(gameKey(), record);setup();shop(); } });
    });
    hud.show('SHOP', 'Power-ups & runners', [hud.columns([hud.section('Upgrades', 'Each level makes the power-up last longer.', grid(...upgrades))], [hud.section('Runners', 'Coins carry over between runs.', grid(...runners))])], [{ label: 'Done', primary: true, run: () => (phase === 'results' ? runnerResults() : intro()) }], 'wide', hud.aside('BANK', `● ${record.bank.toLocaleString()}`));
  }
  /** Stats on a 0..1 scale against the whole garage, so the bars compare cars. */
  const statScale = (key: 'top' | 'accel' | 'grip' | 'turn', v: number) => { const all = RACE_CARS.map((m) => CAR_STATS[m][key]), lo = Math.min(...all), hi = Math.max(...all);return 0.18 + (0.82 * (v - lo)) / Math.max(1e-6, hi - lo); };
  function garage() {
    const cup = cupRecord(gameKey()), base = project.race!.car, owned = new Set([base.model, ...cup.garage]), current = (cup.car ?? base.model) as RaceCar, paint = cup.paint ?? base.color;
    const cars = RACE_CARS.map((model) => {
      const has = owned.has(model), chosen = current === model, s = CAR_STATS[model];
      return hud.tile({ icon: iconSvg(model), title: s.name, tag: chosen ? 'DRIVING' : has ? 'OWNED' : `$${CAR_PRICES[model]}`, pressed: chosen, color: chosen ? paint : undefined, disabled: !has && cup.cash < CAR_PRICES[model], meters: [['SPD', statScale('top', s.top)], ['GRIP', statScale('grip', s.grip)]], run: () => { if (!has) { cup.cash -= CAR_PRICES[model];cup.garage.push(model); } cup.car = model;saveCup(gameKey(), cup);setup();garage(); } });
    });
    const s = CAR_STATS[current], room = document.createElement('div');room.className = 'arcade-showroom';
    const art = document.createElement('div');art.className = 'arcade-showroom-art';art.innerHTML = iconSvg(current, 1.2);art.style.color = paint;
    const name = document.createElement('strong');name.textContent = s.name;
    const swatches = document.createElement('div');swatches.className = 'arcade-swatches';
    for (const colour of PAINTS) { const b = document.createElement('button');b.type = 'button';b.style.background = colour;b.setAttribute('aria-label', `Paint ${colour}`);b.setAttribute('aria-pressed', String(colour === paint));b.onclick = () => { cup.paint = colour;cup.car ??= base.model;saveCup(gameKey(), cup);setup();garage(); };swatches.append(b); }
    room.append(art, name, micro(`Top ${Math.round(s.top * 3.6)} km/h · grip ${s.grip}`), hud.statBars([['TOP SPEED', statScale('top', s.top)], ['ACCELERATION', statScale('accel', s.accel)], ['GRIP', statScale('grip', s.grip)], ['TURNING', statScale('turn', s.turn)]]), hud.section('Paint', swatches));
    hud.show('GARAGE', 'Choose your ride', [hud.columns([hud.section('Cars', 'Win cash in cup races to unlock more.', grid(...cars))], [room], 'right')], [{ label: 'Done', primary: true, run: () => (phase === 'results' ? raceResults() : intro()) }], 'wide', hud.aside('CASH', `$${cup.cash}`));
  }
  // ---- Loop ----
  /** Ghost delta: how far ahead (negative) or behind the best lap the player is at this point of the lap. */
  function ghostDelta() {
    const g = race!, ghost = g.ghost, p = g.player;if (!ghost?.length || g.status !== 'racing' || p.finished !== undefined || p.progress < 0) return undefined;
    let best = ghostIndex, dist = Infinity;
    for (let i = Math.max(0, ghostIndex - 5); i < Math.min(ghost.length, ghostIndex + 40); i++) { const d = (ghost[i].x - p.x) ** 2 + (ghost[i].z - p.z) ** 2;if (d < dist) { dist = d;best = i; } }
    if (dist > 900) return undefined;ghostIndex = best;return g.time - p.lapStart - ghost[best].t;
  }
  function renderHud() { if (race) hud.race(race, ghostDelta());else if (runner) hud.runner(runner); }
  function resize() { const r = canvas.getBoundingClientRect();if (r.width && r.height && (r.width !== size.w || r.height !== size.h)) { size = { w: r.width, h: r.height };renderer.setSize(r.width, r.height, false); } }
  function frame(now: number) {
    requestAnimationFrame(frame);
    if (!active) { last = now;return; }
    const real = Math.min(0.05, Math.max(0.001, (now - last) / 1000));last = now;resize();
    input.poll();
    if (setupOpen() && phase === 'playing' && !paused) setPause(true);
    if (input.tap('Escape', 'KeyP') || input.gamepad()?.edge[9]) { if (phase === 'playing') setPause(!paused); }
    if ((input.tap('KeyR') || input.gamepad()?.edge[8]) && (phase === 'playing' || phase === 'results')) start();
    sfx.enabled = audioOn();music.setMuted(!audioOn());{ const w = project.mission.environment?.weather;sfx.weather(w === 'rain' || w === 'sandstorm' ? w : 'none', active && !paused && phase !== 'intro'); }
    const dt = real * feel.timeScale, running = phase === 'playing' && !paused;
    if (race && raceView) {
      if (running) { race.update(real, raceInput(), feel.timeScale);raceEvents(); }
      if (running && race.status === 'finished') { settled += real;if (settled > 2.2) results(); }
      raceView.update(running || phase === 'results' ? dt : 0, feel, size.w / Math.max(1, size.h));
      engine.update(running && race.status !== 'countdown', race.player.speed, audioOn(), race.player.stats.top);
      music.setIntensity(race.status === 'racing' ? Math.min(1, 0.45 + (race.player.lap / race.settings.laps) * 0.4 + (race.position(race.player) <= 3 ? 0.15 : 0)) : 0.4);
      renderer.render(raceView.scene, raceView.camera);
    } else if (runner && runnerView) {
      if (running) { runner.update(real, runnerInput(), feel.timeScale);runnerEvents(); }
      if (phase === 'down') { runner.update(real, { left: false, right: false, jump: false, slide: false });reviveTimer -= real;if (reviveTimer <= 0 && phase === 'down') { phase = 'results';music.setPlaying(false);revivePrompt(); } }
      runnerView.update(dt, feel, size.w / Math.max(1, size.h));
      music.setIntensity(Math.min(1, 0.35 + runner.speed / runner.settings.maxSpeed * 0.65));
      renderer.render(runnerView.scene, runnerView.camera);
    }
    feel.update(real);hud.tick(real);renderHud();
    const pauseButton = document.getElementById('pause') as HTMLButtonElement | null;if (pauseButton) pauseButton.disabled = phase !== 'playing';
  }
  function activate(on: boolean) {
    active = on;input.active = on;hud.root.hidden = !on;document.body.classList.toggle('arcade-active', on);
    if (!on) { music.setPlaying(false);engine.update(false, 0, false);sfx.weather('none', false);paused = false; }
  }
  function replace(nextProject: PlayProject, nextCast: PlayCast, playNow = true) {
    root = nextProject;cast = nextCast;daily = false;
    const cup = cupRecord(gameKey()), stage = runnerRecord(gameKey()).stage ?? 0;chapter = Math.min(rounds() - 1, mode() === 'race' ? (cup.complete ? 0 : cup.round) : stage);
    setup();if (playNow && active) start();
  }
  // A hidden page stops drawing frames, so the game pauses and its loops fall silent at once instead of on the next frame.
  document.addEventListener('visibilitychange', () => { if (!document.hidden || !active) return;if (phase === 'playing') setPause(true);sfx.weather('none', false);engine.update(false, 0, false);music.setPlaying(false); });
  document.getElementById('pause')?.addEventListener('click', () => { if (active && phase === 'playing') setPause(!paused); });
  // How to play shows this mode's controls instead of the mission briefing.
  document.getElementById('help')?.addEventListener('click', (e) => { if (!active) return;e.stopImmediatePropagation();if (phase === 'playing') setPause(true);else if (phase === 'intro') intro(); }, true);
  replace(initialProject, initialCast, false);activate(true);if (play) start();
  requestAnimationFrame(frame);
  return {
    get state() { return { mode: mode(), phase, paused, chapter, daily, race, runner, raceView, runnerView, project: root, chapterProject: project, feel, music }; },
    replace, start, suspend: () => activate(false), resume: () => activate(true),
  };
}
