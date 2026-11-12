/**
 * Game setup for race and runner games, laid out like missions: Mission chooses the mode, circuit or course and
 * the format; Cast chooses the car, the field or the chaser; Challenge sets the rules, pickups and pace; Atmosphere
 * keeps the music. Mission-only controls are hidden while an arcade mode is chosen. Every change goes through the
 * same strict parsers as imported JSON.
 */
import type { PlayProject } from '../project';
import { TRACK_TEMPLATES, buildTrack, type CustomTrack, type TrackTemplate } from './track';
import { CAR_STATS } from './race';
import { defaultRace, defaultRunner, parseRace, parseRunner, RACE_CARS, RUNNER_THEMES, type PlayMode, type RaceSettings, type RunnerSettings } from './modes';

const ICONS: Record<string, string> = {
  mission: 'M16 29s-9-8.5-9-15a9 9 0 0 1 18 0c0 6.5-9 15-9 15Zm0-11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  race: 'M7 29V4m0 1h17l-3 6 3 6H7m5-12v12m6-12v12M7 11h16',
  runner: 'M19 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 15l5-5 6 3 5 1M16 11l-3 9-7 8m7-8 6 2 2 7',
  sports_car: 'M3 22v-4l6-5h10l6 5h4v4h-3m-6 0h-8m-6 0H3Zm6 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm11 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z',
  suv: 'M3 22V12l4-4h14l4 6h4v8h-3m-6 0h-8m-6 0H3Zm5 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM8 8v6h17',
  pickup: 'M3 21V10h13l4 6h8v8h-3m-6 0h-8m-6 0H3v-3Zm13-11v7H3m3 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm13 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z',
  motorcycle: 'M7 25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm18 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM7 21l6-8h6l6 8M13 13l-2-4h5m3 4 2-5h3',
  muscle: 'M2 22v-4l3-1 5-4h9l5 4 5 1v4h-3m-6 0h-8m-6 0H2Zm6 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM5 17h5',
  saloon: 'M2 22v-4l4-1 4-5h11l4 5 4 1v4h-3m-6 0h-8m-6 0H2Zm6 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM16 12v5',
  kart: 'M3 24h26M6 24a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm14 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM9 21h14l3-4h-5l-3-5h-4v9M24 17l2-4',
  danfo: 'M3 23V10l3-3h20l3 4v12h-3m-6 0h-8m-6 0H3Zm4 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM7 7v7h22M12 7v7m6-7v7m5-7v7M3 17h26',
  van: 'M3 23V9l2-2h19l5 5v11h-3m-6 0h-8m-6 0H3Zm4 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm12 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM23 7v6h6',
  truck: 'M2 22V6h17v16M19 11h6l4 5v6h-3m-5 0h-8m-6 0H2Zm4 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm15 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0ZM21 11v5h8',
  scooter: 'M7 25a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm18 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM7 22h12l3-14h-3m3 0h3M10 18h8l-2-4h-6Z',
  quad: 'M7 25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm18 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 15h9l3 3 3-3h9M14 15l-1-3h6m2 3 1-5h3',
  keke: 'M7 25a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm18 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 22V8l2-2h16l5 8 3 1v7h-2M10 22h12M27 14H19V6M4 13h15',
};
const MODES: { id: PlayMode; title: string; lines: [string, string] }[] = [
  { id: 'mission', title: 'Mission', lines: ['Staged goals.', 'Sneak, fight, escape.'] },
  { id: 'race', title: 'Arcade race', lines: ['Laps against rivals.', 'Drift, boost, win.'] },
  { id: 'runner', title: 'Endless runner', lines: ['Three lanes.', 'Jump, slide, turn.'] },
];
const THEMES: Record<string, { name: string; note: string; ground: string; path: string; side: string }> = {
  'temple-ruins': { name: 'Temple ruins', note: 'Stone paths & jungle pillars', ground: '#cfdcc0', path: '#b3a98e', side: '#8f876f' },
  'city-rooftops': { name: 'City rooftops', note: 'Concrete roofs above the streets', ground: '#cfd8de', path: '#8c9096', side: '#b9b6ad' },
  'desert-canyon': { name: 'Desert canyon', note: 'Sand trails between rock walls', ground: '#ead8b8', path: '#cfa36b', side: '#a8683f' },
};
const TRACK_GROUND: Record<string, string> = { city: '#dfe5d6', desert: '#ead8b8', harbour: '#d6dfe3', forest: '#cfdcc0' };
const PICKUP_NOTES: Record<string, [string, string]> = {
  'boost-pad': ['Boost pads', 'Orange chevrons on the road give a short burst of speed.'],
  'item-box': ['Item boxes', 'Rows of boxes give a boost, an oil slick to drop behind you or a nitro refill. Use with E or the Item button.'],
  hazard: ['Hazards', 'Oil slicks on the racing line spin out any car that crosses them.'],
};
const OBSTACLE_NOTES: Record<string, [string, string]> = {
  'barrier-low': ['Low barriers', 'Jump them; clipping one is a stumble.'],
  'bar-high': ['Overhead bars', 'Slide under them; clipping one is a stumble.'],
  gap: ['Gaps', 'Jump across; falling in ends the run.'],
  blocker: ['Lane blockers', 'Change lane around them; hitting one ends the run.'],
  cart: ['Moving carts', 'Roll toward you in one lane; change lane in time.'],
};
const POWER_NOTES: Record<string, [string, string]> = {
  magnet: ['Coin magnet', 'Pulls in coins from every lane.'],
  shield: ['Shield', 'Absorbs one crash.'],
  boost: ['Speed boost', 'A burst of speed that smashes through obstacles.'],
  multiplier: ['Score ×2', 'Doubles every point and coin while it lasts.'],
};

