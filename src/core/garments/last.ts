/**
 * Shoe lasts: the shared body of a closed shoe, designed as a shoe rather than wrapped round the
 * foot's surface. In each foot's frame (x along the foot, z across, y up) the upper is a loft of
 * rounded cross-sections sized to contain the foot with a margin (so toes never show), rising
 * from a rounded toe box over the instep to the collar at the back. Soles follow the same outline.
 */
import type { PolyMesh } from '../geometry';
import { smoothstep, type Vec3 } from '../math';
import { cm, REGION, type Body } from './body';
import { loftRings, orientOutward, v3 } from './ring';

export interface LastOpts {
  /** Side margin round the foot. */
  margin: number;
  /** Toe box height (at least), above the bottom of the foot. */
  toeH: number;
  /** Clearance over the top of the foot. */
  instep: number;
  /** Length past the toes and behind the heel. */
  toe: number;
  heel: number;
  /** How far the collar rises above the ankle joint (it always covers the foot). */
  collarRise: number;
  /** Toe shape: where along the shoe (0..1) the toe starts rounding off. */
  toeFrom: number;
  /**
   * A low-cut shoe (a loafer): the upper is cut down to this height above the bottom of the foot
   * from the heel to `throat` (0..1 along the shoe), where it rises into the vamp. The foot shows
   * above it.
   */
  topline?: { h: number; throat: number };
}

export interface Last {
  rings: Vec3[][];
  /** Rings (N + 1 along the foot) and points per ring (M). */
  N: number;
  M: number;
  /** Foot frame: origin, along, across. */
  fa: Vec3;
  X: Vec3;
  Z: Vec3;
  world(x: number, y: number, z: number): Vec3;
  /** Bottom of the foot. */
  minY: number;
  /** Shoe extent along the foot. */
  sx0: number;
  sx1: number;
  zLo: number[];
  zHi: number[];
  collarY: number;
  /** Lower-leg points near the collar. */
  legLow: Vec3[];
  foot: Vec3[];
  /** Middle of the foot (skin lookup for the rigid shoe). */
  mid: Vec3;
  upper: PolyMesh;
  /** The cut edge round a low-cut shoe's opening, from one side of the throat round the heel to the other. */
  rim: Vec3[];
}

