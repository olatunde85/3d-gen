/**
 * Procedural hair: shaved / buzzed scalps and stubble (painted into the skin
 * overlay), plus geometry for punk spikes, cornrows, box braids, beards and
 * buzz cuts (hair cards). Masks are defined on the unmorphed base body (decimetres) and
 * looked up per vertex, so they follow every head shape; geometry is built on
 * the morphed body.
 */
import { hash3, noise3, REGION, type Body } from '../garments/body';
import { rgb } from '../garments/textures';
import type { PolyMesh } from '../geometry';
import { pchip, rng, smoothstep, type Vec3 } from '../math';
import type { Layer, Paint } from './overlay';

export const HAIRSTYLES = [
  { id: 'buzz', name: 'Buzz cut' },
  { id: 'mohawk', name: 'Punk mohawk' },
  { id: 'cornrows', name: 'Cornrows' },
  { id: 'box_braids', name: 'Box braids' },
] as const;
export type HairstyleId = (typeof HAIRSTYLES)[number]['id'];
export const isProceduralHair = (id: string): id is HairstyleId => HAIRSTYLES.some((h) => h.id === id);

export const FACIAL_HAIR = ['none', 'stubble', 'mustache', 'goatee', 'short_beard', 'full_beard'] as const;
export type FacialHairId = (typeof FACIAL_HAIR)[number];
export const FACIAL_HAIR_LABELS: Record<FacialHairId, string> = {
  none: 'Clean shaven', stubble: 'Stubble', mustache: 'Mustache', goatee: 'Goatee', short_beard: 'Short beard', full_beard: 'Full beard',
};

// --- Masks on the base body ------------------------------------------------------------------

/** Ear (kept bare) on the base body. */
const isEar = (x: number, y: number, z: number) => x > 0.745 && y > 6.78 && y < 7.45 && z > 0.15 && z < 0.72;

// Hairline height around the head (theta: 0 = front, PI = back).
const hairline = pchip(
  [0, 0.5, 0.85, 1.1, 1.25, 1.45, 1.7, 2.0, 2.4, Math.PI],
  [8.02, 7.98, 7.82, 7.5, 7.22, 7.4, 7.42, 7.15, 6.86, 6.72],
);

/** Scalp coverage 0..1 at a base-body point. */
export function scalpMask(p: Vec3): number {
  const x = Math.abs(p[0]), y = p[1], z = p[2];
  if (y < 6.55 || isEar(x, y, z)) return 0;
  const th = Math.atan2(x, z - 0.45);
  const j = (noise3(p[0] * 9, p[1] * 9, p[2] * 9) - 0.5) * 0.07;
  const h = hairline(th) + j;
  return smoothstep(h - 0.04, h + 0.05, y);
}

const cheekLine = pchip([0, 0.15, 0.25, 0.4, 0.55, 0.68, 0.76], [6.88, 6.87, 6.84, 6.86, 6.95, 7.15, 7.3]);
const mouth = (x: number, y: number, z: number) => (z > 1.2 ? (x / 0.205) ** 2 + ((y - 6.645) / 0.085) ** 2 : 9);

/** Facial hair coverage 0..1 at a base-body point (head + neck). */
export function beardMask(p: Vec3, style: FacialHairId, region: number): number {
  if (style === 'none') return 0;
  const x = Math.abs(p[0]), y = p[1], z = p[2];
  if (isEar(x, y, z)) return 0;
  const lips = smoothstep(1.0, 1.3, mouth(x, y, z));
  if (region === REGION.neck) {
    if (style === 'mustache' || style === 'goatee') return 0;
    return smoothstep(6.08, 6.17, y) * smoothstep(0.45, 0.65, z);
  }
  if (region !== REGION.head) return 0;
  const below = 1 - smoothstep(cheekLine(x) - 0.035, cheekLine(x) + 0.035, y);
  const mus = (1 - smoothstep(0.23, 0.28, x)) * smoothstep(6.69, 6.72, y) * below * smoothstep(1.15, 1.25, z);
  if (style === 'mustache') return mus * lips;
  const chin = (1 - smoothstep(0.22, 0.27, x)) * (1 - smoothstep(6.55, 6.6, y)) * smoothstep(0.8, 1.0, z);
  const corners = smoothstep(0.15, 0.17, x) * (1 - smoothstep(0.25, 0.28, x)) * smoothstep(6.48, 6.52, y) * (1 - smoothstep(6.7, 6.74, y)) * smoothstep(1.1, 1.2, z);
  if (style === 'goatee') return Math.max(mus, chin, corners) * lips;
  // Full zone: everything under the cheek line, in front of the ears / jaw angle.
  const front = y > 6.55 ? smoothstep(0.5, 0.64, z) : smoothstep(0.2, 0.38, z);
  return below * front * lips;
}

