/**
 * Game setup for race and runner games, laid out like missions: Mission chooses the mode, circuit or course and
 * the format; Cast chooses the car, the field or the chaser; Challenge sets the rules, pickups and pace; Atmosphere
 * keeps the music. Mission-only controls are hidden while an arcade mode is chosen. Every change goes through the
 * same strict parsers as imported JSON.
 */
import type { PlayProject } from '../project';
import { TRACK_GROUNDS, TRACK_TEMPLATES, TRACK_THEME_NAMES, buildTrack, type CustomTrack, type TrackTemplate } from './track';
import { CAR_STATS } from './race';
import { ICONS, iconSvg } from './icons';
import { MAX_RUNNER_OBJECTS, RUNNER_GENERIC_ICONS, RUNNER_ICON_NAMES, RUNNER_OBJECT_NAMES, RUNNER_OBJECT_TYPES, runnerObject, type RunnerObject, type RunnerObjectIcon, type RunnerObjectType } from './objects';
import { DEFAULT_RUNNER_MEDALS } from './medals';
import { defaultRace, defaultRunner, parseRace, parseRunner, RACE_CARS, RUNNER_THEMES, RUNNER_THEME_NAMES, retitle, runnerMedalTargets, type PlayMode, type RaceSettings, type RunnerSettings } from './modes';

