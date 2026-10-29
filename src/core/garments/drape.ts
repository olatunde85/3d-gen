/**
 * Hanging cloth: rings hung from a height down around the body (skirts, hems, trouser legs),
 * blended into fitted bodices, and skinned loosely so they move with both legs; plus small shared
 * helpers for limb tubes and hidden-skin masks.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import type { Material } from '../mesh';
import { cm, noise3, REGION, type Body, type VInfo } from './body';
import { clamp, hplane, isLegs, isTrunk, points, Y, type GCtx, type GPart } from './kit';
import { hullRing, loftRings, orientOutward, rayRing, v3 } from './ring';

/** Knee and ankle heights. */
export const knee = (b: Body) => b.joint('lowerleg01.L____head')[1];
export const ankle = (b: Body) => b.joint('foot.L____head')[1];

/** Trunk and leg vertices: what hanging cloth (skirts, robes, tunic hems) drapes over. */
export const dressPts = (b: Body) => points(b, (v) => isTrunk(v) || isLegs(v));

export interface HangOpts {
  offset: number;
  /** Extra offset per decimetre of drop (A-line flare). */
  flare?: number;
  /** Allowed narrowing per decimetre, as a fraction (0 = the cloth never narrows going down); may vary with height. */
  shrink?: number | ((y: number) => number);
  /** Radial ripples: count around the ring and amplitude (grows from 0 at the top to full at the bottom). */
  wave?: { n: number; amp: number; phase?: number };
  arc?: [number, number];
  samples?: number;
  tileV?: number;
  uRepeats?: number;
  /** Ring spacing (decimetres). */
  step?: number;
}

/** Rings hanging from yTop to yBot around `src` (like the catalog's skirt, with taper, flare and ripples). */
export function hangRings(b: Body, src: Vec3[], yTop: number, yBot: number, o: HangOpts): Vec3[][] | null {
  const samples = o.samples ?? 48;
  const k = Math.max(2, Math.ceil((yTop - yBot) / (o.step ?? cm(3))));
  const rings: Vec3[][] = [];
  let centre: Vec3 | null = null;
  for (let i = 0; i <= k; i++) {
    const y = yTop + ((yBot - yTop) * i) / k;
    const depth = i / k;
    const off = o.offset + (o.flare ?? 0) * (yTop - y);
    const r = hullRing(src, hplane(b, y), {
      slab: cm(2.5), samples, arc: o.arc,
      offset: o.wave ? (a: number) => off + o.wave!.amp * depth * (0.5 + 0.5 * Math.sin(a * o.wave!.n + (o.wave!.phase ?? 0))) : off,
    });
    if (!r) {
      // Below the body (past the ankles): carry on straight down.
      if (!rings.length) return null;
      rings.push(rings[rings.length - 1].map((p) => [p[0], y, p[2]] as Vec3));
      continue;
    }
    if (!centre) {
      const full = hullRing(src, hplane(b, y), { slab: cm(2.5), samples: 16, offset: 0 })!;
      centre = [0, 0, 0];
      for (const p of full) centre = v3.add(centre, v3.scale(p, 1 / full.length));
    }
    if (rings.length) {
      const prev = rings[rings.length - 1];
      const dy = prev[0][1] - y;
      const keep = 1 - (typeof o.shrink === 'function' ? o.shrink(y) : (o.shrink ?? 0)) * dy;
      for (let j = 0; j < r.length; j++) {
        const d: Vec3 = [r[j][0] - centre[0], 0, r[j][2] - centre[2]];
        const pd: Vec3 = [prev[j][0] - centre[0], 0, prev[j][2] - centre[2]];
        const rl = v3.len(d), pl = v3.len(pd) * keep;
        if (rl < pl) r[j] = [centre[0] + (d[0] / (rl || 1)) * pl, r[j][1], centre[2] + (d[2] / (rl || 1)) * pl];
      }
    }
    rings.push(r);
  }
  return rings;
}

