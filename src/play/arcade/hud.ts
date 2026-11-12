/**
 * Arcade HUD and cards, created once inside the stage so the creator preview and exported games share them:
 * race position, laps, sector deltas, speed, nitro, drift charge, item slot and minimap; runner score, coins,
 * distance, power-up timers, missions, objects to find and the chaser warning; plus start, pause and result cards and touch buttons.
 */
import './arcade.css';
import type { RaceGame } from './race';
import type { RunnerGame } from './runner';
import { iconSvg } from './icons';
import type { RunnerObject } from './objects';
import type { Track } from './track';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const e = document.createElement(tag);if (className) e.className = className;if (text) e.textContent = text;return e; };
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
export const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
export type Tone = 'good' | 'bad' | 'hot' | '';
export interface Standing { place: number; name: string; color: string; time: string; gap: string; you: boolean }
export interface CardAction { label: string; primary?: boolean; run: () => void; disabled?: boolean }
const POWER_LABELS = { magnet: 'Magnet', shield: 'Shield', boost: 'Boost', multiplier: '×2 Score' } as const;

export class ArcadeHud {
  readonly root = el('div', 'arcade-ui');
  readonly top = el('div', 'arcade-top'); readonly big = el('div', 'arcade-big'); readonly lines = el('div', 'arcade-lines');
  readonly center = el('div', 'arcade-center'); readonly message = el('div', 'arcade-message'); readonly warning = el('div', 'arcade-warning');
  readonly gauge = el('div', 'arcade-gauge'); readonly speed = el('div', 'arcade-speedo'); readonly meters = el('div', 'arcade-meters');
  readonly side = el('div', 'arcade-side'); readonly map = el('canvas', 'arcade-map');
  readonly card = el('section', 'card arcade-card'); readonly touch = el('div', 'arcade-touch');
  readonly finds = el('div', 'arcade-finds'); readonly found = el('div', 'arcade-found');
  private findsKey = ''; private foundTimer = 0;
  private mapBase?: { canvas: HTMLCanvasElement; scale: number; cx: number; cz: number }; private messageTimer = 0; private meterBars = new Map<string, HTMLElement>();
  constructor(stage: HTMLElement) {
    this.card.setAttribute('role', 'region');this.card.setAttribute('aria-live', 'polite');
    this.top.append(this.big, this.lines);this.center.append(this.message, this.warning, this.found);this.found.hidden = true;this.gauge.append(this.speed, this.meters);this.side.append(this.map);
    this.root.append(this.top, this.finds, this.side, this.center, this.gauge, this.touch, this.card);this.root.hidden = true;
    stage.append(this.root);
  }
  /** A short centred message, e.g. GO, BEST LAP or CLOSE CALL. */
  say(text: string, seconds = 1.2, tone: 'normal' | 'good' | 'bad' = 'normal') { this.message.textContent = text;this.message.dataset.tone = tone;this.message.classList.remove('pop');void this.message.offsetWidth;this.message.classList.add('pop');this.messageTimer = seconds; }
  tick(dt: number) {
    this.messageTimer -= dt;if (this.messageTimer <= 0 && this.message.textContent) this.message.textContent = '';
    this.foundTimer -= dt;if (this.foundTimer <= 0 && !this.found.hidden) this.found.hidden = true;
  }
  /** The object just found: its icon, name and clue, held long enough to read the clue. */
  showFound(o: RunnerObject, kicker: string) {
    const icon = el('span', 'arcade-found-icon');icon.innerHTML = iconSvg(o.icon, 1.6);
    const text = el('div');text.append(el('span', 'eyebrow', kicker), el('strong', '', o.name), ...(o.clue ? [el('p', '', o.clue)] : []));
    this.found.replaceChildren(icon, text);this.found.hidden = false;this.found.classList.remove('pop');void this.found.offsetWidth;this.found.classList.add('pop');
    this.foundTimer = Math.min(6, 2.2 + (o.clue?.length ?? 0) / 28);
  }
  meter(id: string, label: string, value: number, tone = '') {
    let bar = this.meterBars.get(id);
    if (!bar) { bar = el('div', 'arcade-meter');bar.append(el('span', '', label), el('i'));this.meters.append(bar);this.meterBars.set(id, bar); }
    bar.hidden = value < 0;bar.dataset.tone = tone;(bar.lastElementChild as HTMLElement).style.setProperty('--fill', `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`);(bar.firstElementChild as HTMLElement).textContent = label;
  }
  clearMeters() { this.meters.replaceChildren();this.meterBars.clear(); }
  /** Text rows reuse their elements, so the HUD creates nothing per frame. */
  private setLines(rows: [string, string][]) {
    while (this.lines.children.length > rows.length) this.lines.lastElementChild!.remove();
    rows.forEach(([text, className], i) => { const span = (this.lines.children[i] as HTMLElement) ?? this.lines.appendChild(el('span'));if (span.textContent !== text) span.textContent = text;if (span.className !== className) span.className = className; });
  }
  private missionKey = '';
  /** Minimap: the circuit is drawn once; cars are dots each frame. */
  drawMap(track: Track, cars: { x: number; z: number; color: string; player: boolean }[]) {
    const size = 150, dpr = Math.min(devicePixelRatio, 2);
    if (!this.mapBase || this.map.width !== size * dpr) {
      this.map.width = this.map.height = size * dpr;const xs = track.samples.map((s) => s.x), zs = track.samples.map((s) => s.z);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2, scale = (size - 22) / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      const base = el('canvas');base.width = base.height = size * dpr;const c = base.getContext('2d')!;c.scale(dpr, dpr);
      c.strokeStyle = 'rgba(255,255,255,.85)';c.lineWidth = 4;c.lineJoin = 'round';c.beginPath();
      track.samples.forEach((s, i) => { const x = size / 2 - (s.x - cx) * scale, y = size / 2 - (s.z - cz) * scale;if (i) c.lineTo(x, y);else c.moveTo(x, y); });c.closePath();c.stroke();
      const s0 = track.samples[0];c.fillStyle = '#f2efe4';c.fillRect(size / 2 - (s0.x - cx) * scale - 4, size / 2 - (s0.z - cz) * scale - 4, 8, 8);
      this.mapBase = { canvas: base, scale, cx, cz };
    }
    const c = this.map.getContext('2d')!, b = this.mapBase;c.setTransform(1, 0, 0, 1, 0, 0);c.clearRect(0, 0, this.map.width, this.map.height);c.drawImage(b.canvas, 0, 0);c.scale(dpr, dpr);
    for (const car of [...cars].sort((a) => (a.player ? 1 : -1))) { c.fillStyle = car.player ? '#ffd23f' : car.color;c.strokeStyle = '#111';c.lineWidth = 1.5;c.beginPath();c.arc(size / 2 - (car.x - b.cx) * b.scale, size / 2 - (car.z - b.cz) * b.scale, car.player ? 5 : 3.5, 0, Math.PI * 2);c.fill();c.stroke(); }
  }
  resetMap() { this.mapBase = undefined;this.missionKey = '';this.findsKey = '';this.finds.replaceChildren();this.found.hidden = true;this.side.replaceChildren(this.map);this.lines.replaceChildren(); }
  /** Fresh HUD for a new race or run. */
  reset(_place: string) { this.resetMap();this.clearMeters();this.warning.textContent = ''; }
  race(g: RaceGame, ghostDelta?: number) {
    const p = g.player, position = g.position(p), laps = g.settings.laps;
    this.big.textContent = `${position}/${g.cars.length}`;this.big.dataset.label = 'POS';
    const lap = Math.min(laps, p.lap + 1), current = g.status === 'racing' && p.finished === undefined ? g.time - p.lapStart : 0;
    this.setLines([
      [`LAP ${lap}/${laps}`, 'arcade-strong'], [`TIME ${clock(Math.max(0, g.status === 'countdown' ? 0 : p.finished ?? g.time))}`, ''],
      [`LAP ${clock(current)}`, ''], [g.bestLap === undefined ? 'BEST —' : `BEST ${clock(g.bestLap)}`, ''],
      ...(ghostDelta === undefined ? [] : [[`GHOST ${ghostDelta <= 0 ? '−' : '+'}${Math.abs(ghostDelta).toFixed(2)}`, ghostDelta <= 0 ? 'arcade-good' : 'arcade-bad'] as [string, string]]),
    ]);
    this.speed.textContent = `${Math.round(Math.abs(p.speed) * 3.6)}`;this.speed.dataset.unit = 'KM/H';
    this.meter('nitro', 'NITRO', g.settings.nitro ? p.nitro : -1, p.nitroOn ? 'hot' : '');
    this.meter('drift', p.driftCharge >= 2 ? 'DRIFT ●●' : p.driftCharge >= 0.9 ? 'DRIFT ●' : 'DRIFT', g.settings.handling === 'drift' && p.drift ? Math.min(1, p.driftCharge / 2) : -1, p.driftCharge >= 2 ? 'hot' : 'warm');
    this.meter('item', p.item ? `ITEM · ${p.item.toUpperCase()}` : 'ITEM', g.settings.pickups.includes('item-box') ? (p.item ? 1 : 0) : -1, p.item ? 'good' : '');
    this.warning.textContent = p.wrongWay > 0.8 && g.status === 'racing' ? 'WRONG WAY' : '';
    if (g.status === 'countdown') { const n = Math.ceil(g.countdown);this.message.textContent = n <= 3 ? String(n) : 'READY';this.message.dataset.tone = 'normal';this.messageTimer = 0.2; }
    this.drawMap(g.track, g.cars.map((c) => ({ x: c.x, z: c.z, color: c.color, player: !c.ai })));
  }
  runner(g: RunnerGame) {
    this.big.textContent = Math.floor(g.score).toLocaleString();this.big.dataset.label = `×${g.multiplier * (g.power.multiplier > 0 ? 2 : 1)}`;
    this.setLines([[`● ${g.coins}`, 'arcade-strong'], [`${Math.floor(g.distance).toLocaleString()} m`, ''], [`${(g.speed * 3.6).toFixed(0)} km/h`, '']]);
    this.speed.textContent = '';
    for (const kind of ['magnet', 'shield', 'boost', 'multiplier'] as const) this.meter(kind, POWER_LABELS[kind], g.power[kind] > 0 ? g.power[kind] / g.duration(kind) : -1, kind === 'boost' ? 'hot' : 'good');
    this.warning.textContent = g.settings.chaser !== 'none' && g.chaser < 6 && g.status === 'running' ? 'CHASER CLOSE' : '';
    const missions = g.missions, key = missions.map((m) => m.label).join('|');
    if (key !== this.missionKey) { this.missionKey = key;this.side.replaceChildren(...missions.map((m) => { const row = el('div', 'arcade-mission');row.append(el('span', '', m.label), el('i'));return row; })); }
    missions.forEach((_, i) => { const row = this.side.children[i] as HTMLElement;row.dataset.done = String(g.missionsDone[i]);(row.lastElementChild as HTMLElement).style.setProperty('--fill', `${Math.round(g.missionProgress(i) * 100)}%`); });
    // Objects to find: one chip each, dim until found, with a count for objects in several pieces.
    const list = g.settings.objects ?? [], objectsKey = list.map((o) => `${o.icon}:${o.name}:${o.count}`).join('|');
    if (objectsKey !== this.findsKey) { this.findsKey = objectsKey;this.finds.replaceChildren(...list.map((o) => { const chip = el('span', 'arcade-find');chip.title = o.name;chip.setAttribute('aria-label', o.name);chip.innerHTML = iconSvg(o.icon, 1.8);chip.append(el('b'));return chip; })); }
    list.forEach((o, i) => {
      const chip = this.finds.children[i] as HTMLElement, n = Math.min(g.found[i] ?? 0, o.count), text = o.count > 1 ? `${n}/${o.count}` : '', done = String(n >= o.count);
      if (chip.dataset.done !== done) chip.dataset.done = done;const label = chip.lastElementChild!;if (label.textContent !== text) label.textContent = text;
    });
  }
  /**
   * A card with a heading, body and buttons. The briefing card sits where the mission briefing sits; results, garage
   * and shop cards are centred and wide, with a scrolling body and the buttons pinned underneath.
   */
  show(kicker: string, title: string, body: (string | HTMLElement)[], actions: CardAction[], place: 'brief' | 'center' | 'wide' = 'center', aside?: HTMLElement) {
    const head = el('header', 'arcade-card-head'), titles = el('div');titles.append(el('span', 'eyebrow', kicker), el('h1', '', title));head.append(titles);if (aside) head.append(aside);
    const content = el('div', 'arcade-card-body');for (const line of body) content.append(typeof line === 'string' ? el('p', '', line) : line);
    const row = el('div', 'arcade-actions');
    for (const a of actions) { const b = el('button', a.primary ? 'primary' : 'quiet');b.type = 'button';b.disabled = !!a.disabled;b.onclick = a.run;b.append(el('span', '', a.label));if (a.primary) b.append(Object.assign(el('span', '', '→'), { ariaHidden: 'true' }));row.append(b); }
    this.card.replaceChildren(head, content, row);this.card.dataset.place = place;this.card.hidden = false;
    (row.querySelector('button.primary:not(:disabled)') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }
  hideCard() { this.card.hidden = true; }
  private help = { desktop: el('span', 'arcade-help'), touch: el('span', 'arcade-help') };
  /** Footer help in the mission style: keys as <kbd> pairs on desktop, one line on touch screens. */
  setHelp(keys: [string, string][], touch: string) {
    const footer = document.querySelector('footer'), desktop = footer?.querySelector('.desktop-help'), touchHelp = footer?.querySelector('.touch-help');
    this.help.desktop.replaceChildren(...keys.flatMap(([k, t]) => [el('kbd', '', k), document.createTextNode(` ${t} `)]));this.help.touch.textContent = touch;
    if (desktop && !this.help.desktop.parentElement) desktop.append(this.help.desktop);
    if (touchHelp && !this.help.touch.parentElement) touchHelp.after(this.help.touch);
  }
  // ---- Card pieces: built once when a card opens, never per frame ----
  /** A titled block inside a card. */
  section(title: string, ...children: (string | HTMLElement)[]) { const s = el('section', 'arcade-section');s.append(el('h2', '', title));for (const c of children) s.append(typeof c === 'string' ? el('p', '', c) : c);return s; }
  /** Two columns on wide screens; on phones they stack, leading with the chosen column. */
  columns(left: HTMLElement[], right: HTMLElement[], lead: 'left' | 'right' = 'left') { const d = el('div', 'arcade-columns'), l = el('div'), r = el('div');d.dataset.lead = lead;l.append(...left);r.append(...right);d.append(l, r);return d; }
  /** Big number tiles, e.g. time, best lap and cash. */
  stats(rows: [string, string, Tone?][]) { const d = el('div', 'arcade-stats');for (const [k, v, tone] of rows) { const s = el('div');if (tone) s.dataset.tone = tone;s.append(el('span', '', k), el('strong', '', v));d.append(s); } return d; }
  /** The chapter briefing as a quoted panel. */
  briefing(text: string, label = 'BRIEFING') { const d = el('div', 'arcade-briefing');d.append(el('span', '', label), el('p', '', text));return d; }
  /** Every chapter in order: finished ones ticked, the current one highlighted. */
  progress(items: { label: string; state: 'done' | 'current' | 'next' }[]) {
    const list = el('ol', 'arcade-progress');
    items.forEach((item, i) => { const li = el('li');li.dataset.state = item.state;li.append(el('b', '', item.state === 'done' ? '✓' : String(i + 1)), el('span', '', item.label));list.append(li); });
    return list;
  }
  /** Highlights such as a new best lap. */
  badges(texts: string[]) { const d = el('div', 'arcade-badges');for (const t of texts) d.append(el('span', '', t));return d; }
  /** A large figure beside the card title, e.g. cash in the garage. */
  aside(label: string, value: string) { const d = el('div', 'arcade-card-aside');d.append(el('span', '', label), el('strong', '', value));return d; }
  /** The top three on steps, second–first–third. */
  podium(top: Standing[]) {
    const d = el('div', 'arcade-podium');
    for (const place of [2, 1, 3]) {
      const s = top[place - 1];if (!s) continue;const step = el('div');step.dataset.place = String(place);if (s.you) step.dataset.you = 'true';
      const swatch = el('i');swatch.style.background = s.color;step.append(el('b', '', String(place)), swatch, el('strong', '', s.you ? 'You' : s.name), el('small', '', s.time));d.append(step);
    }
    return d;
  }
  /** The finishing order with car colours, times and gaps to the winner. */
  standings(rows: Standing[]) {
    const list = el('ol', 'arcade-standings');
    for (const r of rows) {
      const li = el('li');if (r.you) li.dataset.you = 'true';const swatch = el('i');swatch.style.background = r.color;
      const who = el('span', '', r.name);if (r.you) who.append(el('em', '', 'YOU'));
      li.append(el('b', '', String(r.place)), swatch, who, el('strong', '', r.time), el('small', '', r.gap));list.append(li);
    }
    return list;
  }
  /** Horizontal bars, e.g. cup points. */
  bars(rows: { name: string; value: number; you?: boolean }[]) {
    const list = el('ol', 'arcade-bars'), max = Math.max(1, ...rows.map((r) => r.value));
    for (const r of rows) { const li = el('li');if (r.you) li.dataset.you = 'true';const bar = el('i');bar.style.setProperty('--fill', `${Math.round((r.value / max) * 100)}%`);li.append(el('span', '', r.name), bar, el('strong', '', String(r.value)));list.append(li); }
    return list;
  }
  /** A selectable tile: icon, name, a status tag and optional stat meters. */
  tile(o: { icon: string; title: string; tag: string; pressed?: boolean; disabled?: boolean; color?: string; meters?: [string, number][]; note?: string; run: () => void }) {
    const b = el('button', 'arcade-tile');b.type = 'button';b.setAttribute('aria-pressed', String(!!o.pressed));b.disabled = !!o.disabled;b.onclick = o.run;
    const art = el('span', 'arcade-tile-art');art.innerHTML = o.icon;if (o.color) art.style.color = o.color;
    const text = el('span', 'arcade-tile-text');text.append(el('strong', '', o.title));if (o.note) text.append(el('small', '', o.note));
    b.append(art, text, el('span', 'arcade-tag', o.tag));if (o.meters) b.append(this.statBars(o.meters));
    return b;
  }
  /** Labelled 0..1 stat bars. */
  statBars(rows: [string, number][]) { const d = el('span', 'arcade-statbars');for (const [k, v] of rows) { const bar = el('i');bar.style.setProperty('--fill', `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`);d.append(el('span', '', k), bar); } return d; }
  /** Level pips, e.g. 3 of 5 upgrades. */
  pips(level: number, max: number) { const d = el('span', 'arcade-pips');d.setAttribute('aria-label', `Level ${level} of ${max}`);for (let i = 0; i < max; i++) d.append(Object.assign(el('i'), { className: i < level ? 'on' : '' }));return d; }
  /** A checklist with progress bars, like the runner missions in the HUD. */
  checklist(rows: { label: string; done: boolean; progress: number }[]) {
    const list = el('ul', 'arcade-checklist');
    for (const r of rows) { const li = el('li');li.dataset.done = String(r.done);const bar = el('i');bar.style.setProperty('--fill', `${Math.round(Math.max(0, Math.min(1, r.progress)) * 100)}%`);li.append(el('b', '', r.done ? '✓' : ''), el('span', '', r.label), bar);list.append(li); }
    return list;
  }
  /** Objects to find with their icons; with counts found, each found object shows its clue. */
  objectList(list: readonly RunnerObject[], found?: readonly number[]) {
    const ul = el('ul', 'arcade-objects');
    list.forEach((o, i) => {
      const n = Math.min(found?.[i] ?? 0, o.count), done = !!found && n >= o.count, li = el('li'), icon = el('span', 'arcade-object-icon');li.dataset.done = String(done);icon.innerHTML = iconSvg(o.icon, 1.7);
      const text = el('div');text.append(el('strong', '', o.name));if (done && o.clue) text.append(el('p', '', o.clue));
      li.append(icon, text, el('b', '', found ? (o.count > 1 ? `${n}/${o.count}` : done ? '✓' : '—') : o.count > 1 ? `×${o.count}` : ''));ul.append(li);
    });
    return ul;
  }
  touchButtons(buttons: { id: string; label: string; hold?: boolean }[], press: (id: string, down: boolean) => void) {
    this.touch.replaceChildren();
    for (const b of buttons) {
      const button = el('button', 'arcade-touch-button', b.label);button.type = 'button';button.dataset.id = b.id;
      button.addEventListener('pointerdown', (e) => { e.preventDefault();button.setPointerCapture(e.pointerId);button.dataset.held = 'true';press(b.id, true); });
      const up = () => { if (button.dataset.held) { delete button.dataset.held;press(b.id, false); } };
      button.addEventListener('pointerup', up);button.addEventListener('pointercancel', up);button.addEventListener('lostpointercapture', up);
      this.touch.append(button);
    }
  }
}
