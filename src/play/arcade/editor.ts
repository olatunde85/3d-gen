/**
 * Game setup controls for the game mode and its race or runner settings. Every change is validated with the same
 * parsers as imported JSON, so the editor cannot produce a setup the player would reject.
 */
import type { PlayProject } from '../project';
import { TRACK_TEMPLATES } from './track';
import { CAR_STATS } from './race';
import { defaultRace, defaultRunner, parseRace, parseRunner, RACE_CARS, RACE_PICKUPS, RUNNER_OBSTACLES, RUNNER_POWER_UPS, RUNNER_THEMES, type PlayMode } from './modes';

const MODES: { id: PlayMode; title: string; note: string }[] = [
  { id: 'mission', title: 'Mission', note: 'Staged goals on a measured map.' },
  { id: 'race', title: 'Arcade race', note: 'Laps against AI racers.' },
  { id: 'runner', title: 'Endless runner', note: 'Three lanes, jump, slide, turn.' },
];
const LABELS: Record<string, string> = {
  'boost-pad': 'Boost pads', 'item-box': 'Item boxes', hazard: 'Hazards', 'barrier-low': 'Low barriers (jump)', 'bar-high': 'Overhead bars (slide)', gap: 'Gaps (jump)', blocker: 'Lane blockers', cart: 'Moving carts',
  magnet: 'Coin magnet', shield: 'Shield', boost: 'Speed boost', multiplier: 'Score ×2', 'temple-ruins': 'Temple ruins', 'city-rooftops': 'City rooftops', 'desert-canyon': 'Desert canyon',
};