const svg = (inner: string, view = '0 0 32 32', extra = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"') => `<svg viewBox="${view}" ${extra} aria-hidden="true">${inner}</svg>`;
/** A circuit's outline in the style of the location cards. */
function trackArt(source: TrackTemplate | CustomTrack) {
  const t = buildTrack(source), xs = t.samples.map((s) => s.x), zs = t.samples.map((s) => s.z), pad = t.width * 1.6;
  const minX = Math.min(...xs) - pad, minZ = Math.min(...zs) - pad, w = Math.max(...xs) - minX + pad, h = Math.max(...zs) - minZ + pad;
  const d = t.samples.filter((_, i) => i % 3 === 0).map((s, i) => `${i ? 'L' : 'M'}${s.x.toFixed(0)},${s.z.toFixed(0)}`).join('') + 'Z', s0 = t.samples[0];
  return svg(`<rect x="${minX}" y="${minZ}" width="${w}" height="${h}" fill="${TRACK_GROUND[t.theme]}"/><path d="${d}" fill="none" stroke="#748e83" stroke-width="${t.width * 1.15}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fffef9" stroke-width="${t.width * 0.12}" stroke-dasharray="${t.width * 0.6} ${t.width * 0.6}"/><rect x="${s0.x - t.width * 0.7}" y="${s0.z - t.width * 0.25}" width="${t.width * 1.4}" height="${t.width * 0.5}" fill="#b59054"/>`, `${minX} ${minZ} ${w} ${h}`, 'preserveAspectRatio="xMidYMid meet"');
}
function themeArt(id: string) {
  const t = THEMES[id], posts = [0, 1, 2, 3].map((i) => { const y = 14 + i * 13, s = 0.5 + i * 0.25;return `<rect x="${44 - 18 * s - 7 * s}" y="${y - 9 * s}" width="${6 * s}" height="${12 * s}" fill="${t.side}"/><rect x="${56 + 18 * s + s}" y="${y - 9 * s}" width="${6 * s}" height="${12 * s}" fill="${t.side}"/>`; }).join('');
  return svg(`<rect width="100" height="60" fill="${t.ground}"/><path d="M44 6h12l26 54H18Z" fill="${t.path}"/><path d="M50 8v52M47 8l-10 52M53 8l10 52" stroke="#fffef9" stroke-width=".6" stroke-dasharray="3 3" opacity=".7"/>${posts}<circle cx="50" cy="40" r="2.6" fill="#b59054"/>`, '0 0 100 60', 'preserveAspectRatio="xMidYMid slice"');
}

export function modeEditor(roots: { mission: HTMLElement; cast: HTMLElement; challenge: HTMLElement }, draft: () => PlayProject, chapter: () => number, changed: () => void) {
  const setup = document.getElementById('setup'), headings = new Map<HTMLElement, [string, string]>();
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = '') => { const e = document.createElement(tag);if (className) e.className = className;if (html) e.innerHTML = html;return e; };
  const group = (title: string, ...children: (HTMLElement | string)[]) => { const g = el('div', 'config-group');g.append(el('h4', '', title));for (const c of children) g.append(typeof c === 'string' ? Object.assign(el('p', 'micro'), { textContent: c }) : c);return g; };
  const card = (opts: { pressed: boolean; title: string; note: string; art: string; inline?: boolean; location?: boolean; disabled?: boolean; on: () => void; data?: string }) => {
    const b = el('button', `choice-card${opts.inline ? ' choice-inline' : ''}${opts.location ? ' location-choice' : ''}`);b.type = 'button';b.setAttribute('aria-pressed', String(opts.pressed));b.disabled = !!opts.disabled;if (opts.data) b.dataset.mode = opts.data;
    const text = el('span');text.append(Object.assign(el('strong'), { textContent: opts.title }), Object.assign(el('small'), { innerHTML: opts.note }));
    b.append(el('span', opts.location ? 'location-art' : 'choice-art', opts.art), opts.location || opts.inline ? text : '', ...(opts.location || opts.inline ? [] : [...text.childNodes]));
    b.append(Object.assign(el('i', 'choice-check'), { textContent: '✓', ariaHidden: 'true' }));b.onclick = opts.on;return b;
  };
  const grid = (kind: string, label: string, cards: HTMLElement[]) => { const g = el('div', `choice-grid ${kind}`);g.setAttribute('role', 'group');g.setAttribute('aria-label', label);g.append(...cards);return g; };
  const select = (id: string, label: string, options: [string, string][], value: string, on: (v: string) => void, note = '') => {
    const wrap = el('div'), l = el('label');l.htmlFor = id;l.textContent = label;const s = el('select');s.id = id;
    for (const [v, t] of options) s.append(new Option(t, v, false, v === value));s.onchange = () => on(s.value);wrap.append(l, s);if (note) wrap.append(Object.assign(el('p', 'micro'), { textContent: note }));return wrap;
  };
  const number = (id: string, label: string, value: number | undefined, min: number, max: number, on: (v: number | undefined) => void, placeholder = '') => {
    const wrap = el('div'), l = el('label'), i = el('input');l.htmlFor = id;l.textContent = label;Object.assign(i, { id, type: 'number', min: String(min), max: String(max), step: '1', value: value === undefined ? '' : String(value), placeholder });
    i.onchange = () => on(i.value === '' ? undefined : Number(i.value));wrap.append(l, i);return wrap;
  };
  /** Checkbox rows in the style of the optional paid jobs: a label, then a short note. */
  const checks = (prefix: string, notes: Record<string, [string, string]>, value: string[], on: (v: string[]) => void) => Object.entries(notes).flatMap(([id, [title, note]]) => {
    const l = el('label'), i = el('input');i.type = 'checkbox';i.id = `${prefix}-${id}`;i.checked = value.includes(id);i.onchange = () => on(i.checked ? [...value, id] : value.filter((v) => v !== id));l.append(i, ` ${title}`);return [l, Object.assign(el('p', 'micro'), { textContent: note })];
  });
  const toggle = (id: string, title: string, value: boolean, note: string, on: (v: boolean) => void) => { const l = el('label'), i = el('input');i.type = 'checkbox';i.id = id;i.checked = value;i.onchange = () => on(i.checked);l.append(i, ` ${title}`);return [l, Object.assign(el('p', 'micro'), { textContent: note })]; };
  const note = el('p', 'micro');note.setAttribute('role', 'status');
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
  const race = (edit: (r: RaceSettings) => void) => apply((p) => edit(p.race!));
  const runner = (edit: (r: RunnerSettings) => void) => apply((p) => edit(p.runner!));
  function setMode(mode: PlayMode) {
    apply((p) => {
      p.mode = mode === 'mission' ? undefined : mode;
      if (mode === 'race') { p.race ??= defaultRace();delete p.runner; } else if (mode === 'runner') { p.runner ??= { ...defaultRunner(), chaser: p.enemies[0]?.id ?? 'none' };delete p.race; } else { delete p.race;delete p.runner; }
    });
  }
  /** Section headings follow the mode, keeping the mission wording for missions. */
  function heading(section: string, mode: PlayMode, race: [string, string], run: [string, string]) {
    const root = document.querySelector<HTMLElement>(`#${section} .config-page-heading`);if (!root) return;
    const h = root.querySelector('h3')!, p = root.querySelector('p')!;if (!headings.has(root)) headings.set(root, [h.textContent!, p.textContent!]);
    const [title, text] = mode === 'race' ? race : mode === 'runner' ? run : headings.get(root)!;h.textContent = title;p.textContent = text;
  }
  function paint() {
    const p = draft(), mode = p.mode ?? 'mission', shared = chapter() > 0;
    setup?.classList.toggle('arcade-mode', mode !== 'mission');setup?.setAttribute('data-mode', mode);
    heading('mission-settings', mode, ['What’s the race?', 'Choose a circuit and how long it runs. Ara stages the grid.'], ['Where’s the run?', 'Choose a course and a goal. Ara builds the path as you run.']);
    heading('cast-settings', mode, ['Fill the grid.', 'Choose your car and the field, then dress the drivers.'], ['Who’s chasing?', 'Choose your runner, then who comes after you.']);
    heading('challenge-settings', mode, ['A little pressure.', 'Set the handling, boosts and pickups.'], ['A little pressure.', 'Set the pace, the obstacles and the power-ups.']);
    const enemyTab = document.querySelector('#cast-enemy span');if (enemyTab) enemyTab.textContent = mode === 'race' ? 'RIVALS' : mode === 'runner' ? 'CHASER' : 'ENEMY';
    // Mission
    const m = roots.mission;m.replaceChildren(group('What kind of game?', grid('goal-choices', 'Game mode', MODES.map((x) => card({ pressed: mode === x.id, title: x.title, note: `${x.lines[0]}<br>${x.lines[1]}`, art: svg(`<path d="${ICONS[x.id]}"/>`), disabled: shared, data: x.id, on: () => setMode(x.id) }))), ...(shared ? ['Every chapter shares the first mission’s game mode; each chapter can choose its own circuit or course.'] : [])));
    roots.cast.replaceChildren();roots.challenge.replaceChildren();
    if (mode === 'race' && p.race) {
      const r = p.race, custom = typeof r.track === 'string' ? undefined : r.track;
      m.append(group('Pick a circuit', grid('location-choices', 'Circuit', [
        ...TRACK_TEMPLATES.map((t) => card({ pressed: r.track === t.id, title: t.name, note: `${(buildTrack(t).length / 1000).toFixed(1)} km · ${t.theme}${t.ramps?.length ? ' · jumps' : ''}${t.shortcuts?.length ? ' · shortcut' : ''}`, art: trackArt(t), location: true, on: () => race((q) => { q.track = t.id; }) })),
        ...(custom ? [card({ pressed: true, title: custom.name ?? 'Custom circuit', note: `${(buildTrack(custom).length / 1000).toFixed(1)} km · from JSON`, art: trackArt(custom), location: true, on: () => {} })] : []),
      ]), 'Custom circuits come from JSON control points, for example through LLM Assist.'),
      group('Race format', Object.assign(el('div', 'challenge-basics'), {}), 'Each lap splits into three sectors, with live gaps to your best lap.'));
      m.lastElementChild!.querySelector('.challenge-basics')!.append(
        select('race-laps', 'Laps', Array.from({ length: 9 }, (_, i) => [String(i + 1), i ? `${i + 1} laps` : '1 lap · sprint']), String(r.laps), (v) => race((q) => { q.laps = Number(v); })),
        select('race-skill', 'Rival skill', [['easy', 'Easy · forgiving'], ['medium', 'Medium'], ['hard', 'Hard · fast lines']], r.aiSkill, (v) => race((q) => { q.aiSkill = v as RaceSettings['aiSkill']; })));
      const colour = el('input');Object.assign(colour, { id: 'race-color', type: 'color', value: r.car.color });colour.onchange = () => race((q) => { q.car.color = colour.value; });
      const paintRow = el('div', 'race-paint');paintRow.append(Object.assign(el('label'), { htmlFor: 'race-color', textContent: 'Paint' }), colour);
      roots.cast.append(
        group('Your car', grid('extraction-choices', 'Your car', RACE_CARS.map((c) => card({ pressed: r.car.model === c, title: CAR_STATS[c].name, note: `${Math.round(CAR_STATS[c].top * 3.6)} km/h · grip ${CAR_STATS[c].grip}`, art: svg(`<path d="${ICONS[c]}"/>`), inline: true, on: () => race((q) => { q.car.model = c; }) }))), paintRow),
        group('The field', Object.assign(el('div', 'challenge-basics'), {}), 'Rival drivers wear your enemy characters. Dress them under Rivals below; repeated characters race under numbered names.'),
      );
      roots.cast.lastElementChild!.querySelector('.challenge-basics')!.append(select('race-opponents', 'Rivals on the grid', [3, 4, 5, 6, 7].map((n) => [String(n), `${n} rivals · ${n + 1} cars`]), String(r.opponents), (v) => race((q) => { q.opponents = Number(v); })));
      roots.challenge.append(
        group('Handling & boosts', Object.assign(el('div', 'challenge-basics'), {}), ...toggle('race-nitro', 'Nitro meter', r.nitro, 'Refills slowly and from drift boosts. Hold Shift or Nitro on straights.', (v) => race((q) => { q.nitro = v; })), ...toggle('race-rubber', 'Keep the pack close', r.rubberBand, 'Cars behind you speed up a little and cars ahead ease off, so every race stays close.', (v) => race((q) => { q.rubberBand = v; }))),
        group('Track pickups', ...checks('race-pickup', PICKUP_NOTES, r.pickups, (v) => race((q) => { q.pickups = v as RaceSettings['pickups']; }))),
        group('Replay', ...toggle('race-ghost', 'Best-lap ghost', r.ghost, 'Records your best lap and races it as a translucent car. Share it as a link from the results.', (v) => race((q) => { q.ghost = v; }))),
      );
      roots.challenge.firstElementChild!.querySelector('.challenge-basics')!.append(select('race-handling', 'Handling', [['drift', 'Drift · slide and charge a boost'], ['grip', 'Grip · brake and steer']], r.handling, (v) => race((q) => { q.handling = v as RaceSettings['handling']; }), 'Hold Space or Drift while steering at speed. Release for a boost.'));
    }
    if (mode === 'runner' && p.runner) {
      const r = p.runner, goal = r.goal;
      m.append(group('Choose the course', grid('location-choices', 'Course', RUNNER_THEMES.map((t) => card({ pressed: r.theme === t, title: THEMES[t].name, note: THEMES[t].note, art: themeArt(t), location: true, on: () => runner((q) => { q.theme = t; }) }))), 'Straights, corners, junctions and gaps are generated as you run, and get harder with distance.'),
        group('Give your runner a goal', Object.assign(el('div', 'challenge-basics'), {})));
      m.lastElementChild!.querySelector('.challenge-basics')!.append(
        select('runner-goal', 'Goal', [['endless', 'Endless · beat your best'], ['distance', 'Run a distance'], ['coins', 'Collect coins'], ['score', 'Reach a score']], goal.type, (v) => runner((q) => { q.goal = v === 'endless' ? { type: 'endless' } : { type: v as 'distance', target: v === 'coins' ? 200 : v === 'score' ? 20000 : 2000 }; }), 'With chapters, reaching the goal opens the next stage.'),
        ...(goal.type === 'endless' ? [] : [number('runner-target', goal.type === 'distance' ? 'Metres' : goal.type === 'coins' ? 'Coins' : 'Points', goal.target, goal.type === 'coins' ? 10 : 100, 100000, (v) => runner((q) => { q.goal = { type: goal.type, target: v ?? 0 }; }))]));
      roots.cast.append(group('Who’s chasing?', Object.assign(el('div', 'challenge-basics'), {}), 'The chaser closes in after each stumble; two stumbles close together and you are caught. Dress the chaser under Chaser below.'));
      roots.cast.firstElementChild!.querySelector('.challenge-basics')!.append(select('runner-chaser', 'Chaser', [['none', 'Nobody · run free'], ...p.enemies.map((e) => [e.id, e.character.name || e.id] as [string, string])], r.chaser, (v) => runner((q) => { q.chaser = v; })));
      roots.challenge.append(
        group('Pace', Object.assign(el('div', 'challenge-basics'), {}), 'Speed rises from the start pace to the top pace as the run goes on.'),
        group('Obstacles', ...checks('runner-obstacle', OBSTACLE_NOTES, r.obstacles, (v) => runner((q) => { q.obstacles = v as RunnerSettings['obstacles']; }))),
        group('Power-ups', ...checks('runner-power', POWER_NOTES, r.powerUps, (v) => runner((q) => { q.powerUps = v as RunnerSettings['powerUps']; }))),
        group('Second chances', ...toggle('runner-revive', 'Revive with coins', r.revive, 'Continue a run for coins; the price doubles each time.', (v) => runner((q) => { q.revive = v; })), Object.assign(el('div', 'challenge-basics'), {})),
      );
      roots.challenge.firstElementChild!.querySelector('.challenge-basics')!.append(
        select('runner-start', 'Start pace', [6, 8, 10, 12, 14, 16, 18, 20].map((v) => [String(v), `${v} m/s · ${Math.round(v * 3.6)} km/h`]), String(r.startSpeed), (v) => runner((q) => { q.startSpeed = Number(v);q.maxSpeed = Math.max(q.maxSpeed, q.startSpeed); })),
        select('runner-max', 'Top pace', [12, 16, 20, 24, 26, 30, 35, 40].filter((v) => v >= r.startSpeed).map((v) => [String(v), `${v} m/s · ${Math.round(v * 3.6)} km/h`]), String(r.maxSpeed), (v) => runner((q) => { q.maxSpeed = Number(v); })),
        select('runner-ramp', 'Speed ramp', [['gentle', 'Gentle'], ['steady', 'Steady'], ['steep', 'Steep']], r.speedRamp, (v) => runner((q) => { q.speedRamp = v as RunnerSettings['speedRamp']; })));
      roots.challenge.lastElementChild!.querySelector('.challenge-basics')!.append(number('runner-seed', 'Course seed', r.seed, 0, 2_147_483_647, (v) => runner((q) => { if (v === undefined) delete q.seed;else q.seed = v; }), 'New course every run'));
    }
    roots.mission.append(note);
  }
  return { paint };
}
