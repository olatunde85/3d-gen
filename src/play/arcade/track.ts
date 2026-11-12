/**
 * Closed-loop race circuits: built-in templates or JSON control points, sampled into a centre line with tangents,
 * widths, a racing line, sectors and placed features. Everything is flat ground; ramps lift cars visually.
 */
export type TrackTheme = 'city' | 'desert' | 'harbour' | 'forest';
export const TRACK_THEMES: readonly TrackTheme[] = ['city', 'desert', 'harbour', 'forest'];
export type TrackPoint = [number, number];
export interface TrackShortcut { points: TrackPoint[]; width?: number }
export interface TrackTemplate { id: string; name: string; theme: TrackTheme; width: number; points: TrackPoint[]; ramps?: number[]; pads?: number[]; shortcuts?: TrackShortcut[] }
/** Custom JSON circuits: 6 to 64 control points in metres, traced in driving order. */
export interface CustomTrack { name?: string; theme?: TrackTheme; width?: number; points: TrackPoint[] }

export const TRACK_TEMPLATES: readonly TrackTemplate[] = [
  {
    id: 'city-loop', name: 'City Loop', theme: 'city', width: 15,
    points: [[0, 0], [0, 150], [20, 205], [75, 222], [150, 210], [190, 175], [235, 175], [270, 210], [320, 205], [345, 160], [340, 60], [320, 0], [285, -35], [210, -45], [150, -15], [95, -50], [40, -55]],
    ramps: [0.31], pads: [0.06, 0.55, 0.8],
    shortcuts: [{ points: [[190, 175], [205, 140], [235, 140], [235, 175]], width: 9 }],
  },
  {
    id: 'desert-run', name: 'Desert Run', theme: 'desert', width: 17,
    points: [[0, 0], [0, 220], [30, 300], [110, 330], [210, 310], [260, 250], [255, 170], [215, 120], [235, 60], [290, 30], [320, -40], [290, -110], [200, -130], [110, -100], [40, -60]],
    ramps: [0.12, 0.58], pads: [0.04, 0.43, 0.7],
  },
  {
    id: 'harbour-sprint', name: 'Harbour Sprint', theme: 'harbour', width: 14,
    points: [[0, 0], [0, 120], [25, 160], [70, 165], [95, 130], [130, 115], [190, 130], [230, 175], [285, 170], [300, 110], [270, 55], [280, 0], [250, -55], [180, -60], [130, -25], [75, -45], [25, -40]],
    ramps: [0.66], pads: [0.08, 0.36, 0.86],
  },
  {
    id: 'forest-ring', name: 'Forest Ring', theme: 'forest', width: 15,
    points: [[0, 0], [5, 110], [-20, 175], [10, 240], [80, 265], [150, 240], [175, 180], [230, 150], [285, 170], [330, 130], [320, 50], [270, 10], [260, -60], [200, -100], [120, -90], [60, -55]],
    ramps: [0.47], pads: [0.1, 0.62, 0.9],
  },
];
export const TRACK_IDS = TRACK_TEMPLATES.map((t) => t.id);

export interface TrackSample { x: number; z: number; tx: number; tz: number; s: number; curvature: number; line: number }
export interface Shortcut { samples: { x: number; z: number; s: number }[]; width: number }
export interface Track {
  id: string; name: string; theme: TrackTheme; width: number; length: number; samples: TrackSample[]; spacing: number;
  ramps: number[]; pads: { s: number; lateral: number }[]; items: { s: number; lateral: number }[]; hazards: { s: number; lateral: number }[];
  shortcuts: Shortcut[]; sectors: [number, number, number];
}

const catmull = (a: number, b: number, c: number, d: number, t: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);

/** Sample a closed Catmull-Rom loop at roughly `step` metres. */
function sampleLoop(points: TrackPoint[], step: number) {
  const dense: { x: number; z: number }[] = [], n = points.length;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const steps = Math.max(4, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / (step / 4)));
    for (let k = 0; k < steps; k++) { const t = k / steps; dense.push({ x: catmull(p0[0], p1[0], p2[0], p3[0], t), z: catmull(p0[1], p1[1], p2[1], p3[1], t) }); }
  }
  // Resample at even spacing so progress and speeds are uniform.
  const out: { x: number; z: number }[] = [dense[0]];let carry = 0;
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];let seg = Math.hypot(b.x - a.x, b.z - a.z), t0 = 0;
    while (carry + seg - t0 >= step) { t0 += step - carry; carry = 0; const f = t0 / seg; out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }); }
    carry += seg - t0;
  }
  if (Math.hypot(out[0].x - out.at(-1)!.x, out[0].z - out.at(-1)!.z) < step * 0.5) out.pop();
  return out;
}

