/**
 * Closed-loop race circuits: built-in templates or JSON control points, sampled into a centre line with tangents,
 * widths, a racing line, sectors and placed features. Each theme brings its ground: how far the road climbs with the
 * hills, soft verges beside the road, ice or mud patches and its traction. Physics stays on the flat plan of the
 * circuit; heights tilt and lift the cars and pull them back on climbs.
 */
export type TrackTheme = 'city' | 'desert' | 'harbour' | 'forest' | 'snow' | 'beach' | 'neon' | 'jungle' | 'lagoon' | 'mountain' | 'stadium';
export const TRACK_THEMES: readonly TrackTheme[] = ['city', 'desert', 'harbour', 'forest', 'snow', 'beach', 'neon', 'jungle', 'lagoon', 'mountain', 'stadium'];
export const TRACK_THEME_NAMES: Record<TrackTheme, string> = { city: 'City', desert: 'Desert', harbour: 'Harbour', forest: 'Forest', snow: 'Snow and ice', beach: 'Tropical coast', neon: 'Neon night city', jungle: 'Jungle', lagoon: 'Lagoon city', mountain: 'Mountain pass', stadium: 'Kart arena' };
/**
 * The ground of each theme. `hills` and `scale` shape the land in metres; `follow` is how much of it the road climbs
 * (0 keeps the road level); `verge` is drivable soft ground beside the road that slows cars; `patches` are ice or mud
 * spots on the road; icy traction loosens every car's grip.
 */
export interface TrackGround { hills: number; scale: number; follow: number; verge: number; patches?: 'ice' | 'mud'; traction: 'normal' | 'icy'; water?: number }
export const TRACK_GROUNDS: Record<TrackTheme, TrackGround> = {
  city: { hills: 8, scale: 260, follow: 0, verge: 0, traction: 'normal' },
  desert: { hills: 26, scale: 220, follow: 0, verge: 0, traction: 'normal' },
  harbour: { hills: 4, scale: 240, follow: 0, verge: 0, traction: 'normal' },
  forest: { hills: 18, scale: 200, follow: 0, verge: 0, traction: 'normal' },
  snow: { hills: 34, scale: 210, follow: 0.95, verge: 3, patches: 'ice', traction: 'icy' },
  beach: { hills: 10, scale: 230, follow: 0.12, verge: 4, traction: 'normal', water: -1.4 },
  neon: { hills: 0, scale: 300, follow: 0, verge: 0, traction: 'normal' },
  jungle: { hills: 26, scale: 170, follow: 0.85, verge: 2.5, patches: 'mud', traction: 'normal', water: -3.2 },
  lagoon: { hills: 3, scale: 260, follow: 0, verge: 0, traction: 'normal', water: -2.2 },
  mountain: { hills: 120, scale: 300, follow: 0.62, verge: 0, traction: 'normal' },
  stadium: { hills: 0, scale: 300, follow: 0, verge: 0, traction: 'normal' },
};