const MODES: { id: PlayMode; title: string; lines: [string, string] }[] = [
  { id: 'mission', title: 'Mission', lines: ['Staged goals.', 'Sneak, fight, escape.'] },
  { id: 'race', title: 'Arcade race', lines: ['Laps against rivals.', 'Drift, boost, win.'] },
  { id: 'runner', title: 'Endless runner', lines: ['Three lanes.', 'Jump, slide, turn.'] },
];
const THEMES: Record<string, { name: string; note: string; ground: string; path: string; side: string }> = {
  'temple-ruins': { name: RUNNER_THEME_NAMES['temple-ruins'], note: 'Stone paths & jungle pillars', ground: '#cfdcc0', path: '#b3a98e', side: '#8f876f' },
  'city-rooftops': { name: RUNNER_THEME_NAMES['city-rooftops'], note: 'Concrete roofs above the streets', ground: '#cfd8de', path: '#8c9096', side: '#b9b6ad' },
  'desert-canyon': { name: RUNNER_THEME_NAMES['desert-canyon'], note: 'Sand trails between rock walls', ground: '#ead8b8', path: '#cfa36b', side: '#a8683f' },
  'market-street': { name: RUNNER_THEME_NAMES['market-street'], note: 'Stalls, awnings, minibuses and tricycles', ground: '#e4d6c3', path: '#7a756e', side: '#e0a03a' },
  'snowy-peaks': { name: RUNNER_THEME_NAMES['snowy-peaks'], note: 'Icicles, ice blocks and ice caves', ground: '#e6eef5', path: '#f4f8fb', side: '#9fc9dd' },
  'beach-boardwalk': { name: RUNNER_THEME_NAMES['beach-boardwalk'], note: 'Piers, palms and gaps over the sea', ground: '#cfe9f2', path: '#c49764', side: '#2a8fb0' },
  'neon-city': { name: RUNNER_THEME_NAMES['neon-city'], note: 'Night rooftops under neon signs', ground: '#2a1840', path: '#2a2d36', side: '#ff3fa4' },
  'jungle-ruins': { name: RUNNER_THEME_NAMES['jungle-ruins'], note: 'Vines, idols and broken bridges', ground: '#cfdcc0', path: '#8d8a74', side: '#3f7d36' },
  'train-yard': { name: RUNNER_THEME_NAMES['train-yard'], note: 'Moving trains, tunnels and platforms', ground: '#d6dade', path: '#6b655c', side: '#d8b23a' },
  volcano: { name: RUNNER_THEME_NAMES.volcano, note: 'Lava gaps and falling rocks', ground: '#4a2e2a', path: '#2c2624', side: '#ff6a1a' },
  'haunted-forest': { name: RUNNER_THEME_NAMES['haunted-forest'], note: 'Graves, fog and fireflies at night', ground: '#2a3038', path: '#4a3f33', side: '#8c8f92' },
};
const TRACK_GROUND: Record<string, string> = { city: '#dfe5d6', desert: '#ead8b8', harbour: '#d6dfe3', forest: '#cfdcc0', snow: '#eef3f8', beach: '#f0e2bf', neon: '#2a2240', jungle: '#bfd6b4', lagoon: '#d2dccf', mountain: '#d0dcc4', stadium: '#c8dcbc' };
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
  /** Bronze, silver and gold score targets; each stays above the one before. */
  const medalTargets = (r: RunnerSettings) => {
    const t = runnerMedalTargets(r)!, row = el('div', 'runner-medal-targets');
    for (const key of ['bronze', 'silver', 'gold'] as const) row.append(number(`runner-medal-${key}`, `${key[0].toUpperCase()}${key.slice(1)} · points`, t[key], 1, 1_000_000, (v) => runner((q) => {
      const next = { ...runnerMedalTargets(q)!, [key]: v ?? DEFAULT_RUNNER_MEDALS[key] };
      if (key !== 'gold' && next.silver <= next.bronze) next.silver = next.bronze + 1;if (next.gold <= next.silver) next.gold = next.silver + 1;
      if (key !== 'bronze' && next.bronze >= next.silver) next.bronze = Math.max(1, next.silver - 1);
      q.medals = next;
    })));
    return row;
  };
  /** The runner's objects to find: type, name, icon, count and clue for each, in the order they appear. */
  const objectsGroup = (r: RunnerSettings) => {
    const list = r.objects ?? [], required = r.goal.type === 'objects', edit = (fn: (objects: RunnerObject[]) => void) => runner((q) => { const objects = q.objects ?? [];fn(objects);if (objects.length) q.objects = objects;else delete q.objects; });
    const g = group('Objects to find', required ? 'Find every object to complete the run. They appear one at a time, in this order; a missed one turns up again further on.' : 'Optional bonus finds worth 250 points each. Choose Find objects as the goal to make them the aim of the run.');
    list.forEach((o, i) => {
      const box = el('div', 'chain-card runner-object'), head = el('div', 'chain-head'), art = el('span', 'runner-object-icon', iconSvg(o.icon, 1.7));
      const type = el('select');type.setAttribute('aria-label', `Object ${i + 1} type`);for (const t of RUNNER_OBJECT_TYPES) type.add(new Option(RUNNER_OBJECT_NAMES[t], t, false, t === o.type));
      // A new type brings its own name and icon unless the creator renamed the object or chose another icon.
      type.onchange = () => edit((q) => { const t = type.value as RunnerObjectType, was = q[i];q[i] = { ...was, type: t, name: was.name === RUNNER_OBJECT_NAMES[was.type] ? RUNNER_OBJECT_NAMES[t] : was.name, icon: was.icon === was.type ? t : was.icon }; });
      head.append(art, type);
      for (const [text, title, disabled, act] of [['↑', 'Move earlier', i === 0, (q: RunnerObject[]) => { [q[i - 1], q[i]] = [q[i], q[i - 1]]; }], ['↓', 'Move later', i === list.length - 1, (q: RunnerObject[]) => { [q[i + 1], q[i]] = [q[i], q[i + 1]]; }], ['×', 'Remove object', required && list.length === 1, (q: RunnerObject[]) => { q.splice(i, 1); }]] as const) {
        const b = el('button', 'quiet');b.type = 'button';b.textContent = text;b.title = title;b.setAttribute('aria-label', `${title}: ${o.name}`);b.disabled = disabled;b.onclick = () => edit(act);head.append(b);
      }
      const name = el('input');Object.assign(name, { type: 'text', maxLength: 40, value: o.name, placeholder: RUNNER_OBJECT_NAMES[o.type] });name.setAttribute('aria-label', `Object ${i + 1} name`);
      name.onchange = () => edit((q) => { q[i] = { ...q[i], name: name.value.trim() || RUNNER_OBJECT_NAMES[q[i].type] }; });
      const icon = el('select');icon.setAttribute('aria-label', `Object ${i + 1} icon`);
      for (const [label, ids] of [['This object', [o.type]], ['Objects', RUNNER_OBJECT_TYPES.filter((t) => t !== o.type)], ['Clues & symbols', RUNNER_GENERIC_ICONS]] as const) { const og = el('optgroup');og.label = label;for (const id of ids) og.append(new Option(RUNNER_ICON_NAMES[id], id, false, id === o.icon));icon.append(og); }
      icon.onchange = () => edit((q) => { q[i] = { ...q[i], icon: icon.value as RunnerObjectIcon }; });
      const count = el('select');count.setAttribute('aria-label', `Object ${i + 1} pieces`);for (let n = 1; n <= 10; n++) count.add(new Option(n === 1 ? 'One' : `${n} pieces`, String(n), false, n === o.count));
      count.onchange = () => edit((q) => { q[i] = { ...q[i], count: Number(count.value) }; });
      const row = el('div', 'runner-object-row');row.append(icon, count);
      const clue = el('input');Object.assign(clue, { type: 'text', maxLength: 160, value: o.clue ?? '', placeholder: 'Clue shown when found (optional)' });clue.setAttribute('aria-label', `Object ${i + 1} clue`);
      clue.onchange = () => edit((q) => { const next = { ...q[i] }, text = clue.value.trim();if (text) next.clue = text;else delete next.clue;q[i] = next; });
      box.append(head, name, row, clue);g.append(box);
    });
    const add = el('button', 'quiet');add.type = 'button';add.textContent = '+ Add object';add.disabled = list.length >= MAX_RUNNER_OBJECTS;
    add.onclick = () => edit((q) => { const used = new Set(q.map((o) => o.type));q.push(runnerObject(RUNNER_OBJECT_TYPES.find((t) => !used.has(t)) ?? 'gem')); });
    g.append(add);return g;
  };
  function apply(edit: (p: PlayProject) => void) {
    const p = draft(), before = { race: structuredClone(p.race), runner: structuredClone(p.runner), mode: p.mode, identity: { ...p.identity } };
    try {
      edit(p);
      if (p.mode === 'race') p.race = parseRace(p.race);
      if (p.mode === 'runner') p.runner = parseRunner(p.runner, p.enemies.map((e) => e.id));
      retitle(p);note.textContent = '';
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
    const m = roots.mission;m.replaceChildren(group('What kind of game?', grid('goal-choices', 'Game mode', MODES.map((x) => card({ pressed: mode === x.id, title: x.title, note: `${x.lines[0]}<br>${x.lines[1]}`, art: svg(`<path d="${ICONS[x.id]}"/>`), data: x.id, on: () => setMode(x.id) }))), ...(shared ? ['Each chapter plays its own mode, so a campaign can mix missions, races and runs.'] : [])));
    roots.cast.replaceChildren();roots.challenge.replaceChildren();
    if (mode === 'race' && p.race) {
      const r = p.race, custom = typeof r.track === 'string' ? undefined : r.track;
      m.append(group('Pick a circuit', grid('location-choices', 'Circuit', [
        ...TRACK_TEMPLATES.map((t) => card({ pressed: r.track === t.id, title: t.name, note: `${(buildTrack(t).length / 1000).toFixed(1)} km · ${TRACK_THEME_NAMES[t.theme]}${TRACK_GROUNDS[t.theme].follow ? ' · hills' : ''}${TRACK_GROUNDS[t.theme].traction === 'icy' ? ' · icy' : ''}${t.ramps?.length ? ' · jumps' : ''}${t.shortcuts?.length ? ' · shortcut' : ''}`, art: trackArt(t), location: true, on: () => race((q) => { q.track = t.id; }) })),
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
        group('Medals', ...toggle('race-medals', 'Podium medals', r.medals !== false, 'Gold, silver or bronze for finishing first, second or third. The best medal for each race is kept.', (v) => race((q) => { if (v) delete q.medals;else q.medals = false; }))),
        group('Replay', ...toggle('race-ghost', 'Best-lap ghost', r.ghost, 'Records your best lap and races it as a translucent car. Share it as a link from the results.', (v) => race((q) => { q.ghost = v; }))),
      );
      roots.challenge.firstElementChild!.querySelector('.challenge-basics')!.append(select('race-handling', 'Handling', [['drift', 'Drift · slide and charge a boost'], ['grip', 'Grip · brake and steer']], r.handling, (v) => race((q) => { q.handling = v as RaceSettings['handling']; }), 'Hold Space or Drift while steering at speed. Release for a boost.'),
        select('race-traction', 'Road surface', [['auto', 'As the circuit · icy on snow'], ['normal', 'Normal grip'], ['icy', 'Icy · cars slide wide']], r.traction ?? 'auto', (v) => race((q) => { if (v === 'auto') delete q.traction;else q.traction = v as 'normal' | 'icy'; })));
    }
    if (mode === 'runner' && p.runner) {
      const r = p.runner, goal = r.goal;
      m.append(group('Choose the course', grid('location-choices', 'Course', RUNNER_THEMES.map((t) => card({ pressed: r.theme === t, title: THEMES[t].name, note: THEMES[t].note, art: themeArt(t), location: true, on: () => runner((q) => { q.theme = t; }) }))), 'Straights, corners, junctions and gaps are generated as you run, and get harder with distance.'),
        group('Give your runner a goal', Object.assign(el('div', 'challenge-basics'), {})));
      m.lastElementChild!.querySelector('.challenge-basics')!.append(
        select('runner-goal', 'Goal', [['endless', 'Endless · beat your best'], ['distance', 'Run a distance'], ['coins', 'Collect coins'], ['score', 'Reach a score'], ['objects', 'Find objects']], goal.type, (v) => runner((q) => {
          if (v === 'objects') { q.goal = { type: 'objects' };if (!q.objects?.length) q.objects = [runnerObject('dossier')]; }
          else q.goal = v === 'endless' ? { type: 'endless' } : { type: v as 'distance', target: v === 'coins' ? 200 : v === 'score' ? 20000 : 2000 };
        }), 'With chapters, reaching the goal opens the next stage.'),
        ...(goal.type === 'endless' || goal.type === 'objects' ? [] : [((t) => number('runner-target', t.type === 'distance' ? 'Metres' : t.type === 'coins' ? 'Coins' : 'Points', t.target, t.type === 'coins' ? 10 : 100, 100000, (v) => runner((q) => { q.goal = { type: t.type, target: v ?? 0 }; })))(goal)]));
      m.append(objectsGroup(r));
      roots.cast.append(group('Who’s chasing?', Object.assign(el('div', 'challenge-basics'), {}), 'The chaser closes in after each stumble; two stumbles close together and you are caught. Dress the chaser under Chaser below.'));
      roots.cast.firstElementChild!.querySelector('.challenge-basics')!.append(select('runner-chaser', 'Chaser', [['none', 'Nobody · run free'], ...p.enemies.map((e) => [e.id, e.character.name || e.id] as [string, string])], r.chaser, (v) => runner((q) => { q.chaser = v; })));
      roots.challenge.append(
        group('Pace', Object.assign(el('div', 'challenge-basics'), {}), 'Speed rises from the start pace to the top pace as the run goes on.'),
        group('Obstacles', ...checks('runner-obstacle', OBSTACLE_NOTES, r.obstacles, (v) => runner((q) => { q.obstacles = v as RunnerSettings['obstacles']; }))),
        group('Power-ups', ...checks('runner-power', POWER_NOTES, r.powerUps, (v) => runner((q) => { q.powerUps = v as RunnerSettings['powerUps']; }))),
        group('Medals', ...toggle('runner-medals', 'Score medals', r.medals !== false, `Bronze, silver and gold for reaching each score in one run${r.goal.type === 'endless' ? '' : ', once the goal is reached'}. The best medal for each stage is kept.`, (v) => runner((q) => { if (v) delete q.medals;else q.medals = false; })), ...(r.medals === false ? [] : [medalTargets(r)])),
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