export function loftHang(rings: Vec3[][], b: Body, o: Partial<HangOpts> = {}): PolyMesh {
  const mid = rings[Math.floor(rings.length / 2)][0][1];
  return orientOutward(loftRings(rings, { closedAround: !o.arc, tileU: 0.3, tileV: o.tileV ?? 0.3, uRepeats: o.uRepeats }), [0, mid, b.L.torsoZ]);
}

export function hang(b: Body, src: Vec3[], yTop: number, yBot: number, o: HangOpts): PolyMesh | null {
  const rings = hangRings(b, src, yTop, yBot, o);
  return rings ? loftHang(rings, b, o) : null;
}

/**
 * Push a fitted shell's trunk out toward the hull a hanging skirt is built on, blending in from
 * yFrom down to yTo: the bodice then runs into the skirt without a step.
 */
export function blendToHull(b: Body, mesh: PolyMesh, src: Vec3[], yFrom: number, yTo: number, offset: number): PolyMesh {
  if (!mesh.ref) return mesh;
  const P = new Float32Array(mesh.positions);
  const N = 96, step = cm(1);
  const cache = new Map<number, { ring: Vec3[]; c: Vec3 } | null>();
  const ringAtY = (y: number) => {
    const k = Math.round(y / step);
    if (!cache.has(k)) {
      const ring = hullRing(src, hplane(b, k * step), { slab: cm(2), samples: N, offset });
      let c: Vec3 = [0, 0, 0];
      if (ring) for (const p of ring) c = v3.add(c, v3.scale(p, 1 / N));
      cache.set(k, ring ? { ring, c } : null);
    }
    return cache.get(k)!;
  };
  for (let i = 0; i < P.length / 3; i++) {
    const r = mesh.ref[i];
    if (r < 0 || !isTrunk(b.info[r])) continue;
    const y = P[i * 3 + 1];
    if (y >= yFrom) continue;
    // Eased in and out, so the cloth curves into the hanging part without a crease.
    const l = clamp((yFrom - y) / (yFrom - yTo), 0, 1), w = l * l * (3 - 2 * l);
    const h = ringAtY(Math.max(y, yTo));
    if (!h) continue;
    const dx = P[i * 3] - h.c[0], dz = P[i * 3 + 2] - h.c[2];
    const a = Math.atan2(dx, dz);
    const j = ((Math.round(((a + Math.PI) / (2 * Math.PI)) * N) % N) + N) % N;
    const rh = Math.hypot(h.ring[j][0] - h.c[0], h.ring[j][2] - h.c[2]);
    const rc = Math.hypot(dx, dz) || 1;
    if (rc >= rh) continue;
    const k = (rc + (rh - rc) * w) / rc;
    P[i * 3] = h.c[0] + dx * k;
    P[i * 3 + 2] = h.c[2] + dz * k;
  }
  return { ...mesh, positions: P };
}

/** Body-face mask of faces whose corners all pass `test` (skin hidden under hanging cloth). */
export function hideMask(g: GCtx, test: (v: VInfo, y: number) => boolean): Uint8Array {
  const fv = g.faceVerts, b = g.body;
  const out = new Uint8Array(fv.length / 4);
  for (let f = 0; f < out.length; f++) {
    let ok = true;
    for (let k = 0; k < 4 && ok; k++) {
      const v = fv[f * 4 + k];
      ok = b.regions[v] !== 255 && test(b.info[v], b.coords[v * 3 + 1]);
    }
    out[f] = ok ? 1 : 0;
  }
  return out;
}

/** Rings around a limb along its axis from t0 to t1, with an offset profile over s in 0..1. */
export function limbTube(b: Body, region: number, side: number, t0: number, t1: number, off: (s: number, a: number) => number, steps = 8, samples = 28): Vec3[][] | null {
  const [a, c] = b.axis(region, side);
  const pts = b.verts(region, side).map((v) => b.p(v));
  const rings: Vec3[][] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const r = hullRing(pts, { origin: v3.lerp(a, c, t0 + (t1 - t0) * s), normal: v3.sub(c, a), ref: Y }, { slab: cm(1.4), samples, offset: (ang) => off(s, ang) });
    if (!r) return null;
    rings.push(r);
  }
  return rings;
}