// Smooth value noise with a fixed seed, shared by the road heights and the scenery so both agree.
const hash2 = (x: number, z: number) => { const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;return v - Math.floor(v); };
function valueNoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Fractal noise from 0 to about 1. */
export function fbm(x: number, z: number, octaves = 4) { let sum = 0, amp = 0.5, f = 1, norm = 0;for (let i = 0; i < octaves; i++) { sum += valueNoise(x * f + i * 17.3, z * f - i * 9.1) * amp;norm += amp;amp *= 0.5;f *= 2.03; } return sum / norm; }
/** The theme's natural land height at a point, before the road is cut in. */
export function landHeight(theme: TrackTheme, x: number, z: number) {
  const g = TRACK_GROUNDS[theme];if (!g.hills) return 0;
  const n = fbm(x / g.scale + 3.1, z / g.scale - 1.7);
  if (theme === 'mountain') { const ridge = 1 - Math.abs(fbm(x / (g.scale * 0.6) - 5, z / (g.scale * 0.6) + 2, 3) * 2 - 1);return g.hills * (n * 0.75 + ridge * ridge * 0.4) - g.hills * 0.35; }
  // The coast falls toward the sea on the south side of the circuit.
  if (theme === 'beach') return g.hills * (n - 0.45) - Math.max(0, -z - 70) * 0.11;
  return g.hills * (n - 0.45);
}
export type TrackPoint = [number, number];
export interface TrackShortcut { points: TrackPoint[]; width?: number }
export interface TrackTemplate { id: string; name: string; theme: TrackTheme; width: number; points: TrackPoint[]; ramps?: number[]; pads?: number[]; shortcuts?: TrackShortcut[]; bridges?: [number, number][] }
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
  {
    id: 'glacier-loop', name: 'Glacier Loop', theme: 'snow', width: 16,
    points: [[0, 0], [0, 160], [30, 235], [100, 260], [160, 225], [175, 160], [230, 120], [300, 140], [350, 200], [420, 190], [445, 120], [410, 40], [420, -40], [370, -100], [280, -95], [215, -50], [140, -80], [60, -70]],
    ramps: [0.52], pads: [0.05, 0.4, 0.78],
  },
  {
    id: 'palm-coast', name: 'Palm Coast', theme: 'beach', width: 16,
    points: [[0, 0], [0, 140], [40, 200], [120, 215], [200, 190], [250, 210], [320, 205], [370, 150], [370, 70], [355, 15], [335, -40], [290, -62], [200, -55], [120, -70], [50, -50]],
    ramps: [0.35], pads: [0.06, 0.47, 0.83],
  },
  {
    id: 'neon-district', name: 'Neon District', theme: 'neon', width: 15,
    points: [[0, 0], [0, 150], [15, 185], [50, 195], [140, 195], [175, 180], [190, 145], [190, 90], [205, 60], [240, 50], [300, 50], [335, 35], [345, 0], [340, -55], [315, -88], [270, -100], [80, -100], [30, -85], [5, -50]],
    ramps: [0.62], pads: [0.08, 0.4, 0.72],
    shortcuts: [{ points: [[190, 145], [230, 150], [270, 120], [300, 50]], width: 9 }],
  },
  {
    id: 'jungle-falls', name: 'Jungle Falls', theme: 'jungle', width: 14,
    points: [[0, 0], [10, 110], [-15, 170], [5, 230], [70, 255], [130, 225], [150, 165], [205, 140], [260, 165], [310, 140], [320, 70], [280, 25], [295, -40], [250, -95], [170, -100], [110, -60], [50, -55]],
    ramps: [0.27], pads: [0.12, 0.55, 0.88],
  },
  {
    id: 'lagoon-bridges', name: 'Lagoon Bridges', theme: 'lagoon', width: 15,
    points: [[0, 0], [0, 170], [30, 220], [95, 235], [260, 235], [320, 215], [345, 165], [340, 60], [350, 0], [330, -60], [270, -85], [180, -80], [110, -95], [45, -70]],
    pads: [0.06, 0.45, 0.8], bridges: [[0.25, 0.39], [0.63, 0.74]],
  },
  {
    id: 'mountain-pass', name: 'Mountain Pass', theme: 'mountain', width: 13,
    points: [[0, 0], [0, 120], [20, 165], [60, 170], [80, 135], [70, 80], [95, 45], [140, 50], [160, 95], [150, 160], [175, 215], [235, 230], [290, 200], [300, 140], [270, 95], [290, 45], [330, 20], [345, -40], [300, -90], [220, -85], [170, -40], [110, -60], [50, -50]],
    pads: [0.03, 0.48, 0.82],
  },
  {
    id: 'kart-arena', name: 'Kart Arena', theme: 'stadium', width: 12,
    points: [[0, 0], [0, 70], [12, 95], [40, 100], [65, 85], [80, 60], [105, 50], [130, 62], [150, 90], [178, 95], [200, 75], [200, 20], [185, -10], [150, -20], [115, -5], [85, -25], [60, -45], [25, -40]],
    ramps: [0.42], pads: [0.05, 0.55],
  },
];
export const TRACK_IDS = TRACK_TEMPLATES.map((t) => t.id);