export function modeEditor(root: HTMLElement, draft: () => PlayProject, chapter: () => number, changed: () => void) {
  const note = document.createElement('p');note.className = 'micro';note.setAttribute('role', 'status');
  const field = (label: string, control: HTMLElement, hint = '') => { const wrap = document.createElement('div');wrap.className = 'config-group';const l = document.createElement('label');l.textContent = label;if (control.id) l.htmlFor = control.id;wrap.append(l, control);if (hint) { const p = document.createElement('p');p.className = 'micro';p.textContent = hint;wrap.append(p); } return wrap; };
  const select = (id: string, options: [string, string][], value: string, on: (v: string) => void) => { const s = document.createElement('select');s.id = id;for (const [v, t] of options) s.append(new Option(t, v, false, v === value));s.onchange = () => on(s.value);return s; };
  const number = (id: string, value: number, min: number, max: number, step: number, on: (v: number) => void) => { const i = document.createElement('input');Object.assign(i, { id, type: 'number', min: String(min), max: String(max), step: String(step), value: String(value) });i.onchange = () => on(Number(i.value));return i; };
  const toggle = (id: string, label: string, value: boolean, on: (v: boolean) => void) => { const l = document.createElement('label');l.className = 'check-row';const i = document.createElement('input');Object.assign(i, { id, type: 'checkbox', checked: value });i.onchange = () => on(i.checked);l.append(i, ` ${label}`);return l; };
  const checks = <T extends string>(name: string, options: readonly T[], value: T[], on: (v: T[]) => void) => { const wrap = document.createElement('div');wrap.className = 'check-list';for (const o of options) wrap.append(toggle(`${name}-${o}`, LABELS[o] ?? o, value.includes(o), (on2) => on(on2 ? [...value, o] : value.filter((v) => v !== o))));return wrap; };
  /** Apply an edit through the strict parser; a rejected edit keeps the previous settings and explains why. */
  function apply(edit: (p: PlayProject) => void) {
    const p = draft(), before = { race: structuredClone(p.race), runner: structuredClone(p.runner), mode: p.mode };
    try {
      edit(p);
      if (p.mode === 'race') p.race = parseRace(p.race);
      if (p.mode === 'runner') p.runner = parseRunner(p.runner, p.enemies.map((e) => e.id));
      note.textContent = '';
    } catch (error) { Object.assign(p, before);note.textContent = (error as Error).message; }
    paint();changed();
  }
  function setMode(mode: PlayMode) {
    apply((p) => {
      p.mode = mode === 'mission' ? undefined : mode;
      if (mode === 'race') { p.race ??= defaultRace();delete p.runner; } else if (mode === 'runner') { p.runner ??= { ...defaultRunner(), chaser: p.enemies[0]?.id ?? 'none' };delete p.race; } else { delete p.race;delete p.runner; }
    });
  }
  function paint() {
    const p = draft(), mode = p.mode ?? 'mission', shared = chapter() > 0;
    root.replaceChildren();
    const heading = document.createElement('h4');heading.textContent = 'Game mode';root.append(heading);
    const grid = document.createElement('div');grid.className = 'choice-grid';grid.setAttribute('role', 'group');grid.setAttribute('aria-label', 'Game mode');
    for (const m of MODES) {
      const b = document.createElement('button');b.type = 'button';b.className = 'choice-card choice-inline';b.setAttribute('aria-pressed', String(mode === m.id));b.dataset.mode = m.id;b.disabled = shared;
      const strong = document.createElement('strong'), small = document.createElement('small');strong.textContent = m.title;small.textContent = m.note;b.append(strong, small);b.onclick = () => setMode(m.id);grid.append(b);
    }
    root.append(grid);
    if (shared) { const s = document.createElement('p');s.className = 'micro';s.textContent = 'Every chapter shares the first mission’s mode. Each chapter can still choose its own track or course.';root.append(s); }
    document.getElementById('mission-settings')?.classList.toggle('arcade-mode', mode !== 'mission');
    if (mode === 'race' && p.race) {
      const r = p.race, custom = typeof r.track !== 'string';
      root.append(
        field('Track', select('race-track', [...TRACK_TEMPLATES.map((t) => [t.id, `${t.name} · ${t.theme}`] as [string, string]), ...(custom ? [['custom', `${(r.track as { name?: string }).name ?? 'Custom circuit'} (from JSON)`] as [string, string]] : [])], custom ? 'custom' : (r.track as string), (v) => v !== 'custom' && apply((q) => { q.race!.track = v; })), 'Custom circuits come from JSON control points, for example through LLM Assist.'),
        field('Laps', number('race-laps', r.laps, 1, 9, 1, (v) => apply((q) => { q.race!.laps = v; }))),
        field('Opponents', number('race-opponents', r.opponents, 3, 7, 1, (v) => apply((q) => { q.race!.opponents = v; })), 'AI racers use your enemy characters as drivers.'),
        field('AI skill', select('race-skill', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], r.aiSkill, (v) => apply((q) => { q.race!.aiSkill = v as typeof r.aiSkill; }))),
        field('Handling', select('race-handling', [['drift', 'Drift: hold to slide and charge a boost'], ['grip', 'Grip: brake and steer']], r.handling, (v) => apply((q) => { q.race!.handling = v as typeof r.handling; }))),
        field('Your car', select('race-car', RACE_CARS.map((c) => [c, CAR_STATS[c].name] as [string, string]), r.car.model, (v) => apply((q) => { q.race!.car.model = v as typeof r.car.model; }))),
        field('Car colour', (() => { const i = document.createElement('input');Object.assign(i, { id: 'race-color', type: 'color', value: r.car.color });i.onchange = () => apply((q) => { q.race!.car.color = i.value; });return i; })()),
        field('Pickups', checks('race-pickup', RACE_PICKUPS, r.pickups, (v) => apply((q) => { q.race!.pickups = v; }))),
        (() => { const g = document.createElement('div');g.className = 'config-group';g.append(toggle('race-rubber', 'Keep the pack close (rubber-banding)', r.rubberBand, (v) => apply((q) => { q.race!.rubberBand = v; })), toggle('race-nitro', 'Nitro meter', r.nitro, (v) => apply((q) => { q.race!.nitro = v; })), toggle('race-ghost', 'Best-lap ghost', r.ghost, (v) => apply((q) => { q.race!.ghost = v; })));return g; })(),
      );
    }
    if (mode === 'runner' && p.runner) {
      const r = p.runner, goal = r.goal;
      root.append(
        field('Theme', select('runner-theme', RUNNER_THEMES.map((t) => [t, LABELS[t]] as [string, string]), r.theme, (v) => apply((q) => { q.runner!.theme = v as typeof r.theme; }))),
        field('Start speed (m/s)', number('runner-start', r.startSpeed, 6, 20, 1, (v) => apply((q) => { q.runner!.startSpeed = v;q.runner!.maxSpeed = Math.max(v, q.runner!.maxSpeed); }))),
        field('Top speed (m/s)', number('runner-max', r.maxSpeed, r.startSpeed, 40, 1, (v) => apply((q) => { q.runner!.maxSpeed = v; }))),
        field('Speed ramp', select('runner-ramp', [['gentle', 'Gentle'], ['steady', 'Steady'], ['steep', 'Steep']], r.speedRamp, (v) => apply((q) => { q.runner!.speedRamp = v as typeof r.speedRamp; }))),
        field('Obstacles', checks('runner-obstacle', RUNNER_OBSTACLES, r.obstacles, (v) => apply((q) => { q.runner!.obstacles = v; }))),
        field('Power-ups', checks('runner-power', RUNNER_POWER_UPS, r.powerUps, (v) => apply((q) => { q.runner!.powerUps = v; }))),
        field('Chaser', select('runner-chaser', [['none', 'No chaser'], ...p.enemies.map((e) => [e.id, `${e.character.name || e.id} (${e.id})`] as [string, string])], r.chaser, (v) => apply((q) => { q.runner!.chaser = v; })), 'The chaser closes in after each stumble; two close together and you are caught.'),
        field('Goal', select('runner-goal', [['endless', 'Endless'], ['distance', 'Run a distance'], ['coins', 'Collect coins'], ['score', 'Reach a score']], goal.type, (v) => apply((q) => { q.runner!.goal = v === 'endless' ? { type: 'endless' } : { type: v as 'distance', target: v === 'coins' ? 200 : v === 'score' ? 20000 : 2000 }; }))),
        ...(goal.type === 'endless' ? [] : [field('Goal target', number('runner-target', goal.target, goal.type === 'coins' ? 10 : 100, 100000, 1, (v) => apply((q) => { q.runner!.goal = { type: goal.type, target: v }; })))]),
        (() => { const g = document.createElement('div');g.className = 'config-group';g.append(toggle('runner-revive', 'Revive with coins', r.revive, (v) => apply((q) => { q.runner!.revive = v; })));return g; })(),
        field('Course seed', (() => { const i = document.createElement('input');Object.assign(i, { id: 'runner-seed', type: 'number', min: '0', step: '1', placeholder: 'New course every run', value: r.seed === undefined ? '' : String(r.seed) });i.onchange = () => apply((q) => { if (i.value === '') delete q.runner!.seed;else q.runner!.seed = Number(i.value); });return i; })(), 'Set a number to give every player the same course.'),
      );
    }
    root.append(note);
  }
  return { paint };
}
