/**
 * Arcade HUD and cards, created once inside the stage so the creator preview and exported games share them:
 * race position, laps, sector deltas, speed, nitro, drift charge, item slot and minimap; runner score, coins,
 * distance, power-up timers, missions and the chaser warning; plus start, pause and result cards and touch buttons.
 */
import './arcade.css';
import type { RaceGame } from './race';
import type { RunnerGame } from './runner';
import type { Track } from './track';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => { const e = document.createElement(tag);if (className) e.className = className;if (text) e.textContent = text;return e; };
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
export const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const POWER_LABELS = { magnet: 'Magnet', shield: 'Shield', boost: 'Boost', multiplier: '×2 Score' } as const;

export class ArcadeHud {
  readonly root = el('div', 'arcade-ui');
  readonly top = el('div', 'arcade-top'); readonly big = el('div', 'arcade-big'); readonly lines = el('div', 'arcade-lines');
  readonly center = el('div', 'arcade-center'); readonly message = el('div', 'arcade-message'); readonly warning = el('div', 'arcade-warning');
  readonly gauge = el('div', 'arcade-gauge'); readonly speed = el('div', 'arcade-speedo'); readonly meters = el('div', 'arcade-meters');
  readonly side = el('div', 'arcade-side'); readonly map = el('canvas', 'arcade-map');
  readonly card = el('section', 'card arcade-card'); readonly touch = el('div', 'arcade-touch');
  private mapBase?: { canvas: HTMLCanvasElement; scale: number; cx: number; cz: number }; private messageTimer = 0; private bars = new Map<string, HTMLElement>();
  constructor(stage: HTMLElement) {
    this.card.setAttribute('role', 'region');this.card.setAttribute('aria-live', 'polite');
    this.top.append(this.big, this.lines);this.center.append(this.message, this.warning);this.gauge.append(this.speed, this.meters);this.side.append(this.map);
    this.root.append(this.top, this.side, this.center, this.gauge, this.touch, this.card);this.root.hidden = true;
    stage.append(this.root);
  }
  /** A short centred message, e.g. GO, BEST LAP or CLOSE CALL. */
  say(text: string, seconds = 1.2, tone: 'normal' | 'good' | 'bad' = 'normal') { this.message.textContent = text;this.message.dataset.tone = tone;this.message.classList.remove('pop');void this.message.offsetWidth;this.message.classList.add('pop');this.messageTimer = seconds; }
  tick(dt: number) { this.messageTimer -= dt;if (this.messageTimer <= 0 && this.message.textContent) this.message.textContent = ''; }
  meter(id: string, label: string, value: number, tone = '') {
    let bar = this.bars.get(id);
    if (!bar) { bar = el('div', 'arcade-meter');bar.append(el('span', '', label), el('i'));this.meters.append(bar);this.bars.set(id, bar); }
    bar.hidden = value < 0;bar.dataset.tone = tone;(bar.lastElementChild as HTMLElement).style.setProperty('--fill', `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`);(bar.firstElementChild as HTMLElement).textContent = label;
  }
  clearMeters() { this.meters.replaceChildren();this.bars.clear(); }
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
  resetMap() { this.mapBase = undefined;this.missionKey = '';this.side.replaceChildren(this.map);this.lines.replaceChildren(); }
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
  }
  /** A card with a heading, body lines and buttons; buttons return focusable elements for keyboard use. */
  /** A card with a heading, body lines and buttons. The briefing card sits where the mission briefing sits; results and pause are centred. */
  show(kicker: string, title: string, body: (string | HTMLElement)[], actions: { label: string; primary?: boolean; run: () => void; disabled?: boolean }[], place: 'brief' | 'center' = 'center') {
    this.card.replaceChildren(el('span', 'eyebrow', kicker), el('h1', '', title));this.card.dataset.place = place;
    for (const line of body) this.card.append(typeof line === 'string' ? el('p', '', line) : line);
    const row = el('div', 'arcade-actions');
    for (const a of actions) { const b = el('button', a.primary ? 'primary' : 'quiet');b.type = 'button';b.disabled = !!a.disabled;b.onclick = a.run;b.append(el('span', '', a.label));if (a.primary) b.append(Object.assign(el('span', '', '→'), { ariaHidden: 'true' }));row.append(b); }
    this.card.append(row);this.card.hidden = false;
    (row.querySelector('button.primary:not(:disabled)') as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }
  hideCard() { this.card.hidden = true; }
  /** Two-column rows like the mission result's score breakdown. */
  breakdown(rows: [string, string][]) { const d = el('div', 'score-breakdown');for (const [k, v] of rows) d.append(el('span', '', k), el('strong', '', v));return d; }
  private help = { desktop: el('span', 'arcade-help'), touch: el('span', 'arcade-help') };
  /** Footer help in the mission style: keys as <kbd> pairs on desktop, one line on touch screens. */
  setHelp(keys: [string, string][], touch: string) {
    const footer = document.querySelector('footer'), desktop = footer?.querySelector('.desktop-help'), touchHelp = footer?.querySelector('.touch-help');
    this.help.desktop.replaceChildren(...keys.flatMap(([k, t]) => [el('kbd', '', k), document.createTextNode(` ${t} `)]));this.help.touch.textContent = touch;
    if (desktop && !this.help.desktop.parentElement) desktop.append(this.help.desktop);
    if (touchHelp && !this.help.touch.parentElement) touchHelp.after(this.help.touch);
  }  table(rows: string[][], header?: string[]) {
    const t = el('table', 'arcade-table');
    if (header) { const h = el('tr');for (const c of header) h.append(el('th', '', c));t.append(h); }
    for (const r of rows) { const tr = el('tr');for (const c of r) tr.append(el('td', '', c));t.append(tr); }
    return t;
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