/** Card length (dm) for a beard style at a base-body point. */
function beardLength(p: Vec3, style: FacialHairId): number {
  const x = Math.abs(p[0]), y = p[1], z = p[2];
  // Longest on the front of the chin; short under the jaw and on the neck.
  const chin = smoothstep(6.62, 6.3, y) * (1 - smoothstep(0.2, 0.55, x)) * smoothstep(0.95, 1.25, z);
  switch (style) {
    case 'mustache':
      return 0.085;
    case 'goatee':
      return y > 6.69 ? 0.085 : 0.11 + 0.12 * chin;
    case 'short_beard':
      return 0.065 + 0.03 * chin;
    case 'full_beard':
      return (z < 0.9 ? 0.08 : 0.11) + 0.2 * chin;
    default:
      return 0;
  }
}

// --- Overlay layers (stubble / shaved scalp) ---------------------------------------------------

const speckle = (p: Vec3, k: number, fill: number) => (hash3(Math.floor(p[0] * k), Math.floor(p[1] * k), Math.floor(p[2] * k)) < fill ? 1 : 0.3);

/** Overlay paint for the scalp (buzzed / shaved) and facial stubble under any beard. */
export function hairLayers(hairstyle: string, facial: FacialHairId, color: string, beardColor: string): Layer[] {
  const c = rgb(color), bc = rgb(beardColor);
  const layers: Layer[] = [];
  const scalpAlpha: Partial<Record<HairstyleId, number>> = { buzz: 0.93, mohawk: 0.42, cornrows: 0.55, box_braids: 0.7 };
  const sa = isProceduralHair(hairstyle) ? scalpAlpha[hairstyle] : undefined;
  if (sa)
    layers.push({
      key: `scalp:${hairstyle}:${color}:${beardColor}`,
      bounds: [-99, 6.5, -99, 99, 99, 99],
      regions: [REGION.head, REGION.neck],
      paint(p): Paint {
        let m = scalpMask(p);
        if (m <= 0) return null;
        // Mohawk: (dyed) crest down the middle, shaved sides in the natural colour.
        if (hairstyle === 'mohawk') {
          const crest = 1 - smoothstep(0.13, 0.17, Math.abs(p[0]));
          const col = crest > 0.5 ? c : bc;
          return [col[0], col[1], col[2], m * (sa + (0.95 - sa) * crest) * speckle(p, 230, 0.75)];
        }
        m *= sa * speckle(p, 230, 0.75);
        return [c[0], c[1], c[2], m];
      },
    });
  if (facial !== 'none') {
    const fa = facial === 'stubble' ? 0.5 : 0.72;
    layers.push({
      key: `stubble:${facial}:${beardColor}`,
      bounds: [-99, 5.9, 0, 99, 7.5, 99],
      regions: [REGION.head, REGION.neck],
      paint(p, region): Paint {
        const m = beardMask(p, facial, region);
        if (m <= 0) return null;
        return [bc[0], bc[1], bc[2], m * fa * speckle(p, 260, facial === 'stubble' ? 0.55 : 0.8)];
      },
    });
  }
  return layers;
}

// --- Geometry ----------------------------------------------------------------------------------

export interface HeadCtx {
  base: Body; // unmorphed
  coords: Float32Array; // morphed body (dm)
  normals: Float32Array; // morphed vertex normals
  regions: Uint8Array;
  faceVerts: Uint32Array; // base quads
  seed: number;
  /** Fewer hair cards (low detail). */
  low: boolean;
}

type V = Vec3;
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const at = (arr: Float32Array, v: number): V => [arr[v * 3], arr[v * 3 + 1], arr[v * 3 + 2]];

