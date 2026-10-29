/**
 * Ring-based garment geometry. A "hull ring" is the convex cross-section of a
 * set of body vertices on a plane, pushed outward: the natural shape of
 * anything wrapped around the body (wrappers, belts, straps, collars, cuffs,
 * headbands). Plus small props: beads, shells, pouches, cards.
 */
import { subdivide, type PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { UVs } from './shell';

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  madd: (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  dot: (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a: Vec3) => Math.hypot(a[0], a[1], a[2]),
  norm: (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

export interface Plane {
  origin: Vec3;
  normal: Vec3;
  /** In-plane reference direction for angle 0 (projected). Default: +Z, or +X if parallel. */
  ref?: Vec3;
}

function basis(pl: Plane) {
  const n = v3.norm(pl.normal);
  let ref = pl.ref ?? [0, 0, 1];
  if (Math.abs(v3.dot(ref, n)) > 0.95) ref = [1, 0, 0];
  const u = v3.norm(v3.sub(ref, v3.scale(n, v3.dot(ref, n))));
  const w = v3.cross(n, u);
  return { n, u, w };
}

function hull2(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], hi: [number, number][] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

export interface RingOpts {
  /** Half-thickness of the slab of points considered (decimetres). */
  slab: number;
  samples: number;
  /** Outward offset (decimetres), optionally varying with angle. */
  offset: number | ((angle: number) => number);
  /** Angle range; default full circle starting at the back (seam at the back). */
  arc?: [number, number];
  /** Shift the in-plane centre (decimetres along u, w). */
  centreShift?: [number, number];
}

/**
 * Convex cross-section ring of `points` on a plane. Angles: 0 = plane ref
 * direction (front), +PI/2 = n x ref. Returns `samples` points (+1 for arcs).
 */
export function hullRing(points: Vec3[], pl: Plane, o: RingOpts): Vec3[] | null {
  const { n, u, w } = basis(pl);
  const pts: [number, number][] = [];
  for (const p of points) {
    const d = v3.sub(p, pl.origin);
    if (Math.abs(v3.dot(d, n)) <= o.slab) pts.push([v3.dot(d, u), v3.dot(d, w)]);
  }
  if (pts.length < 3) return null;
  const h = hull2(pts);
  let cx = 0, cy = 0;
  for (const q of h) {
    cx += q[0] / h.length;
    cy += q[1] / h.length;
  }
  if (o.centreShift) {
    cx += o.centreShift[0];
    cy += o.centreShift[1];
  }
  const ring: Vec3[] = [];
  const [a0, a1] = o.arc ?? [-Math.PI, Math.PI];
  const full = !o.arc;
  const count = full ? o.samples : o.samples + 1;
  for (let j = 0; j < count; j++) {
    const a = a0 + ((a1 - a0) * j) / o.samples;
    const dx = Math.cos(a), dy = Math.sin(a);
    // Ray from centre to hull boundary.
    let r = 0;
    for (let k = 0; k < h.length; k++) {
      const [px, py] = h[k], [qx, qy] = h[(k + 1) % h.length];
      const ex = qx - px, ey = qy - py;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((px - cx) * ey - (py - cy) * ex) / den;
      const s = ((px - cx) * dy - (py - cy) * dx) / den;
      if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6) r = Math.max(r, t);
    }
    r += typeof o.offset === 'number' ? o.offset : o.offset(a);
    const x = cx + dx * r, y = cy + dy * r;
    ring.push(v3.add(v3.add(pl.origin, v3.scale(u, x)), v3.scale(w, y)));
  }
  return ring;
}

/**
 * Loft through rings of equal length. `closedAround`: rings are closed loops;
 * `closedAcross`: last ring connects back to the first (solid straps).
 */
export function loftRings(rings: Vec3[][], o: { closedAround: boolean; closedAcross?: boolean; tileU?: number; tileV?: number; uRepeats?: number }): PolyMesh {
  const R = rings.length, N = rings[0].length;
  const pos: number[] = [];
  for (const r of rings) for (const p of r) pos.push(...p);
  const uvs = new UVs();
  const sizes: number[] = [], fv: number[] = [], fu: number[] = [];
  // u by arc length around the first ring, v by distance across rings.
  const ringLen = (r: Vec3[]) => {
    let L = 0;
    for (let j = 0; j < r.length - (o.closedAround ? 0 : 1); j++) L += v3.len(v3.sub(r[(j + 1) % r.length], r[j]));
    return L;
  };
  const reps = o.uRepeats ?? Math.max(1, Math.round((ringLen(rings[0]) * 0.1) / (o.tileU ?? 0.25)));
  const vAt: number[] = [0];
  for (let i = 1; i < R; i++) vAt.push(vAt[i - 1] + (v3.len(v3.sub(rings[i][0], rings[i - 1][0])) * 0.1) / (o.tileV ?? 0.25));
  if (o.closedAcross) vAt.push(vAt[R - 1] + (v3.len(v3.sub(rings[0][0], rings[R - 1][0])) * 0.1) / (o.tileV ?? 0.25));
  const cols = o.closedAround ? N : N - 1;
  const rowsN = o.closedAcross ? R : R - 1;
  for (let i = 0; i < rowsN; i++) {
    const i2 = (i + 1) % R;
    for (let j = 0; j < cols; j++) {
      const j2 = (j + 1) % N;
      const ua = (j / cols) * reps, ub = ((j + 1) / cols) * reps;
      sizes.push(4);
      fv.push(i * N + j, i * N + j2, i2 * N + j2, i2 * N + j);
      fu.push(uvs.add(ua, vAt[i]), uvs.add(ub, vAt[i]), uvs.add(ub, vAt[i + 1]), uvs.add(ua, vAt[i + 1]));
    }
  }
  return { positions: Float32Array.from(pos), faceSizes: Uint8Array.from(sizes), faceVerts: Uint32Array.from(fv), faceUVs: Uint32Array.from(fu), uvs: Float32Array.from(uvs.data) };
}

/** Flip all faces if they mostly face toward `centre` (so normals point outward). */
export function orientOutward(m: PolyMesh, centre: Vec3): PolyMesh {
  let score = 0;
  const P = m.positions;
  for (let f = 0, c = 0; f < m.faceSizes.length; f++) {
    const k = m.faceSizes[f];
    const a = m.faceVerts[c] * 3, b = m.faceVerts[c + 1] * 3, d = m.faceVerts[c + 2] * 3;
    const e1: Vec3 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2: Vec3 = [P[d] - P[a], P[d + 1] - P[a + 1], P[d + 2] - P[a + 2]];
    score += v3.dot(v3.cross(e1, e2), [P[a] - centre[0], P[a + 1] - centre[1], P[a + 2] - centre[2]]);
    c += k;
  }
  if (score >= 0) return m;
  const fv = new Uint32Array(m.faceVerts.length), fu = new Uint32Array(m.faceUVs.length);
  for (let f = 0, c = 0; f < m.faceSizes.length; f++) {
    const k = m.faceSizes[f];
    for (let i = 0; i < k; i++) {
      fv[c + i] = m.faceVerts[c + k - 1 - i];
      fu[c + i] = m.faceUVs[c + k - 1 - i];
    }
    c += k;
  }
  return { ...m, faceVerts: fv, faceUVs: fu };
}

/** Merge several PolyMeshes into one. */
export function merge(parts: (PolyMesh | null | undefined)[]): PolyMesh | null {
  const list = parts.filter((p): p is PolyMesh => !!p && p.faceSizes.length > 0);
  if (!list.length) return null;
  const pos: number[] = [], uv: number[] = [], sizes: number[] = [], fv: number[] = [], fu: number[] = [];
  const ref: number[] = [];
  for (const m of list) {
    const vo = pos.length / 3, uo = uv.length / 2;
    for (let i = 0; i < m.positions.length / 3; i++) ref.push(m.ref ? m.ref[i] : -1);
    for (const x of m.positions) pos.push(x);
    for (const x of m.uvs) uv.push(x);
    for (const s of m.faceSizes) sizes.push(s);
    for (const v of m.faceVerts) fv.push(v + vo);
    for (const t of m.faceUVs) fu.push(t + uo);
  }
  return {
    positions: Float32Array.from(pos), faceSizes: Uint8Array.from(sizes), faceVerts: Uint32Array.from(fv), faceUVs: Uint32Array.from(fu), uvs: Float32Array.from(uv),
    ref: ref.some((r) => r >= 0) ? Int32Array.from(ref) : undefined,
  };
}

/**
 * A solid band (belt, strap, cuff) around the body: rings on parallel planes
 * across its width, outer surface plus a slightly smaller inner surface.
 */
export function solidBand(
  points: Vec3[], pl: Plane, width: number, thickness: number, offset: number,
  o: { samples: number; slab?: number; arc?: [number, number]; tileU?: number; uRepeats?: number; steps?: number },
): PolyMesh | null {
  const n = v3.norm(pl.normal);
  const steps = o.steps ?? 2;
  const ringAt = (s: number, off: number) =>
    hullRing(points, { ...pl, origin: v3.madd(pl.origin, n, (s - 0.5) * width) }, {
      slab: o.slab ?? Math.max(width / steps, 0.12), samples: o.samples, offset: off, arc: o.arc,
    });
  const outer: Vec3[][] = [], inner: Vec3[][] = [];
  for (let k = 0; k <= steps; k++) {
    const s = k / steps;
    const a = ringAt(s, offset + thickness), b = ringAt(s, offset);
    if (!a || !b) return null;
    outer.push(a);
    inner.push(b);
  }
  const rings = [...outer, ...inner.reverse()];
  const m = loftRings(rings, { closedAround: !o.arc, closedAcross: true, tileU: o.tileU, uRepeats: o.uRepeats, tileV: 0.05 });
  return orientOutward(m, pl.origin);
}

// --- Primitives ----------------------------------------------------------------

interface Frame {
  o: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
}

function place(local: number[], f: Frame): Float32Array {
  const out = new Float32Array(local.length);
  for (let i = 0; i < local.length; i += 3) {
    const [a, b, c] = [local[i], local[i + 1], local[i + 2]];
    for (let d = 0; d < 3; d++) out[i + d] = f.o[d] + f.x[d] * a + f.y[d] * b + f.z[d] * c;
  }
  return out;
}

/** Frame from an origin, a "forward" (z) and an "up" hint (y). */
export function frameOf(o: Vec3, forward: Vec3, up: Vec3): Frame {
  const z = v3.norm(forward);
  const x = v3.norm(v3.cross(up, z));
  const y = v3.cross(z, x);
  return { o, x, y, z };
}

/** UV sphere / ellipsoid with radii (rx, ry, rz) in the frame. All corners map to `uv`. */
export function ellipsoid(f: Frame, r: Vec3, uv: [number, number], seg = 8, rings = 5): PolyMesh {
  const pos: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI;
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      pos.push(Math.sin(phi) * Math.cos(th) * r[0], Math.cos(phi) * r[1], Math.sin(phi) * Math.sin(th) * r[2]);
    }
  }
  const sizes: number[] = [], fv: number[] = [];
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      sizes.push(4);
      fv.push(i * seg + j, (i + 1) * seg + j, (i + 1) * seg + j2, i * seg + j2);
    }
  return {
    positions: place(pos, f), faceSizes: Uint8Array.from(sizes), faceVerts: Uint32Array.from(fv),
    faceUVs: new Uint32Array(fv.length), uvs: Float32Array.from(uv),
  };
}