export function trackTemplate(id: string) { return TRACK_TEMPLATES.find((t) => t.id === id); }

/** Signed curvature from three neighbours (+ turns left). */
function curvature(a: { x: number; z: number }, b: { x: number; z: number }, c: { x: number; z: number }) {
  const abx = b.x - a.x, abz = b.z - a.z, bcx = c.x - b.x, bcz = c.z - b.z, cross = abx * bcz - abz * bcx;
  const la = Math.hypot(abx, abz), lb = Math.hypot(bcx, bcz), lc = Math.hypot(c.x - a.x, c.z - a.z);
  return la * lb * lc > 1e-9 ? (-2 * cross) / (la * lb * lc) : 0;
}

export function buildTrack(source: TrackTemplate | (CustomTrack & { id?: string })): Track {
  const step = 2, raw = sampleLoop(source.points, step), n = raw.length, width = source.width ?? 15;
  const samples: TrackSample[] = raw.map((p, i) => {
    const prev = raw[(i - 1 + n) % n], next = raw[(i + 1) % n], len = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
    return { x: p.x, z: p.z, tx: (next.x - prev.x) / len, tz: (next.z - prev.z) / len, s: i * step, curvature: curvature(prev, p, next), line: 0 };
  });
  // Racing line: smooth curvature, then move toward the inside of each corner (left is +).
  const smooth = (values: number[], radius: number) => values.map((_, i) => { let sum = 0; for (let k = -radius; k <= radius; k++) sum += values[(i + k + n) % n]; return sum / (radius * 2 + 1); });
  const bend = smooth(samples.map((s) => s.curvature), 12), line = smooth(bend.map((k) => Math.max(-1, Math.min(1, k * 40)) * width * 0.32), 10);
  samples.forEach((s, i) => { s.line = line[i]; });
  const length = n * step, at = (f: number) => ((f % 1) + 1) % 1 * length;
  // Pads and items sit on the straightest stretches; templates choose ramp and pad positions explicitly.
  const straight = samples.map((_, i) => ({ i, k: Math.abs(bend[i]) })).sort((a, b) => a.k - b.k);
  const spaced = (count: number, from: number) => { const picks: number[] = []; for (const c of straight.slice(from)) { const s = c.i * step; if (picks.every((p) => Math.min(Math.abs(p - s), length - Math.abs(p - s)) > length / (count * 2.2)) && s > 40 && s < length - 30) picks.push(s); if (picks.length === count) break; } return picks.sort((a, b) => a - b); };
  const template = 'id' in source && source.id ? trackTemplate(source.id) : undefined;
  const pads = (template?.pads?.map(at) ?? spaced(3, 0)).map((s, i) => ({ s, lateral: (i % 2 ? -1 : 1) * width * 0.18 }));
  const ramps = (template?.ramps ?? []).map(at);
  const items = spaced(2, 6).map((s) => s + 25).flatMap((s) => [-1, 0, 1].map((k) => ({ s: s % length, lateral: k * width * 0.27 })));
  const hazards = spaced(3, 12).map((s, i) => ({ s: (s + 60) % length, lateral: (i % 2 ? 1 : -1) * width * 0.22 }));
  const shortcuts = (template?.shortcuts ?? []).map((c) => buildShortcut(c, samples, length, step));
  return { id: template?.id ?? (('id' in source && source.id) || 'custom'), name: source.name ?? template?.name ?? 'Custom circuit', theme: source.theme ?? template?.theme ?? 'city', width, length, samples, spacing: step, ramps, pads, items, hazards, shortcuts, sectors: [0, length / 3, (2 * length) / 3] };
}

/** A shortcut joins two points on the circuit; its progress runs between their track positions. */
function buildShortcut(c: TrackShortcut, samples: TrackSample[], length: number, step: number): Shortcut {
  const pts = c.points.map(([x, z]) => ({ x, z })), near = (p: { x: number; z: number }) => samples.reduce((best, s) => (Math.hypot(s.x - p.x, s.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z) ? s : best));
  const a = near(pts[0]).s, b = near(pts.at(-1)!).s, span = (b - a + length) % length;
  let total = 0;const lengths = pts.map((p, i) => (i ? (total += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z)) : 0));
  const out: Shortcut['samples'] = [];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i], seg = lengths[i] - lengths[i - 1];
    for (let d = 0; d < seg; d += step) out.push({ x: p.x + ((q.x - p.x) * d) / seg, z: p.z + ((q.z - p.z) * d) / seg, s: (a + (span * (lengths[i - 1] + d)) / total) % length });
  }
  return { samples: out, width: c.width ?? 9 };
}