/** Head landmarks on the morphed body. */
function headFrame(c: HeadCtx) {
  const B = c.base.coords;
  const scalp: number[] = [];
  const ear: V = [0, 0, 0];
  let ne = 0, maxX = 0, crown = -Infinity, minZ = Infinity;
  for (let v = 0; v < c.regions.length; v++) {
    if (c.regions[v] !== REGION.head) continue;
    const bp = at(B, v);
    if (Math.abs(bp[0]) > 0.77 && bp[1] > 6.9 && bp[1] < 7.4) {
      ear[1] += c.coords[v * 3 + 1];
      ear[2] += c.coords[v * 3 + 2];
      ne++;
    }
    if (bp[1] > 6.6) {
      scalp.push(v);
      if (!isEar(Math.abs(bp[0]), bp[1], bp[2])) maxX = Math.max(maxX, Math.abs(c.coords[v * 3]));
      crown = Math.max(crown, c.coords[v * 3 + 1]);
      minZ = Math.min(minZ, c.coords[v * 3 + 2]);
    }
  }
  const centre: V = [0, ear[1] / ne + 0.25, ear[2] / ne + 0.05];
  const faces: number[] = [];
  const fv = c.faceVerts;
  for (let f = 0; f < fv.length / 4; f++) if (c.regions[fv[f * 4]] === REGION.head && B[fv[f * 4] * 3 + 1] > 6.5) faces.push(f);
  return { scalp, faces, centre, halfWidth: maxX, crown, back: minZ, size: (crown - centre[1]) / 1.15 };
}

interface Hit {
  t: number;
  /** Hit point on the morphed head, its normal, and the same point on the base body (for masks). */
  p: V;
  n: V;
  base: V;
  /** Body vertex nearest the hit (skin weights are copied from it). */
  v: number;
}

/** Outermost intersection of a ray with the head surface (exact, per triangle), or null. */
function rayHit(c: HeadCtx, faces: number[], o: V, d: V): Hit | null {
  let best: Hit | null = null;
  const fv = c.faceVerts;
  for (const f of faces)
    for (const [a, b, e] of [[0, 1, 2], [0, 2, 3]]) {
      const ia = fv[f * 4 + a], ib = fv[f * 4 + b], ie = fv[f * 4 + e];
      const A = at(c.coords, ia), e1 = sub(at(c.coords, ib), A), e2 = sub(at(c.coords, ie), A);
      const pv = cross(d, e2);
      const det = dot(e1, pv);
      if (Math.abs(det) < 1e-12) continue;
      const tv = sub(o, A);
      const u = dot(tv, pv) / det;
      if (u < 0 || u > 1) continue;
      const qv = cross(tv, e1);
      const w = dot(d, qv) / det;
      if (w < 0 || u + w > 1) continue;
      const t = dot(e2, qv) / det;
      if (t <= 0 || (best && t <= best.t)) continue;
      const lerp = (arr: Float32Array): V => add(at(arr, ia), add(mul(sub(at(arr, ib), at(arr, ia)), u), mul(sub(at(arr, ie), at(arr, ia)), w)));
      const v = 1 - u - w >= Math.max(u, w) ? ia : u >= w ? ib : ie;
      best = { t, p: add(o, mul(d, t)), n: norm(lerp(c.normals)), base: lerp(c.base.coords), v };
    }
  return best;
}

/** Tube along a path; radius(s, ring angle) gives the cross-section. Normals point outward. */
function tube(path: V[], ups: V[], sides: number, radius: (s: number, a: number) => [number, number], vScale: number, ref = -1): PolyMesh {
  const pos: number[] = [], uvs: number[] = [], fs: number[] = [], fv: number[] = [], fu: number[] = [];
  let len = 0;
  const n = path.length;
  for (let i = 0; i < n; i++) {
    if (i) len += Math.hypot(...sub(path[i], path[i - 1]));
    const T = norm(sub(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]));
    const u0 = norm(sub(ups[i], mul(T, dot(ups[i], T)))); // "up" across the section
    const w0 = cross(T, u0);
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      const [ru, rw] = radius(i / (n - 1), a);
      const p = add(path[i], add(mul(u0, Math.cos(a) * ru), mul(w0, Math.sin(a) * rw)));
      if (j < sides) pos.push(...p);
      uvs.push(j / sides, len * vScale);
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides;
      fs.push(4);
      // (j -> j+1 around, i -> i+1 along): normal = around x along = outward.
      fv.push(i * sides + j, i * sides + j2, (i + 1) * sides + j2, (i + 1) * sides + j);
      fu.push(i * (sides + 1) + j, i * (sides + 1) + j + 1, (i + 1) * (sides + 1) + j + 1, (i + 1) * (sides + 1) + j);
    }
  return {
    positions: Float32Array.from(pos), faceSizes: Uint8Array.from(fs), faceVerts: Uint32Array.from(fv), faceUVs: Uint32Array.from(fu), uvs: Float32Array.from(uvs),
    ref: new Int32Array(pos.length / 3).fill(ref),
  };
}