/** Rounded box (a subdivided cube) with half-sizes (hx, hy, hz); planar UVs. */
export function roundedBox(f: Frame, h: Vec3, round = 1): PolyMesh {
  const s = 1 + 0.3 * round;
  const c = [-1, 1];
  const pos: number[] = [];
  for (const x of c) for (const y of c) for (const z of c) pos.push(x * h[0] * s, y * h[1] * s, z * h[2] * s);
  const idx = (x: number, y: number, z: number) => x * 4 + y * 2 + z;
  const quads = [
    [idx(0, 0, 1), idx(1, 0, 1), idx(1, 1, 1), idx(0, 1, 1)], [idx(1, 0, 0), idx(0, 0, 0), idx(0, 1, 0), idx(1, 1, 0)],
    [idx(1, 0, 1), idx(1, 0, 0), idx(1, 1, 0), idx(1, 1, 1)], [idx(0, 0, 0), idx(0, 0, 1), idx(0, 1, 1), idx(0, 1, 0)],
    [idx(0, 1, 1), idx(1, 1, 1), idx(1, 1, 0), idx(0, 1, 0)], [idx(0, 0, 0), idx(1, 0, 0), idx(1, 0, 1), idx(0, 0, 1)],
  ];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1];
  let m: PolyMesh = {
    positions: Float32Array.from(pos), faceSizes: new Uint8Array(6).fill(4), faceVerts: Uint32Array.from(quads.flat()),
    faceUVs: Uint32Array.from(quads.flatMap(() => [0, 1, 2, 3])), uvs: Float32Array.from(uv),
  };
  for (let i = 0; i < round; i++) m = subdivide(m);
  return { ...m, positions: place([...m.positions], f) };
}