export interface TrackSample { x: number; z: number; tx: number; tz: number; s: number; curvature: number; line: number; y: number }
export interface Shortcut { samples: { x: number; z: number; s: number }[]; width: number }
export interface Track {
  id: string; name: string; theme: TrackTheme; width: number; length: number; samples: TrackSample[]; spacing: number;
  ramps: number[]; pads: { s: number; lateral: number }[]; items: { s: number; lateral: number }[]; hazards: { s: number; lateral: number }[];
  shortcuts: Shortcut[]; sectors: [number, number, number];
  /** The theme's ground; bridges are spans of progress carried over water. */
  ground: TrackGround; bridges: [number, number][]; patches: { s: number; lateral: number; r: number; kind: 'ice' | 'mud' }[];
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
    return { x: p.x, z: p.z, tx: (next.x - prev.x) / len, tz: (next.z - prev.z) / len, s: i * step, curvature: curvature(prev, p, next), line: 0, y: 0 };
  });
  const theme = source.theme ?? ('id' in source && source.id ? trackTemplate(source.id)?.theme : undefined) ?? 'city', ground = TRACK_GROUNDS[theme];
  roadHeights(samples, theme, ground);
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
  // Patches sit on straights away from pads and items, alternating sides so a clean line always exists.
  const patches = ground.patches ? spaced(4, 20).map((s, i) => ({ s: (s + 35) % length, lateral: (i % 2 ? 1 : -1) * width * 0.2, r: 3.2, kind: ground.patches! })).filter((p) => pads.every((q) => Math.abs(q.s - p.s) > 20)) : [];
  const bridges = (template?.bridges ?? []).map(([a, b]) => [at(a), at(b)] as [number, number]);
  return { id: template?.id ?? (('id' in source && source.id) || 'custom'), name: source.name ?? template?.name ?? 'Custom circuit', theme, width, length, samples, spacing: step, ramps, pads, items, hazards, shortcuts, sectors: [0, length / 3, (2 * length) / 3], ground, bridges, patches };
}

/** The road follows the land as far as the theme allows, smoothed and limited to a drivable 11% grade. */
function roadHeights(samples: TrackSample[], theme: TrackTheme, ground: TrackGround) {
  const n = samples.length;if (!ground.follow) return;
  let h = samples.map((s) => landHeight(theme, s.x, s.z) * ground.follow);
  const smooth = (radius: number) => { const out = new Array<number>(n);let sum = 0;for (let k = -radius; k <= radius; k++) sum += h[(k + n) % n];for (let i = 0; i < n; i++) { out[i] = sum / (radius * 2 + 1);sum += h[(i + radius + 1) % n] - h[(i - radius + n) % n]; } h = out; };
  for (let i = 0; i < 3; i++) smooth(18);
  for (let pass = 0; pass < 40; pass++) { let steep = 0;for (let i = 0; i < n; i++) steep = Math.max(steep, Math.abs(h[(i + 1) % n] - h[i]) / 2);if (steep <= 0.11) break;smooth(6); }
  // The start straight sits level, so the grid and gantry stand flat.
  const base = h[0];samples.forEach((s, i) => { const d = Math.min(i, n - i) * 2, k = Math.min(1, Math.max(0, (d - 30) / 60));s.y = (h[i] - base) * (k * k * (3 - 2 * k)); });
}
/** Road height and grade (rise per metre along the driving direction) at progress s. */
export function roadHeight(track: Track, s: number) {
  const n = track.samples.length, f = (((s % track.length) + track.length) % track.length) / track.spacing, i = Math.floor(f) % n, j = (i + 1) % n, t = f - Math.floor(f);
  const a = track.samples[i].y, b = track.samples[j].y;return { y: a + (b - a) * t, grade: (b - a) / track.spacing };
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