function mergeAll(parts: PolyMesh[]): PolyMesh | undefined {
  if (!parts.length) return undefined;
  const pos: number[] = [], uv: number[] = [], fs: number[] = [], fv: number[] = [], fu: number[] = [], ref: number[] = [];
  for (const m of parts) {
    const vo = pos.length / 3, uo = uv.length / 2;
    pos.push(...m.positions);
    for (let i = 0; i < m.positions.length / 3; i++) ref.push(m.ref?.[i] ?? -1);
    uv.push(...m.uvs);
    fs.push(...m.faceSizes);
    for (const v of m.faceVerts) fv.push(v + vo);
    for (const t of m.faceUVs) fu.push(t + uo);
  }
  return {
    positions: Float32Array.from(pos), faceSizes: Uint8Array.from(fs), faceVerts: Uint32Array.from(fv), faceUVs: Uint32Array.from(fu), uvs: Float32Array.from(uv),
    ref: Int32Array.from(ref),
  };
}

/** Punk liberty spikes along the crest. */
export function spikes(c: HeadCtx): PolyMesh | undefined {
  const h = headFrame(c);
  const r = rng(c.seed * 7 + 3);
  const out: PolyMesh[] = [];
  const N = 7;
  for (let i = 0; i < N; i++) {
    const a = 0.8 - (i / (N - 1)) * 2.25; // front hairline -> back of the crown
    const d: V = [0, Math.cos(a), Math.sin(a)];
    const hit = rayHit(c, h.faces, h.centre, d);
    if (!hit || scalpMask(hit.base) < 0.4) continue;
    const P = hit.p;
    const n = hit.n;
    const S = norm(add(add(n, [0, 0.12, 0]), [0, 0, -0.15]));
    const H = h.size * (0.95 + 0.3 * r()) * (0.75 + 0.25 * Math.sin((Math.PI * (i + 0.5)) / N));
    const X: V = [1, 0, 0];
    const wx = 0.085 * h.size, wl = 0.17 * h.size;
    const rings = 7;
    const path: V[] = [], ups: V[] = [];
    for (let k = 0; k < rings; k++) {
      const s = -0.06 + (k / (rings - 1)) * 1.06;
      path.push(add(add(P, mul(S, H * s)), mul([0, 0, -1], 0.12 * H * s * s)));
      ups.push(X);
    }
    out.push(tube(path, ups, 10, (s, ang) => {
      const k = Math.max(0.02, (1 - s) ** 1.25);
      // Ellipse: narrow across the head, long along the crest.
      return [wx * k * (1 + 0.05 * Math.sin(ang * 3)), wl * k];
    }, 1 / 0.6, hit.v));
  }
  return mergeAll(out);
}