export function last(b: Body, s: number, o: LastOpts): Last | null {
  const side = s > 0 ? '.L' : '.R';
  const foot = b.verts(REGION.foot, s).map((v) => b.p(v));
  if (!foot.length) return null;
  const ankle = b.joint(`foot${side}____head`);
  // The collar covers the whole foot (whose skin is hidden).
  let footTop = -Infinity;
  for (const p of foot) footTop = Math.max(footTop, p[1]);
  const collarY = o.topline ? ankle[1] + o.collarRise : Math.max(ankle[1] + o.collarRise, footTop + cm(0.4));
  const legLow = b.verts(REGION.lowerleg, s).map((v) => b.p(v)).filter((p) => p[1] < collarY + cm(1));
  const [fa, fb] = b.axis(REGION.foot, s);
  const X = v3.norm([fb[0] - fa[0], 0, fb[2] - fa[2]]), Z: Vec3 = [X[2], 0, -X[0]];
  let minY = Infinity;
  for (const p of foot) minY = Math.min(minY, p[1]);
  const local = (p: Vec3) => [v3.dot(v3.sub(p, fa), X), p[1], v3.dot(v3.sub(p, fa), Z)] as const;
  const world = (x: number, y: number, z: number): Vec3 => [fa[0] + X[0] * x + Z[0] * z, y, fa[2] + X[2] * x + Z[2] * z];
  const pts = [...foot, ...legLow].map(local);
  let x0 = Infinity, x1 = -Infinity;
  for (const p of foot.map(local)) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
  }
  const sx0 = x0 - o.heel, sx1 = x1 + o.toe, L = sx1 - sx0;
  // Foot extent per slab along x: width (z range) and top height (below the collar).
  const N = 28;
  const zLo: number[] = [], zHi: number[] = [], top: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = sx0 + (L * i) / N;
    let lo = Infinity, hi = -Infinity, t = -Infinity;
    for (const p of pts) {
      if (Math.abs(p[0] - x) > L / N || p[1] > collarY) continue;
      lo = Math.min(lo, p[2]);
      hi = Math.max(hi, p[2]);
      t = Math.max(t, p[1]);
    }
    zLo.push(lo);
    zHi.push(hi);
    top.push(t);
  }
  // Fill the ends (beyond the foot) from their neighbours, then smooth.
  const fill = (a: number[]) => {
    let last = NaN;
    for (let i = 0; i <= N; i++) (Number.isFinite(a[i]) ? (last = a[i]) : (a[i] = last));
    last = NaN;
    for (let i = N; i >= 0; i--) (Number.isFinite(a[i]) ? (last = a[i]) : (a[i] = last));
    for (let it = 0; it < 4; it++) for (let i = 1; i < N; i++) a[i] = (a[i - 1] + 2 * a[i] + a[i + 1]) / 4;
  };
  fill(zLo);
  fill(zHi);
  fill(top);
  // Cross-section at slab i: half-width with a margin, rounded off at the toe and heel; height: the
  // toe box, the instep just over the foot, the collar at the back.
  const M = 36;
  const ring = (i: number): Vec3[] => {
    const u = i / N, x = sx0 + L * u;
    const toeRound = Math.sqrt(Math.max(0, 1 - smoothstep(o.toeFrom, 1, u) ** 2)), heelRound = Math.sqrt(Math.max(0, 1 - smoothstep(0.12, 0, u) ** 2));
    const zc = (zLo[i] + zHi[i]) / 2;
    const a = ((zHi[i] - zLo[i]) / 2 + o.margin) * Math.max(0.05, toeRound * heelRound);
    let h = Math.max(top[i] + o.instep, minY + o.toeH);
    if (u < 0.32) h = Math.max(h, collarY);
    h = minY + (h - minY) * (0.25 + 0.75 * toeRound) * (0.4 + 0.6 * heelRound);
    const out: Vec3[] = [];
    for (let k = 0; k < M; k++) {
      const th = (k / M) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      // Upper half: a rounded arch; lower half: flat on the sole with rounded corners.
      const z = zc + Math.sign(c) * Math.abs(c) ** 0.5 * a;
      const y = sn >= 0 ? minY + (h - minY) * Math.abs(sn) ** 0.6 : minY - cm(0.3) * Math.abs(sn) ** 0.5;
      out.push(world(x, y, z));
    }
    return out;
  };
  const rings: Vec3[][] = [];
  for (let i = 0; i <= N; i++) rings.push(ring(i));
  // Low-cut: clip the upper down to the topline behind the throat, rising smoothly into the vamp.
  const rimL: Vec3[] = [], rimR: Vec3[] = [];
  if (o.topline) {
    const { h, throat } = o.topline;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      if (u > throat + 0.06) break;
      const cap = minY + h + cm(8) * smoothstep(throat - 0.08, throat + 0.06, u);
      const r = rings[i];
      let first = -1, lastK = -1;
      for (let k = 0; k < M / 2 + 1; k++)
        if (r[k][1] > cap) {
          r[k] = [r[k][0], cap, r[k][2]];
          if (first < 0) first = k;
          lastK = k;
        }
      if (first >= 0 && u < throat + 0.02) {
        rimL.push(r[first]);
        rimR.push(r[lastK]);
      }
    }
  }
  const upper = orientOutward(loftRings(rings, { closedAround: true, tileU: 0.12, tileV: 0.12 }), world(sx0 + L / 2, minY + cm(3), (zLo[N >> 1] + zHi[N >> 1]) / 2));
  return { rings, N, M, fa, X, Z, world, minY, sx0, sx1, zLo, zHi, collarY, legLow, foot, mid: v3.lerp(fa, fb, 0.45), upper, rim: [...rimL.reverse(), ...rimR] };
}

/**
 * The sole's outline `margin` outside the foot, rounded at the toe and heel (by `toeRound` and
 * `heelRound` amounts): `level(y, inset)` gives it at height y, pulled in by `inset`.
 */