/** Flat card from `base` along `dir` (length) with `width` across `side`; UV 0..1. */
export function card(base: Vec3, dir: Vec3, side: Vec3, length: number, width: number, taper = 1, segs = 3): PolyMesh {
  const pos: number[] = [], uv: number[] = [], sizes: number[] = [], fv: number[] = [], fu: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = v3.madd(base, dir, length * t);
    const w = (width / 2) * (1 - (1 - taper) * t);
    pos.push(...v3.madd(c, side, -w), ...v3.madd(c, side, w));
    uv.push(0, t, 1, t);
  }
  for (let i = 0; i < segs; i++) {
    sizes.push(4);
    fv.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    fu.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  return { positions: Float32Array.from(pos), faceSizes: Uint8Array.from(sizes), faceVerts: Uint32Array.from(fv), faceUVs: Uint32Array.from(fu), uvs: Float32Array.from(uv) };
}

/** Points spaced evenly (by arc length) along a closed or open polyline. */
export function along(poly: Vec3[], spacing: number, closed: boolean): { p: Vec3; tangent: Vec3; i: number }[] {
  const segs: number[] = [];
  const n = poly.length;
  const m = closed ? n : n - 1;
  let total = 0;
  for (let i = 0; i < m; i++) {
    segs.push(v3.len(v3.sub(poly[(i + 1) % n], poly[i])));
    total += segs[i];
  }
  const count = Math.max(1, Math.floor(total / spacing));
  const out: { p: Vec3; tangent: Vec3; i: number }[] = [];
  let seg = 0, acc = 0;
  for (let k = 0; k < count; k++) {
    const d = k * (total / count);
    while (seg < m - 1 && acc + segs[seg] < d) acc += segs[seg++];
    const t = segs[seg] > 0 ? (d - acc) / segs[seg] : 0;
    const a = poly[seg], b = poly[(seg + 1) % n];
    out.push({ p: v3.lerp(a, b, t), tangent: v3.norm(v3.sub(b, a)), i: k });
  }
  return out;
}