/** Cornrows: braids running straight back over the scalp. */
export function cornrows(c: HeadCtx): PolyMesh | undefined {
  const h = headFrame(c);
  const rows = 13;
  const out: PolyMesh[] = [];
  const o = h.centre;
  for (let i = 0; i < rows; i++) {
    // Lateral angle at the crown; rows sweep front-to-back and wrap around the sides above the ears.
    const lat = Math.tan(((-72 + (144 * i) / (rows - 1)) * Math.PI) / 180);
    const hits: { p: V; d: V; t: number; m: number; v: number }[] = [];
    for (let k = 0; k <= 120; k++) {
      const a = 1.25 - (k / 120) * 3.6;
      const s = a > 0 ? 1 - 0.15 * Math.sin(a) : 1 - 0.1 * Math.min(1, -a);
      const d = norm([lat * s, Math.cos(a), Math.sin(a)]);
      const hit = rayHit(c, h.faces, o, d);
      if (!hit) continue;
      hits.push({ p: o, d, t: hit.t, m: scalpMask(hit.base), v: hit.v });
    }
    // Longest run inside the hairline.
    let bestS = 0, bestL = 0;
    for (let s = 0; s < hits.length; ) {
      if (hits[s].m < 0.5) {
        s++;
        continue;
      }
      let e = s;
      while (e < hits.length && hits[e].m >= 0.5) e++;
      if (e - s > bestL) [bestS, bestL] = [s, e - s];
      s = e;
    }
    if (bestL < 8) continue;
    const run = hits.slice(bestS, bestS + bestL);
    const path = run.map((hh) => add(hh.p, mul(hh.d, hh.t + 0.012 * h.size)));
    const ups = run.map((hh) => hh.d);
    const w = 0.045 * h.size, ht = 0.026 * h.size;
    out.push(tube(path, ups, 10, (s) => {
      const k = Math.min(1, s / 0.04) * (s > 0.85 ? 1 - ((s - 0.85) / 0.15) * 0.6 : 1);
      return [ht * k, w * k];
    }, 1 / 0.11, run[run.length >> 1].v));
  }
  return mergeAll(out);
}

/** Box braids: many small braids from a grid of parts, hanging to about chin / neck length. */
export function boxBraids(c: HeadCtx, stopY: number): PolyMesh | undefined {
  const h = headFrame(c);
  const r = rng(c.seed * 13 + 5);
  const out: PolyMesh[] = [];
  const C = h.centre;
  const pad = 0.035 * h.size;
  const R: V = [h.halfWidth + pad, h.crown - C[1] + pad, C[2] - h.back + pad];
  const inside = (p: V) => ((p[0] - C[0]) / R[0]) ** 2 + ((p[1] - C[1]) / R[1]) ** 2 + ((p[2] - C[2]) / R[2]) ** 2;
  const count = c.low ? 160 : 260;
  for (let i = 0; i < count; i++) {
    // Fibonacci directions over the upper part of a sphere.
    const yv = 1 - (i + 0.5) / count * 1.5;
    if (yv < -0.6) break;
    const rad = Math.sqrt(Math.max(0, 1 - yv * yv));
    const phi = i * 2.399963;
    const d = norm([Math.cos(phi) * rad, yv, Math.sin(phi) * rad]);
    const hit = rayHit(c, h.faces, C, d);
    if (!hit || scalpMask(hit.base) < 0.6) continue;
    const P0 = hit.p;
    const n = hit.n;
    // Start along the scalp, heading down (or outward at the crown); front braids are swept back / aside.
    let v = sub([0, -1, 0], mul(n, -n[1]));
    if (Math.hypot(...v) < 0.3) v = [d[0], 0, d[2]];
    v = norm(v);
    // Braids from the front half are swept back over the top (temples go to the side), keeping the face clear.
    if (d[2] > 0.1) v = norm(add(mul(v, 0.3), [Math.sign(d[0] || 1) * (Math.abs(d[0]) > 0.5 ? 0.5 : 0.1), 0, -1]));
    let p = add(P0, mul(n, 0.01));
    const path: V[] = [p], ups: V[] = [n];
    const step = 0.12 * h.size;
    for (let k = 0; k < 24; k++) {
      v = norm(add(v, [0, -0.25, 0]));
      let q = add(p, mul(v, step));
      const e = inside(q);
      if (e < 1) {
        // Push back onto the ellipsoid surface and slide along it.
        const g = norm([(q[0] - C[0]) / (R[0] * R[0]), (q[1] - C[1]) / (R[1] * R[1]), (q[2] - C[2]) / (R[2] * R[2])]);
        q = add(C, mul(sub(q, C), 1 / Math.sqrt(e)));
        v = norm(sub(v, mul(g, Math.min(0, dot(v, g)))));
      }
      if (q[1] < stopY + r() * 0.15) break;
      p = q;
      path.push(p);
      ups.push(norm(sub(p, C)));
    }
    if (path.length < 3) continue;
    const rr = 0.03 * h.size;
    out.push(tube(path, ups, 6, (s) => {
      const k = Math.min(1, 0.3 + s * 25) * (s > 0.88 ? 1 - ((s - 0.88) / 0.12) * 0.55 : 1);
      return [rr * k, rr * k];
    }, 1 / 0.05, hit.v));
  }
  return mergeAll(out);
}