export function soleOutline(l: Last, margin: number, toeRound = 0.55) {
  const { N, world, sx0, sx1, zLo, zHi, fa, Z, X } = l;
  const outline: Vec3[] = [];
  for (let i = 0; i <= N; i++) outline.push(world(sx0 + ((sx1 - sx0) * i) / N, 0, zHi[i] + margin));
  for (let i = N; i >= 0; i--) outline.push(world(sx0 + ((sx1 - sx0) * i) / N, 0, zLo[i] - margin));
  let oc: Vec3 = [0, 0, 0];
  for (const p of outline) oc = v3.add(oc, v3.scale(p, 1 / outline.length));
  const zMid = v3.dot(v3.sub(oc, fa), Z);
  const rounded = outline.map((p) => {
    const u = v3.dot(v3.sub(p, fa), X), zz = v3.dot(v3.sub(p, fa), Z);
    const e = Math.max(smoothstep(sx1 - cm(4), sx1 + cm(0.5), u), smoothstep(sx0 + cm(3), sx0 - cm(0.5), u));
    return world(u, 0, zMid + (zz - zMid) * (1 - toeRound * e * e));
  });
  const level = (y: number, inset: number) => rounded.map((p) => {
    const d = v3.norm([p[0] - oc[0], 0, p[2] - oc[2]]);
    return [p[0] - d[0] * inset, y, p[2] - d[2] * inset] as Vec3;
  });
  return { level, zMid, centre: oc };
}

/** A flat cap closing a ring (facing up or down). */
export function capRing(r: Vec3[], up: boolean): PolyMesh {
  let c: Vec3 = [0, 0, 0];
  for (const p of r) c = v3.add(c, v3.scale(p, 1 / r.length));
  const inner = r.map((p) => v3.lerp(p, c, 0.99));
  return loftRings(up ? [r, inner] : [inner, r], { closedAround: true, uRepeats: 2, tileV: 0.1 });
}

/** Point on the upper at (fractional) ring ri and angle index k, `lift` off the surface. */
export function surfaceAt(l: Last, ri: number, k: number, lift: number): Vec3 {
  const { rings, N, M } = l;
  const r0 = rings[Math.floor(ri)], r1 = rings[Math.min(N, Math.floor(ri) + 1)], f = ri - Math.floor(ri);
  const at = (r: Vec3[]) => {
    const k0 = Math.floor(k), kf = k - k0;
    return v3.lerp(r[((k0 % M) + M) % M], r[(((k0 + 1) % M) + M) % M], kf);
  };
  const p = v3.lerp(at(r0), at(r1), f);
  let c: Vec3 = [0, 0, 0];
  for (const q of r0) c = v3.add(c, v3.scale(q, 1 / r0.length));
  return v3.madd(p, v3.norm(v3.sub(p, c)), lift);
}

/** Skin lookup for rigid shoes: every vertex follows the middle of its own foot. */
export function rigidFeet(m: PolyMesh, mids: Vec3[]): Float32Array {
  const out = new Float32Array(m.positions.length);
  for (let i = 0; i < out.length; i += 3) {
    let best = 0, d = Infinity;
    mids.forEach((c, k) => {
      const e = Math.hypot(m.positions[i] - c[0], m.positions[i + 2] - c[2]);
      if (e < d) [d, best] = [e, k];
    });
    out.set(mids[best], i);
  }
  return out;
}

/** Body faces of the feet (hidden inside closed shoes), or only those wholly below `below` (low-cut shoes). */
export function feetMask(b: Body, fv: Uint32Array, below = Infinity): Uint8Array {
  const hides = new Uint8Array(fv.length / 4);
  for (let f = 0; f < hides.length; f++) {
    if (b.regions[fv[f * 4]] !== REGION.foot) continue;
    let ok = true;
    for (let k = 0; k < 4; k++) ok &&= b.coords[fv[f * 4 + k] * 3 + 1] < below;
    if (ok) hides[f] = 1;
  }
  return hides;
}