export function tubeMesh(rings: Vec3[][], centre: Vec3, tile = 0.2): PolyMesh {
  return orientOutward(loftRings(rings, { closedAround: true, tileU: tile, tileV: tile }), centre);
}

/**
 * Skin lookup for loose hanging cloth (skirts, robes, drapes): below the hips each vertex looks up
 * its weights higher up and nearer the middle, so the cloth follows the hips and both thighs
 * together instead of splitting between the legs.
 */
export function looseSkin(b: Body, m: PolyMesh, pull = 0.35, squeeze = 0.35): Float32Array {
  const P = m.positions, out = new Float32Array(P.length);
  const hip = b.L.hipY, foot = ankle(b);
  // Above the hips, look up within the torso's width: cloth hanging beside the arms must follow the
  // torso, or a swinging arm drags it along.
  const torsoX = 0.55 * b.L.shoulderX;
  for (let i = 0; i < P.length; i += 3) {
    const y = P[i + 1];
    const depth = clamp((hip - y) / (hip - foot), 0, 1);
    out[i] = y > hip ? clamp(P[i], -torsoX, torsoX) : P[i] * (1 - squeeze * depth);
    out[i + 1] = y < hip ? y + (hip - y) * pull : y;
    out[i + 2] = b.L.torsoZ + (P[i + 2] - b.L.torsoZ) * (1 - squeeze * depth);
  }
  return out;
}

/** Hide the legs' skin under a skirt, from just below the hips to `margin` above its hem (feet and ankles stay). */
export function legsUnder(g: GCtx, hem: number, margin = cm(8)): Uint8Array {
  return hideMask(g, (v, y) => (v.region === REGION.upperleg || v.region === REGION.lowerleg) && y < g.body.L.hipY - cm(4) && y > hem + margin);
}

/** A hanging part with loose skinning. */
export function loosePart(b: Body, mesh: PolyMesh | null, material: Material, pull = 0.35, squeeze = 0.35, hides?: Uint8Array): GPart[] {
  return mesh ? [{ mesh, material, skinAt: looseSkin(b, mesh, pull, squeeze), hides }] : [];
}

export function part(mesh: PolyMesh | null, material: Material, extra: Partial<GPart> = {}): GPart[] {
  return mesh ? [{ mesh, material, ...extra }] : [];
}

/** Lowest point of the trunk between the legs. */
export function crotchY(b: Body): number {
  let y = Infinity;
  for (let v = 0; v < b.info.length; v++) if (isTrunk(b.info[v]) && Math.abs(b.coords[v * 3]) < cm(1.5)) y = Math.min(y, b.coords[v * 3 + 1]);
  return y;
}

/** Lowest point of the feet (the floor under them, before any shoes lift the body). */
export function soleY(b: Body): number {
  let y = Infinity;
  for (const v of b.verts(REGION.foot)) y = Math.min(y, b.coords[v * 3 + 1]);
  return y;
}

const smooth01 = (t: number) => t * t * (3 - 2 * t);

/**
 * Trousers' seat over the tops of their legs: where the seat (a shell round the hips) overlaps a
 * leg below `yTop`, it is pushed out over that leg's surface so the two meet without a step.
 * Moves the seat's vertices in place.
 */