/** One hair card: its centre line (s = 0 at the root, 1 at the tip), half-width vector and taper. */
interface Strand {
  segs: number;
  W: V;
  point(s: number): V;
  taper(s: number): number;
}

interface Scatter {
  seed: number;
  regions: number[];
  /** Hairs per square decimetre of skin. */
  density: number;
  /** Coverage 0..1 at a base-body point. */
  mask(p: V, region: number): number;
  /** Chance of keeping a hair at coverage m (default m). */
  keep?(m: number): number;
  /** Shape one hair rooted at `root` (normal N), at base-body point bp with coverage m. */
  strand(h: { root: V; N: V; bp: V; m: number; r: () => number }): Strand;
}

/**
 * Hair cards scattered over the skin where a mask allows (beards, buzz cuts): random points on
 * every masked face, each grown into a flat strip that follows the face's base-mesh vertex.
 */
function scatterCards(c: HeadCtx, o: Scatter): PolyMesh | undefined {
  const r = rng(o.seed);
  const B = c.base.coords, P = c.coords, Nn = c.normals, fv = c.faceVerts;
  const pos: number[] = [], uvs: number[] = [], fs: number[] = [], fvs: number[] = [], fu: number[] = [], refs: number[] = [];
  for (let f = 0; f < fv.length / 4; f++) {
    const region = c.regions[fv[f * 4]];
    if (!o.regions.includes(region)) continue;
    const ids = [0, 1, 2, 3].map((k) => fv[f * 4 + k]);
    const bc = ids.reduce<V>((s, v) => add(s, mul(at(B, v), 0.25)), [0, 0, 0]);
    // Quick reject (with margin) before sampling.
    if (Math.max(...ids.map((v) => o.mask(at(B, v), region)), o.mask(bc, region)) <= 0) continue;
    for (const [a, b, d] of [[0, 1, 2], [0, 2, 3]]) {
      const pa = at(P, ids[a]), pb = at(P, ids[b]), pd = at(P, ids[d]);
      const area = Math.hypot(...cross(sub(pb, pa), sub(pd, pa))) / 2;
      for (let n = area * o.density; n > 0; n--) {
        if (n < 1 && r() > n) break;
        let u = r(), w = r();
        if (u + w > 1) [u, w] = [1 - u, 1 - w];
        const lerp3 = (A: V, Bv: V, D: V): V => add(A, add(mul(sub(Bv, A), u), mul(sub(D, A), w)));
        const bp = lerp3(at(B, ids[a]), at(B, ids[b]), at(B, ids[d]));
        const m = o.mask(bp, region);
        if (m <= 0 || r() > (o.keep ? o.keep(m) : m)) continue;
        const root = lerp3(pa, pb, pd);
        const N = norm(lerp3(at(Nn, ids[a]), at(Nn, ids[b]), at(Nn, ids[d])));
        const h = o.strand({ root, N, bp, m, r });
        const vo = pos.length / 3, uo = uvs.length / 2;
        const rootVert = 1 - u - w >= Math.max(u, w) ? ids[a] : u >= w ? ids[b] : ids[d];
        for (let k = 0; k < (h.segs + 1) * 2; k++) refs.push(rootVert);
        for (let k = 0; k <= h.segs; k++) {
          const s = k / h.segs;
          const c0 = h.point(s), t = h.taper(s);
          pos.push(...add(c0, mul(h.W, -t)), ...add(c0, mul(h.W, t)));
          uvs.push(0, s, 1, s);
        }
        for (let k = 0; k < h.segs; k++) {
          fs.push(4);
          fvs.push(vo + k * 2, vo + k * 2 + 1, vo + k * 2 + 3, vo + k * 2 + 2);
          fu.push(uo + k * 2, uo + k * 2 + 1, uo + k * 2 + 3, uo + k * 2 + 2);
        }
      }
    }
  }
  if (!fs.length) return undefined;
  return {
    positions: Float32Array.from(pos), faceSizes: Uint8Array.from(fs), faceVerts: Uint32Array.from(fvs), faceUVs: Uint32Array.from(fu), uvs: Float32Array.from(uvs),
    ref: Int32Array.from(refs),
  };
}