export interface TrackPosition { index: number; s: number; lateral: number; distance: number; onShortcut: boolean }
/** Nearest centre-line sample, searched around a hint so long tracks stay cheap; shortcuts count as track. */
export function locate(track: Track, x: number, z: number, hint = -1): TrackPosition {
  const n = track.samples.length;let best = 0, bestD = Infinity;
  const scan = (from: number, to: number) => { for (let k = from; k <= to; k++) { const i = ((k % n) + n) % n, s = track.samples[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bestD) { bestD = d; best = i; } } };
  if (hint >= 0) scan(hint - 30, hint + 30);
  if (hint < 0 || bestD > (track.width * 1.5) ** 2) scan(0, n - 1);
  const s = track.samples[best], lateral = (x - s.x) * s.tz - (z - s.z) * s.tx;
  const result: TrackPosition = { index: best, s: s.s, lateral, distance: Math.sqrt(bestD), onShortcut: false };
  if (Math.abs(lateral) > track.width / 2) for (const c of track.shortcuts) for (const p of c.samples) if (Math.hypot(p.x - x, p.z - z) < c.width / 2) return { ...result, s: p.s, onShortcut: true };
  return result;
}

/** World point at progress s with a lateral offset (+ left). */
export function trackPoint(track: Track, s: number, lateral = 0) {
  const n = track.samples.length, f = (((s % track.length) + track.length) % track.length) / track.spacing, i = Math.floor(f) % n, j = (i + 1) % n, t = f - Math.floor(f);
  const a = track.samples[i], b = track.samples[j], tx = a.tx + (b.tx - a.tx) * t, tz = a.tz + (b.tz - a.tz) * t, l = Math.hypot(tx, tz) || 1;
  return { x: a.x + (b.x - a.x) * t + (tz / l) * lateral, z: a.z + (b.z - a.z) * t - (tx / l) * lateral, yaw: Math.atan2(tx, tz), index: i };
}

const point = (raw: unknown, label: string): TrackPoint => {
  if (!Array.isArray(raw) || raw.length !== 2 || !raw.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 2000)) throw Error(`${label}: use [x, z] pairs in metres within ±2000.`);
  return [raw[0], raw[1]];
};
/** A template ID or a custom circuit; custom loops must not fold back on themselves. */
export function parseTrack(raw: unknown): string | CustomTrack {
  if (typeof raw === 'string') { if (!TRACK_IDS.includes(raw)) throw Error(`Choose a race track: ${TRACK_IDS.join(', ')}, or custom control points.`); return raw; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('race.track needs a track ID or { points, width, theme }.');
  const p = raw as Record<string, unknown>;
  for (const key of Object.keys(p)) if (!['name', 'theme', 'width', 'points'].includes(key)) throw Error(`Unsupported race track setting: ${key}.`);
  if (!Array.isArray(p.points) || p.points.length < 6 || p.points.length > 64) throw Error('A custom race track needs 6 to 64 control points.');
  const points = p.points.map((q, i) => point(q, `race.track.points[${i}]`)), width = p.width ?? 15;
  if (typeof width !== 'number' || width < 10 || width > 24) throw Error('Use a race track width from 10 to 24 metres.');
  if (p.theme !== undefined && !TRACK_THEMES.includes(p.theme as TrackTheme)) throw Error(`Choose a track theme: ${TRACK_THEMES.join(', ')}.`);
  if (p.name !== undefined && (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60)) throw Error('Use a track name up to 60 characters.');
  const custom: CustomTrack = { points, width, ...(p.theme ? { theme: p.theme as TrackTheme } : {}), ...(p.name ? { name: (p.name as string).trim() } : {}) };
  const track = buildTrack(custom);
  if (track.length < 400 || track.length > 6000) throw Error(`A custom race track should be 400 to 6000 metres long (this one is ${Math.round(track.length)} m).`);
  // Reject loops whose road would overlap itself: distant samples must stay a full width apart.
  const s = track.samples, gap = Math.ceil((track.width * 3) / track.spacing);
  for (let i = 0; i < s.length; i += 2) for (let j = i + gap; j < s.length - (i < gap ? gap - i : 0); j += 2) if (Math.hypot(s[i].x - s[j].x, s[i].z - s[j].z) < track.width * 1.05) throw Error('The custom race track crosses or touches itself. Spread the control points apart.');
  if (s.some((q) => Math.abs(q.curvature) > 1 / (track.width * 0.9))) throw Error('A custom race track has a corner tighter than the road allows. Round it off with more space.');
  return custom;
}
export const resolveTrack = (track: string | CustomTrack) => buildTrack(typeof track === 'string' ? trackTemplate(track)! : track);