export function seatOverLegs(seat: PolyMesh, legs: PolyMesh[], yTop: number): void {
  const S = seat.positions;
  for (const lm of legs) {
    const L = lm.positions;
    // Leg vertices near the top, with their row centre.
    const near: Vec3[] = [];
    for (let i = 0; i < L.length; i += 3) if (L[i + 1] > yTop - cm(6)) near.push([L[i], L[i + 1], L[i + 2]]);
    if (!near.length) continue;
    let c: Vec3 = [0, 0, 0];
    for (const p of near) c = v3.add(c, v3.scale(p, 1 / near.length));
    const side = Math.sign(c[0]);
    for (let i = 0; i < S.length; i += 3) {
      const y = S[i + 1];
      if (y > yTop + cm(1) || Math.sign(S[i]) !== side) continue;
      const d: Vec3 = [S[i] - c[0], 0, S[i + 2] - c[2]];
      const r = Math.hypot(d[0], d[2]) || 1, a = Math.atan2(d[0], d[2]);
      // The leg's radius here: its vertices at about this height and angle.
      let best = 0, score = Infinity;
      for (const q of near) {
        if (Math.abs(q[1] - y) > cm(1.5)) continue;
        const qa = Math.atan2(q[0] - c[0], q[2] - c[2]);
        const da = Math.abs(Math.atan2(Math.sin(qa - a), Math.cos(qa - a)));
        if (da < score) [score, best] = [da, Math.hypot(q[0] - c[0], q[2] - c[2])];
      }
      const w = clamp((yTop + cm(1) - y) / cm(2), 0, 1);
      const target = best + cm(0.25);
      if (best && r < target) {
        const k = (r + (target - r) * w) / r;
        S[i] = c[0] + d[0] * k;
        S[i + 2] = c[2] + d[2] * k;
      }
    }
  }
}

export interface WideLegOpts {
  /** Bunched folds where a long hem stacks over the shoe. */
  stack?: boolean;
  /** Tiling texture size (metres); without it the UVs unwrap the leg once (u: 0.5 front, 0.75 outer side; v: 0 top, 1 hem). */
  tile?: number;
  /** How far down the leg (0..1) it keeps following the thigh before easing out to its full width. */
  flareFrom?: number;
}

/**
 * One wide trouser leg (side s): it hangs from the thigh around an axis running down to the ankle,
 * nearly straight, never closer to the leg than `ease`; soft irregular drape folds grow toward the
 * hem. With `stack` the hem sits lower at the back and the fabric bunches over the shoe.
 */