/** Beard / mustache hair cards rooted on the face. */
export function beardCards(c: HeadCtx, style: FacialHairId): PolyMesh | undefined {
  if (style === 'none' || style === 'stubble') return undefined;
  const down: V = [0, -1, 0];
  return scatterCards(c, {
    seed: c.seed * 31 + 7,
    regions: [REGION.head, REGION.neck],
    density: (style === 'full_beard' ? 6 : style === 'short_beard' ? 9 : 12) * (c.low ? 0.5 : 1) * 100,
    mask: (p, region) => beardMask(p, style, region),
    strand({ root, N, bp, r }) {
      let D = sub(down, mul(N, dot(down, N)));
      if (Math.hypot(...D) < 0.25) D = sub([0, -0.3, 1], mul(N, dot([0, -0.3, 1], N)));
      D = norm(D);
      // Mustache hairs fan out from the midline.
      if (style !== 'full_beard' && style !== 'short_beard' && bp[1] > 6.69) D = norm(add(D, [Math.sign(root[0] || 1) * 0.6, 0, 0]));
      const L = beardLength(bp, style) * (0.7 + 0.6 * r());
      // Lift off the skin gives volume; random sway breaks up the "curtain".
      const lift = (style === 'short_beard' ? 0.5 : 0.38) + 0.3 * r();
      D = norm(add(D, mul(cross(N, D), (r() - 0.5) * 0.8)));
      const S = norm(add(mul(D, Math.cos(lift)), mul(N, Math.sin(lift))));
      const width = (style === 'full_beard' ? 0.042 : 0.032) * (0.8 + 0.4 * r());
      const W = mul(norm(cross(N, S)), width / 2);
      const droop = style === 'full_beard' ? 0.2 : 0.1;
      const curl = (r() - 0.5) * 0.3;
      const base0 = add(root, mul(N, -0.004));
      return {
        segs: 3, W,
        point: (s) => add(add(base0, mul(S, L * s)), add(mul(down, L * droop * s * s), mul(W, curl * s * 8))),
        taper: (s) => 1 - 0.35 * s,
      };
    },
  });
}

/**
 * Buzz cut: very short hair cards (5–9 mm) over the painted scalp. They stand up and curl a
 * little, so the hairline and the head's outline get soft fuzz instead of a flat painted edge.
 * About 8k triangles at medium detail; none at low detail (game LOD), where the painted scalp is enough.
 */
export function buzzCards(c: HeadCtx): PolyMesh | undefined {
  if (c.low) return undefined;
  const back: V = [0, -0.35, -1];
  return scatterCards(c, {
    seed: c.seed * 53 + 11,
    regions: [REGION.head],
    density: 9 * 100,
    mask: (p) => scalpMask(p),
    // Thinner toward the hairline.
    keep: (m) => m * m,
    strand({ root, N, m, r }) {
      let D = sub(back, mul(N, dot(back, N)));
      D = Math.hypot(...D) < 0.2 ? norm(cross(N, [1, 0, 0])) : norm(D);
      D = norm(add(D, mul(cross(N, D), (r() - 0.5) * 1.6)));
      const lift = 0.3 + 0.4 * r();
      const S = norm(add(mul(D, Math.cos(lift)), mul(N, Math.sin(lift))));
      const L = (0.045 + 0.035 * r()) * (0.6 + 0.4 * m);
      const W = mul(norm(cross(N, S)), (0.016 + 0.008 * r()) / 2);
      const curl = (r() - 0.5) * 2;
      const base0 = add(root, mul(N, -0.003));
      return {
        segs: 1, W,
        // Curls back toward the scalp along the way.
        point: (s) => add(add(base0, mul(S, L * s)), add(mul(N, -L * 0.35 * s * s), mul(W, curl * s * 3))),
        taper: (s) => 1 - 0.4 * s,
      };
    },
  });
}