/** Thin round cord along a polyline. */
export function cord(poly: Vec3[], radius: number, closed: boolean, sides = 5): PolyMesh {
  const rings: Vec3[][] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const prev = poly[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], next = poly[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const t = v3.norm(v3.sub(next, prev));
    const a = v3.norm(v3.cross(t, Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const b = v3.cross(t, a);
    const r: Vec3[] = [];
    for (let j = 0; j < sides; j++) {
      const th = (j / sides) * Math.PI * 2;
      r.push(v3.add(poly[i], v3.add(v3.scale(a, Math.cos(th) * radius), v3.scale(b, Math.sin(th) * radius))));
    }
    rings.push(r);
  }
  if (closed) rings.push(rings[0]);
  return loftRings(rings, { closedAround: true, uRepeats: 1, tileV: 0.05 });
}

/** Farthest crossing of a closed ring (in the horizontal plane) along a ray from c in direction d. */
export function rayRing(ring: Vec3[], c: Vec3, d: Vec3): number | null {
  let best: number | null = null;
  for (let j = 0; j < ring.length; j++) {
    const a = ring[j], b = ring[(j + 1) % ring.length];
    const ex = b[0] - a[0], ez = b[2] - a[2];
    const den = d[0] * ez - d[2] * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - c[0]) * ez - (a[2] - c[2]) * ex) / den;
    const u = ((a[0] - c[0]) * d[2] - (a[2] - c[2]) * d[0]) / den;
    if (t > 0 && u >= 0 && u <= 1 && (best === null || t > best)) best = t;
  }
  return best;
}