export function wideLeg(b: Body, s: number, yTop: number, yHem: number, o: WideLegOpts = {}): { mesh: PolyMesh; skinAt: Float32Array } | null {
  const src = points(b, (v) => (v.region === REGION.upperleg || v.region === REGION.lowerleg) && v.side === s).filter((p) => p[0] * s > cm(1));
  const hulls = new Map<number, Vec3[] | null>();
  const hullAt = (y: number) => {
    const k = Math.round(y / cm(1));
    if (!hulls.has(k)) hulls.set(k, hullRing(src, hplane(b, k * cm(1)), { slab: cm(1.2), samples: 96, offset: 0 }));
    return hulls.get(k)!;
  };
  const top = hullAt(yTop);
  if (!top) return null;
  let cTop: Vec3 = [0, 0, 0];
  for (const p of top) cTop = v3.add(cTop, v3.scale(p, 1 / top.length));
  const ank = b.joint(`foot${s > 0 ? '.L' : '.R'}____head`);
  const cBot: Vec3 = [ank[0], 0, ank[2] + cm(1)];
  let thighR = 0;
  for (const p of top) thighR += Math.hypot(p[0] - cTop[0], p[2] - cTop[2]) / top.length;
  const ease = cm(1.6);
  const topW = thighR + cm(2), hemW = Math.max(cm(9.5), thighR * 0.95);
  const N = 48, R = Math.max(20, Math.round((yTop - yHem) / cm(1.8)));
  // Radii first (rows x columns), so they can be smoothed down each column.
  const radius: number[][] = [], ys: number[][] = [], dirs: Vec3[] = [];
  for (let j = 0; j < N; j++) {
    const a = ((j / N) * 2 * Math.PI - Math.PI) * s; // u = j / N; mirrored on the right leg so u 0.75 is always the outer side
    dirs.push([Math.sin(a), 0, Math.cos(a)]);
  }
  const centre = (t: number): Vec3 => v3.lerp([cTop[0], 0, cTop[2]], cBot, smooth01(t));
  for (let i = 0; i <= R; i++) {
    const t = i / R;
    const rr: number[] = [], yy: number[] = [];
    for (let j = 0; j < N; j++) {
      const d = dirs[j];
      // Hem: higher at the front (resting on the shoe), lower at the back.
      const y = yTop + (yHem + (o.stack ? cm(2.2) * Math.max(0, d[2]) : 0) - yTop) * t;
      const c = centre(t);
      const w = topW + (hemW - topW) * smooth01(Math.min(1, t * 1.6));
      const rx = w * 0.95, rz = w * 1.06;
      const hull = hullAt(y);
      const legR = hull ? rayRing(hull, [c[0], y, c[2]], d) : null;
      // At the top the leg follows the thigh (meeting the seat without a step), then eases out
      // to its full, straight width.
      const fit = legR !== null ? legR + ease : 0;
      const drape = 1 / Math.hypot(d[0] / rx, d[2] / rz);
      const f0 = o.flareFrom ?? 0;
      let r = Math.max(fit, fit + (drape - fit) * smooth01(Math.max(0, Math.min(1, (t - f0) / 0.18))));
      // Drape folds: low-frequency, irregular, growing down the leg.
      r += cm(0.9) * smooth01(Math.max(0, Math.min(1, (t - (o.flareFrom ?? 0)) * 1.3))) * (noise3(d[0] * 1.3 + s * 3, d[2] * 1.3, y * 2.2) - 0.5) * 2;
      // Stacking over the shoe: bunched horizontal folds rather than a flare.
      const st = o.stack ? Math.max(0, (t - 0.8) / 0.2) : 0;
      r += st * (cm(0.3) + cm(0.9) * Math.sin(y / cm(1.6) + noise3(d[0] * 2 + 7, d[2] * 2, y * 4) * 4));
      rr.push(r);
      yy.push(y);
    }
    radius.push(rr);
    ys.push(yy);
  }
  for (let it = 0; it < 2; it++)
    for (let i = 1; i < R; i++) for (let j = 0; j < N; j++) radius[i][j] = (radius[i - 1][j] + 2 * radius[i][j] + radius[i + 1][j]) / 4;
  // Mesh: an extra column closes the loop with its own UVs (u = 1).
  const pos: number[] = [], uv: number[] = [], look: number[] = [];
  for (let i = 0; i <= R; i++) {
    const t = i / R, c = centre(t);
    for (let j = 0; j <= N; j++) {
      const jj = j % N, d = dirs[jj], r = radius[i][jj], y = ys[i][jj];
      pos.push(c[0] + d[0] * r, y, c[2] + d[2] * r);
      uv.push(o.tile ? ((j / N) * 2 * Math.PI * hemW * 0.1) / o.tile : j / N, o.tile ? (-(yTop - y) * 0.1) / o.tile : 1 - t);
      // Skin lookup: pulled in toward this leg's own surface (not the other leg's).
      look.push(c[0] + d[0] * r * 0.35, y, c[2] + d[2] * r * 0.35);
    }
  }
  const sizes: number[] = [], fv: number[] = [];
  for (let i = 0; i < R; i++)
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j;
      sizes.push(4);
      fv.push(a, a + 1, a + N + 2, a + N + 1);
    }
  const mesh = orientOutward(
    { positions: Float32Array.from(pos), faceSizes: Uint8Array.from(sizes), faceVerts: Uint32Array.from(fv), faceUVs: Uint32Array.from(fv), uvs: Float32Array.from(uv) },
    [cTop[0], (yTop + yHem) / 2, cTop[2]],
  );
  return { mesh, skinAt: Float32Array.from(look) };
}