/**
 * The longest chain of a mesh's boundary edges (an open edge such as a neckline) among those whose
 * ends pass `keep`, in order; closed loops come back with the first point repeated.
 */
export function boundaryChain(m: PolyMesh, keep: (p: Vec3) => boolean): Vec3[] {
  const P = m.positions, at = (v: number): Vec3 => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  const count = new Map<string, [number, number, number]>();
  for (let f = 0, c = 0; f < m.faceSizes.length; c += m.faceSizes[f++])
    for (let k = 0; k < m.faceSizes[f]; k++) {
      const a = m.faceVerts[c + k], b = m.faceVerts[c + ((k + 1) % m.faceSizes[f])];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const e = count.get(key);
      count.set(key, e ? [e[0], e[1], e[2] + 1] : [a, b, 1]);
    }
  const next = new Map<number, number[]>();
  for (const [a, b, n] of count.values()) {
    if (n !== 1 || !keep(at(a)) || !keep(at(b))) continue;
    (next.get(a) ?? next.set(a, []).get(a)!).push(b);
    (next.get(b) ?? next.set(b, []).get(b)!).push(a);
  }
  const seen = new Set<number>();
  let best: number[] = [], closed = false;
  // Open chains from their ends first, then loops.
  for (const v0 of [...[...next].filter(([, l]) => l.length === 1).map(([v]) => v), ...next.keys()]) {
    if (seen.has(v0)) continue;
    const chain = [v0];
    seen.add(v0);
    for (let v = v0; ; ) {
      const n = (next.get(v) ?? []).find((w) => !seen.has(w));
      if (n === undefined) break;
      chain.push(n);
      seen.add(n);
      v = n;
    }
    if (chain.length > best.length) [best, closed] = [chain, (next.get(chain[chain.length - 1]) ?? []).includes(v0) && chain.length > 2];
  }
  const pts = best.map(at);
  return closed ? [...pts, pts[0]] : pts;
}

/** A flat strap (webbing) along a polyline, lying on a surface with the given normals: width w. */
export function ribbon(line: Vec3[], normals: Vec3[], w: number, th: number): PolyMesh {
  const top: Vec3[] = [], bot: Vec3[] = [], tl: Vec3[] = [], bl: Vec3[] = [];
  line.forEach((p, i) => {
    const t = v3.norm(v3.sub(line[Math.min(line.length - 1, i + 1)], line[Math.max(0, i - 1)]));
    const n = normals[i], side = v3.norm(v3.cross(t, n));
    top.push(v3.madd(v3.madd(p, side, w / 2), n, th));
    bot.push(v3.madd(v3.madd(p, side, -w / 2), n, th));
    tl.push(v3.madd(p, side, w / 2));
    bl.push(v3.madd(p, side, -w / 2));
  });
  // A thin closed band: outer face, edges and inner face.
  const rings = line.map((_, i) => [top[i], bot[i], bl[i], tl[i]]);
  return loftRings(rings, { closedAround: true, tileU: 0.05, tileV: 0.1 });
}
