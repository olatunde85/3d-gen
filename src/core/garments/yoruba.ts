/**
 * Yoruba women's outfits: ankara gown (flutter sleeves), ankara peplum top, aso-ebi lace top
 * (puff sleeves, double peplum, pearls), pencil skirts and the gele head tie. Built from fitted
 * shells and hull-lofted skirts; skirts are skinned loosely so they move with both legs.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import type { Material } from '../mesh';
import { cm, REGION, type Body, type VInfo } from './body';
import {
  clamp, cloth, hplane, isLegs, isTrunk, isUpper, mat, points, shell, shellPart, torsoY, Y,
  type GarmentDef, type GarmentStyle, type GCtx, type GPart,
} from './kit';
import { along, cord, ellipsoid, frameOf, hullRing, loftRings, merge, orientOutward, solidBand, v3 } from './ring';
import { makePattern } from './textures';

const knee = (b: Body) => b.joint('lowerleg01.L____head')[1];

const ankle = (b: Body) => b.joint('foot.L____head')[1];


const dressPts = (b: Body) => points(b, (v) => isTrunk(v) || isLegs(v));

interface HangOpts {
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
function hangRings(b: Body, src: Vec3[], yTop: number, yBot: number, o: HangOpts): Vec3[][] | null {
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

function loftHang(rings: Vec3[][], b: Body, o: Partial<HangOpts> = {}): PolyMesh {
  const mid = rings[Math.floor(rings.length / 2)][0][1];
  return orientOutward(loftRings(rings, { closedAround: !o.arc, tileU: 0.3, tileV: o.tileV ?? 0.3, uRepeats: o.uRepeats }), [0, mid, b.L.torsoZ]);
}

function hang(b: Body, src: Vec3[], yTop: number, yBot: number, o: HangOpts): PolyMesh | null {
  const rings = hangRings(b, src, yTop, yBot, o);
  return rings ? loftHang(rings, b, o) : null;
}

/**
 * Push a fitted shell's trunk out toward the hull a hanging skirt is built on, blending in from
 * yFrom down to yTo: the bodice then runs into the skirt without a step.
 */
function blendToHull(b: Body, mesh: PolyMesh, src: Vec3[], yFrom: number, yTo: number, offset: number): PolyMesh {
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
    const w = clamp((yFrom - y) / (yFrom - yTo), 0, 1);
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
function hideMask(g: GCtx, test: (v: VInfo, y: number) => boolean): Uint8Array {
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
function limbTube(b: Body, region: number, side: number, t0: number, t1: number, off: (s: number, a: number) => number, steps = 8, samples = 28): Vec3[][] | null {
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

function tubeMesh(rings: Vec3[][], centre: Vec3, tile = 0.2): PolyMesh {
  return orientOutward(loftRings(rings, { closedAround: true, tileU: tile, tileV: tile }), centre);
}

/**
 * Skin lookup for loose hanging cloth (skirts, robes, drapes): below the hips each vertex looks up
 * its weights higher up and nearer the middle, so the cloth follows the hips and both thighs
 * together instead of splitting between the legs.
 */
function looseSkin(b: Body, m: PolyMesh, pull = 0.35, squeeze = 0.35): Float32Array {
  const P = m.positions, out = new Float32Array(P.length);
  const hip = b.L.hipY, foot = ankle(b);
  for (let i = 0; i < P.length; i += 3) {
    const y = P[i + 1];
    const depth = clamp((hip - y) / (hip - foot), 0, 1);
    out[i] = P[i] * (1 - squeeze * depth);
    out[i + 1] = y < hip ? y + (hip - y) * pull : y;
    out[i + 2] = b.L.torsoZ + (P[i + 2] - b.L.torsoZ) * (1 - squeeze * depth);
  }
  return out;
}

/** Hide the legs' skin under a skirt, from just below the hips to `margin` above its hem (feet and ankles stay). */
function legsUnder(g: GCtx, hem: number, margin = cm(8)): Uint8Array {
  return hideMask(g, (v, y) => (v.region === REGION.upperleg || v.region === REGION.lowerleg) && y < g.body.L.hipY - cm(4) && y > hem + margin);
}

/** A hanging part with loose skinning. */
function loosePart(b: Body, mesh: PolyMesh | null, material: Material, pull = 0.35, squeeze = 0.35, hides?: Uint8Array): GPart[] {
  return mesh ? [{ mesh, material, skinAt: looseSkin(b, mesh, pull, squeeze), hides }] : [];
}

function part(mesh: PolyMesh | null, material: Material, extra: Partial<GPart> = {}): GPart[] {
  return mesh ? [{ mesh, material, ...extra }] : [];
}

/** Fitted bodice from the waist up (dresses, peplum and lace tops, choli). */
function bodice(g: GCtx, m: Material, o: { from: number; neck: (v: VInfo) => boolean; capSleeve?: boolean; ease?: number }): GPart[] {
  const r = shell(g, {
    covers: (v) => isUpper(v) && v.tt >= o.from && !o.neck(v) && (o.capSleeve !== false || v.region !== REGION.upperarm),
    // Hug the skin toward the neckline so the edge doesn't stand off.
    offset: (v) => (o.ease ?? cm(0.6)) * (1 - 0.55 * clamp((v.tt - 0.7) / 0.1, 0, 1)), tile: 0.3, relax: 4,
  });
  return r ? [{ mesh: r.mesh, material: m, hides: r.covered, smooth: true }] : [];
}

/** A flared ruffle (peplum) from y0 dropping `len`, rippled. */
function peplum(g: GCtx, m: Material, y0: number, len: number, flare: number, offset: number, n = 9, phase = 0): GPart[] {
  const b = g.body;
  const mesh = hang(b, points(b, isTrunk), y0, y0 - len, { offset, flare, wave: { n, amp: cm(3.4), phase }, samples: 96, step: cm(1.2) });
  return loosePart(b, mesh, { ...m, doubleSided: true }, 0.3, 0.2);
}

/** Pencil skirt from the waist to yBot, following the hips and tapering in. */
function pencilSkirt(g: GCtx, st: GarmentStyle, yBot: (b: Body) => number, name: string): GPart[] {
  const b = g.body;
  const m = { ...cloth(g, name, st), doubleSided: true };
  const yTop = torsoY(b, 0.36);
  const hem = yBot(b);
  const mesh = hang(b, dressPts(b), yTop, hem, { offset: cm(0.9), shrink: 0.05, samples: 56 });
  const band = solidBand(points(b, isTrunk), hplane(b, yTop - cm(1.2)), cm(3), cm(0.3), cm(0.9), { samples: 56, tileU: 0.2 });
  return [...loosePart(b, mesh, m, 0.35, 0.35, legsUnder(g, hem)), ...part(band, m)];
}

/** Flutter (bell) sleeves from the shoulder to mid upper arm. */
function flutterSleeves(g: GCtx, m: Material): GPart[] {
  const b = g.body;
  const tubes = [1, -1].map((s) => {
    const r = limbTube(b, REGION.upperarm, s, 0.0, 0.6, (t, a) => cm(0.7) + cm(5.2) * t ** 1.8 * (0.75 + 0.25 * Math.sin(a * 6)) + cm(1.2) * t ** 2 * Math.max(0, -Math.cos(a)), 10, 48);
    return r ? tubeMesh(r, b.axis(REGION.upperarm, s)[0]) : null;
  });
  return part(merge(tubes), { ...m, doubleSided: true });
}

/** Puff sleeves on the upper arm (off the shoulder). */
function puffSleeves(g: GCtx, m: Material): GPart[] {
  const b = g.body;
  const tubes = [1, -1].map((s) => {
    const r = limbTube(b, REGION.upperarm, s, 0.06, 0.5, (t) => cm(0.6) + cm(4.6) * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.8, 10, 40);
    return r ? tubeMesh(r, b.axis(REGION.upperarm, s)[0]) : null;
  });
  return part(merge(tubes), { ...m, doubleSided: true });
}

/** Long fitted sleeves (lace on the peplum top). */
function longSleeves(g: GCtx, m: Material, ease = cm(0.6)): GPart[] {
  return shellPart(g, {
    covers: (v) => v.region === REGION.upperarm || (v.region === REGION.lowerarm && v.t < 0.95) || (isTrunk(v) && v.tt > 0.7 && v.ax > 0.8 * g.body.L.shoulderX),
    offset: ease, tile: 0.15,
  }, m);
}

/** Pearls scattered over a bodice surface. */
function pearls(mesh: PolyMesh, count: number, seed: number, yMin: number, yMax: number, centre: Vec3): PolyMesh | null {
  const P = mesh.positions;
  const parts: PolyMesh[] = [];
  let h = seed;
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296;
  const n = P.length / 3;
  for (let tries = 0; parts.length < count && tries < count * 20; tries++) {
    const i = Math.floor(rnd() * n);
    const p: Vec3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    if (p[1] < yMin || p[1] > yMax || p[2] < centre[2]) continue;
    const out = v3.norm([p[0] - centre[0], 0, p[2] - centre[2]]);
    parts.push(ellipsoid(frameOf(v3.madd(p, out, cm(0.15)), out, Y), [cm(0.35), cm(0.35), cm(0.35)], [0.5, 0.5], 8, 4));
  }
  return merge(parts);
}

function headFrame(b: Body) {
  const head = points(b, (v) => v.region === REGION.head);
  let c: Vec3 = [0, 0, 0];
  for (const p of head) c = v3.add(c, v3.scale(p, 1 / head.length));
  const h = b.L.crownY - b.L.chinY;
  // Skull centre: above the face's centroid.
  const centre: Vec3 = [0, b.L.chinY + h * 0.66, c[2] - cm(1)];
  let r = 0;
  for (const p of head) if (p[1] > centre[1]) r = Math.max(r, Math.hypot(p[0] - centre[0], p[2] - centre[2]));
  return { head, centre, r, h };
}

/** A small 3D flower: a ring of cupped petals round a rhinestone centre. */
function flower(o: Vec3, out: Vec3, up: Vec3, r: number, petals: number, turn: number): { petals: PolyMesh; stone: PolyMesh } {
  const f = frameOf(o, out, up);
  const list: PolyMesh[] = [];
  for (let i = 0; i < petals; i++) {
    const a = turn + (i / petals) * Math.PI * 2;
    const dir = v3.add(v3.scale(f.x, Math.cos(a)), v3.scale(f.y, Math.sin(a)));
    const c = v3.madd(v3.madd(o, dir, r * 0.55), out, r * 0.12);
    const side = v3.cross(out, dir);
    list.push(ellipsoid({ o: c, x: dir, y: side, z: v3.norm(v3.madd(out, dir, -0.25)) }, [r * 0.55, r * 0.3, r * 0.08], [0.5, 0.5], 8, 4));
  }
  return { petals: merge(list)!, stone: ellipsoid(frameOf(v3.madd(o, out, r * 0.18), out, up), [r * 0.2, r * 0.2, r * 0.12], [0.5, 0.5], 10, 5) };
}

/**
 * Gele (auto-gele style): a full rounded dome of finely pleated cloth, high at the crown and full
 * at the back, a smooth folded band across the forehead, and a cluster of lace flowers with
 * rhinestones on the left side.
 */
function gele(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const { centre } = headFrame(b);
  const m = { ...cloth(g, 'Gele', st, { roughness: 0.55 }), doubleSided: true };
  const smoothStep = (e0: number, e1: number, x: number) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const dome = shell(g, {
    covers: (v) => v.region === REGION.head && (Math.abs(v.theta) < 1.0 ? v.t > 0.74 : Math.abs(v.theta) < 2.1 ? v.t > 0.58 : v.t > 0.42),
    offset: (v) => {
      const back = 0.5 - 0.5 * Math.cos(v.theta);
      const side = Math.abs(Math.sin(v.theta));
      // Full at the back and sides, a moderate rise over the crown.
      return cm(1.3) + cm(4.5) * smoothStep(0.72, 1.0, v.t) + cm(5.5) * back * smoothStep(0.5, 0.9, v.t) + cm(2.5) * side * smoothStep(0.62, 0.9, v.t);
    },
    tile: 0.2, relax: 10,
  });
  // Pleats run in rings round a point at the back of the head (where the ends are knotted): ridges
  // in the surface plus UVs so the fabric's pleat lines follow them. From the front they read as
  // horizontal rings across the crown.
  const axis = v3.norm([0, 0.25, -1]);
  let ringed: PolyMesh | null = null;
  let knotAt: Vec3 | null = null;
  if (dome) {
    const P = new Float32Array(dome.mesh.positions);
    const n = P.length / 3;
    const R = cm(10), period = cm(2.1), amp = cm(0.42);
    const ref = Math.abs(axis[1]) < 0.9 ? Y : ([1, 0, 0] as Vec3);
    const ex = v3.norm(v3.cross(ref, axis)), ey = v3.cross(axis, ex);
    const uvs = new Float32Array(n * 2);
    let best = -Infinity;
    for (let i = 0; i < n; i++) {
      const q: Vec3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      const d = v3.sub(q, centre);
      const out = v3.norm(d);
      const ang = Math.acos(clamp(v3.dot(out, axis), -1, 1));
      const arc = ang * R;
      // Rounded coils with tight valleys between them, like wound cloth.
      const f = arc / period - Math.floor(arc / period);
      const ridge = Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2)) * 2 - 1;
      P.set(v3.madd(q, out, amp * ridge * smoothStep(0.15, 0.4, ang)), i * 3);
      uvs[i * 2] = ((Math.atan2(v3.dot(d, ey), v3.dot(d, ex)) / (2 * Math.PI) + 0.5) * 6);
      uvs[i * 2 + 1] = (arc * 0.1) / (period * 0.1 * 64);
      const along = v3.dot(d, axis);
      if (along > best) {
        best = along;
        knotAt = q;
      }
    }
    ringed = { ...dome.mesh, positions: P, uvs, faceUVs: dome.mesh.faceVerts };
  }
  const parts: GPart[] = ringed ? [{ mesh: ringed, material: m, headwear: true, hidesHair: true, smooth: true }] : [];
  // The knot: the cloth's ends twisted into a spiral rosette at the back.
  if (knotAt) {
    const out = axis;
    const ex = v3.norm(v3.cross(Y, out)), ey = v3.cross(out, ex);
    const spiral: Vec3[] = [];
    const turns = 1.75, steps = 70;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = t * turns * Math.PI * 2;
      const r = cm(1.5) + cm(4.0) * t;
      const lift = cm(1.8) * (1 - t);
      spiral.push(v3.madd(v3.add(v3.madd(knotAt, ex, Math.cos(a) * r), v3.scale(ey, Math.sin(a) * r)), out, lift - cm(0.3)));
    }
    const twist = cord(spiral, cm(1.5), false, 10);
    // Twisted ends: three puffed lobes turning round the centre.
    const lobes: PolyMesh[] = [];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      const dir = v3.add(v3.scale(ex, Math.cos(a)), v3.scale(ey, Math.sin(a)));
      const o = v3.madd(v3.madd(knotAt, dir, cm(1.3)), out, cm(1.6));
      const tan = v3.cross(out, dir);
      lobes.push(ellipsoid({ o, x: v3.norm(v3.add(tan, v3.scale(dir, 0.5))), y: dir, z: out }, [cm(2.6), cm(1.3), cm(1.1)], [0.5, 0.5], 12, 6));
    }
    const centreBall = merge([ellipsoid(frameOf(v3.madd(knotAt, out, cm(2.0)), out, Y), [cm(1.2), cm(1.2), cm(1.0)], [0.5, 0.5], 10, 6), ...lobes])!;
    parts.push({ mesh: merge([twist, centreBall])!, material: mat('Gele knot', null, { color: st.color, roughness: 0.5 }) });
  }
  // Folded bands across the forehead, the upper one rising toward the left.
  const head = points(b, (v) => v.region === REGION.head);
  const H = b.L.crownY - b.L.chinY;
  const bandMat = mat('Gele band', g.texture(`solid_${st.color}`, () => makePattern('solid', st.color, st.color)), { roughness: 0.4 });
  for (const [f, off, tilt, w] of [[0.775, cm(1.9), 0.06, cm(4.2)], [0.86, cm(3.4), 0.3, cm(4.6)]] as const) {
    const band = solidBand(head, { origin: [0, b.L.chinY + f * H, b.L.headZ], normal: v3.norm([-tilt, 1, -0.1]) }, w, cm(1.1), off, { samples: 64, slab: cm(1.4), arc: [-1.75, 1.75], tileU: 0.2 });
    if (band) parts.push({ mesh: band, material: bandMat });
  }
  // Lace flower appliqué on the left of the dome.
  if (dome) {
    const P = dome.mesh.positions;
    const spots: Vec3[] = [];
    const want: [number, number][] = [[0.6, 0.5], [0.85, 0.62], [1.1, 0.5], [0.75, 0.82], [1.05, 0.8], [1.3, 0.66], [0.5, 0.72], [1.4, 0.42], [0.95, 0.35]];
    for (const [az, el] of want) {
      // Direction on the head: azimuth from the front toward the left, elevation above the centre.
      const dir: Vec3 = v3.norm([Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]);
      let best: Vec3 | null = null, bd = -Infinity;
      for (let i = 0; i < P.length; i += 3) {
        const q: Vec3 = [P[i], P[i + 1], P[i + 2]];
        const d = v3.sub(q, centre);
        const along = v3.dot(d, dir), dist = v3.len(v3.sub(d, v3.scale(dir, along)));
        if (dist < cm(1.2) && along > bd) {
          bd = along;
          best = q;
        }
      }
      if (best) spots.push(best);
    }
    const petals: PolyMesh[] = [], stones: PolyMesh[] = [];
    spots.forEach((p, i) => {
      const out = v3.norm(v3.sub(p, centre));
      const f = flower(v3.madd(p, out, cm(0.2)), out, Y, cm(i % 3 === 0 ? 2.8 : 2.1), 6 + (i % 2), i * 0.7);
      petals.push(f.petals);
      if (i % 2 === 0) stones.push(f.stone);
    });
    const lace = mat('Gele appliqué', g.texture(`lace_${st.color}`, () => makePattern('lace', st.color, st.color)), { color: '#d8c8e0', roughness: 0.45, doubleSided: true });
    parts.push(...part(merge(petals), lace));
    parts.push(...part(merge(stones), mat('Rhinestones', null, { color: '#f4f6fa', roughness: 0.05, metalness: 0.9 })));
  }
  return parts;
}

// --- Necklaces ---------------------------------------------------------------------------

/** Farthest crossing of a closed ring (in the horizontal plane) along a ray from c in direction d. */
function rayRing(ring: Vec3[], c: Vec3, d: Vec3): number | null {
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

/** Front-most crossing (largest z) of a closed ring with the vertical plane at lateral position x. */
function frontZ(ring: Vec3[], x: number): number | null {
  let best: number | null = null;
  for (let j = 0; j < ring.length; j++) {
    const a = ring[j], b = ring[(j + 1) % ring.length];
    if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
    const z = a[2] + ((b[2] - a[2]) * (x - a[0])) / (b[0] - a[0]);
    if (best === null || z > best) best = z;
  }
  return best;
}

/**
 * A necklace line: snug round the base of the neck at the back and sides, and at the front
 * hanging `drop` below it, lying on the chest but no wider than the neck.
 */
function strand(g: GCtx, drop: number): { ring: Vec3[]; centre: Vec3 } | null {
  const b = g.body;
  const surf = points(b, (v) => v.region === REGION.neck || isTrunk(v));
  const yN = b.L.neckY + cm(0.6);
  const neckRing = hullRing(points(b, (v) => v.region === REGION.neck), hplane(b, yN), { slab: cm(1), samples: 64, offset: cm(0.45) });
  if (!neckRing) return null;
  let c: Vec3 = [0, 0, 0];
  for (const p of neckRing) c = v3.add(c, v3.scale(p, 1 / neckRing.length));
  const off = cm(0.45) + (g.layered.top ? cm(0.4) : 0);
  const N = 80, ring: Vec3[] = [];
  const cache = new Map<number, Vec3[] | null>();
  const surfAt = (y: number) => {
    const k = Math.round(y / cm(0.5));
    if (!cache.has(k)) cache.set(k, hullRing(surf, hplane(b, k * cm(0.5)), { slab: cm(0.6), samples: 128, offset: off }));
    return cache.get(k)!;
  };
  for (let i = 0; i < N; i++) {
    const a = -Math.PI + (2 * Math.PI * i) / N;
    const dir: Vec3 = [Math.sin(a), 0, Math.cos(a)];
    const front = (1 + Math.cos(a)) / 2;
    const y = yN - cm(1.2) - drop * front ** 2.2;
    const rN = rayRing(neckRing, [c[0], yN, c[2]], dir) ?? cm(6);
    let p: Vec3 = [c[0] + dir[0] * rN, y, c[2] + dir[2] * rN];
    const h = surfAt(y);
    if (h) {
      if (dir[2] > 0) {
        // Front: keep the neck's width, lie on the chest.
        const z = frontZ(h, p[0]);
        if (z !== null && z > p[2]) p = [p[0], y, z];
      } else {
        // Back and sides: on the surface of the neck / trapezius at this height.
        const rs = rayRing(h, [c[0], y, c[2]], dir);
        if (rs && rs > rN) p = [c[0] + dir[0] * rs, y, c[2] + dir[2] * rs];
      }
    }
    ring.push(p);
  }
  // Smooth the line (the surface has small steps).
  for (let it = 0; it < 3; it++) {
    const prev = ring.map((q) => [...q] as Vec3);
    for (let i = 0; i < N; i++) {
      const a = prev[(i + N - 1) % N], b2 = prev[(i + 1) % N];
      for (let k = 0; k < 3; k++) ring[i][k] = Math.max(-1e9, (a[k] + 2 * prev[i][k] + b2[k]) / 4);
      // Never sink below the unsmoothed surface position (outward).
      const d0 = Math.hypot(prev[i][0] - c[0], prev[i][2] - c[2]), d1 = Math.hypot(ring[i][0] - c[0], ring[i][2] - c[2]);
      if (d1 < d0) {
        ring[i][0] = c[0] + ((ring[i][0] - c[0]) * d0) / (d1 || 1);
        ring[i][2] = c[2] + ((ring[i][2] - c[2]) * d0) / (d1 || 1);
      }
    }
  }
  return { ring, centre: [c[0], yN - cm(6), c[2]] };
}

/** Round beads along a ring; every `spacerEvery`-th bead goes to the second list (gold spacers). */
function beadRow(ring: Vec3[], centre: Vec3, r: number, gap: number, spacerEvery = 0): [PolyMesh | null, PolyMesh | null] {
  const main: PolyMesh[] = [], spacers: PolyMesh[] = [];
  for (const { p, tangent, i } of along(ring, r * 2 + gap, true)) {
    const out = v3.norm([p[0] - centre[0], 0, p[2] - centre[2]]);
    const f = frameOf(v3.madd(p, out, r * 0.6), out, tangent);
    const spacer = spacerEvery > 0 && i % spacerEvery === spacerEvery - 1;
    (spacer ? spacers : main).push(ellipsoid({ o: f.o, x: f.y, y: f.x, z: f.z }, spacer ? [r * 0.7, r * 0.5, r * 0.7] : [r, r, r], [0.5, 0.5], 10, 6));
  }
  return [merge(main), merge(spacers)];
}

/** Coral beads (iyun): a choker and two longer strands of large coral, with gold spacers. */
function coralBeads(g: GCtx, st: GarmentStyle): GPart[] {
  const coral: PolyMesh[] = [], gold: PolyMesh[] = [];
  for (const [drop, r] of [[cm(0.5), cm(0.65)], [cm(4.5), cm(0.75)], [cm(9), cm(0.8)]] as const) {
    const s = strand(g, drop);
    if (!s) continue;
    const [a, b] = beadRow(s.ring, s.centre, r, cm(0.08), 7);
    if (a) coral.push(a);
    if (b) gold.push(b);
  }
  return [
    ...part(merge(coral), mat('Coral beads', null, { color: st.color, roughness: 0.35 })),
    ...part(merge(gold), mat('Gold spacers', null, { color: st.color2, roughness: 0.3, metalness: 0.9 })),
  ];
}

/** Gold chain with a round pendant. */
function goldNecklace(g: GCtx, st: GarmentStyle): GPart[] {
  const s = strand(g, cm(7));
  if (!s) return [];
  let front = s.ring[0];
  for (const p of s.ring) if (p[2] > front[2]) front = p;
  const out = v3.norm([front[0] - s.centre[0], 0.15, front[2] - s.centre[2]]);
  const pendant = ellipsoid(frameOf(v3.madd(v3.madd(front, Y, -cm(1.6)), out, cm(0.3)), out, Y), [cm(1.4), cm(1.6), cm(0.35)], [0.5, 0.5], 16, 6);
  const metal = mat('Gold', null, { color: st.color, roughness: 0.25, metalness: 0.95 });
  return [{ mesh: merge([cord(s.ring, cm(0.12), true), pendant])!, material: metal }];
}

/** Pearls: two strands. */
function pearlNecklace(g: GCtx, st: GarmentStyle): GPart[] {
  const rows: PolyMesh[] = [];
  for (const drop of [cm(2), cm(5.5)]) {
    const s = strand(g, drop);
    if (!s) continue;
    const [a] = beadRow(s.ring, s.centre, cm(0.45), cm(0.03));
    if (a) rows.push(a);
  }
  return part(merge(rows), mat('Pearls', null, { color: st.color, roughness: 0.18, metalness: 0.1 }));
}

/** Outfits that pair a top and a bottom (and suggested extras), listed with the full outfits. */
export interface OutfitSet {
  id: string;
  label: string;
  top: string;
  bottom: string;
  /** Added when the set is picked (can be removed afterwards). */
  accessories: string[];
  shoes?: string;
  /** Patterns offered for the whole set (first = default) and default colours, shared by both pieces. */
  patterns: GarmentDef['patterns'];
  color: string;
  color2: string;
}

export const OUTFIT_SETS: OutfitSet[] = [
  {
    id: 'set_ankara_gown', label: 'Ankara gown', top: 'ankara_gown', bottom: 'none', accessories: ['gold_necklace'], shoes: 'heels',
    patterns: ['ankara_floral', 'ankara_web', 'ankara', 'lace', 'solid'], color: '#4b2a9a', color2: '#e9e4f2',
  },
  {
    id: 'set_ankara_peplum', label: 'Ankara peplum & skirt', top: 'peplum_top', bottom: 'pencil_skirt_midi', accessories: ['gold_necklace'], shoes: 'heels',
    patterns: ['ankara_web', 'ankara_floral', 'ankara', 'lace', 'solid'], color: '#d2711c', color2: '#150c08',
  },
  {
    id: 'set_aso_ebi', label: 'Aso-ebi lace & gele', top: 'lace_top', bottom: 'pencil_skirt_maxi', accessories: ['gele', 'coral_beads'], shoes: 'heels',
    patterns: ['lace', 'damask', 'ankara', 'solid'], color: '#c98aa0', color2: '#e6b3c4',
  },
];
export const setById = new Map(OUTFIT_SETS.map((x) => [x.id, x]));

const sx = (b: Body) => b.L.shoulderX;
/** Rounded neckline: an ellipse `w` (fraction of the shoulder width) across, `d` deep (trunk units) below the neck. */
const neckHole = (b: Body, v: VInfo, w: number, d: number) => (v.ax / (w * sx(b))) ** 2 + ((1.02 - v.tt) / (Math.abs(v.tth) > Math.PI / 2 ? d * 0.55 : d)) ** 2 < 1;

export const YORUBA: GarmentDef[] = [
  {
    id: 'ankara_gown', label: 'Ankara gown (flutter sleeves)', slot: 'top', patterns: ['ankara_floral', 'ankara_web', 'ankara', 'lace', 'solid'], color: '#4b2a9a', color2: '#e9e4f2',
    build: (g, st) => {
      const b = g.body;
      const m = cloth(g, 'Ankara gown', st);
      const sleeves = mat('Flutter sleeves', g.texture('solid_#141414', () => makePattern('solid', '#141414', '#000000')), { roughness: 0.8 });
      const yTop = torsoY(b, 0.36);
      const top = bodice(g, m, { from: 0.3, neck: (v) => neckHole(b, v, 0.62, 0.12), capSleeve: true });
      if (top[0]) top[0].mesh = blendToHull(b, top[0].mesh, dressPts(b), torsoY(b, 0.55), yTop, cm(0.8));
      return [
        ...top,
        ...flutterSleeves(g, sleeves),
        ...loosePart(b, hang(b, dressPts(b), yTop, ankle(b) - cm(2), { offset: cm(0.8), shrink: (y) => (y > knee(b) ? 0.04 : 0), flare: 0.008, samples: 64 }), { ...m, doubleSided: true }, 0.35, 0.35, legsUnder(g, ankle(b))),
      ];
    },
  },
  {
    id: 'peplum_top', label: 'Peplum top (lace sleeves)', slot: 'top', patterns: ['ankara_web', 'ankara_floral', 'ankara', 'lace', 'solid'], color: '#d2711c', color2: '#150c08',
    build: (g, st) => {
      const b = g.body;
      const m = cloth(g, 'Peplum top', st);
      const lace = cloth(g, 'Lace sleeves', { pattern: 'lace', color: st.color, color2: st.color });
      // Keyhole above the bust.
      const key = (v: VInfo) => Math.abs(v.tth) < 0.5 && v.tt > 0.76 && v.tt < 0.86 && v.ax < 0.09 * sx(b) * (1 - Math.abs(v.tt - 0.81) / 0.05);
      return [
        ...bodice(g, m, { from: 0.36, neck: (v) => neckHole(b, v, 0.42, 0.13) || key(v), capSleeve: true }),
        ...longSleeves(g, lace),
        ...peplum(g, m, torsoY(b, 0.42), cm(13), 0.26, cm(0.9), 6),
      ];
    },
  },
  {
    id: 'lace_top', label: 'Aso-ebi lace top (puff sleeves, peplum)', slot: 'top', patterns: ['lace', 'damask', 'ankara', 'solid'], color: '#c98aa0', color2: '#ffffff',
    build: (g, st) => {
      const b = g.body;
      const m = cloth(g, 'Lace top', st);
      // Off the shoulder, with a sweetheart dip at the centre front.
      const neck = (v: VInfo) => {
        const front = Math.abs(v.tth) < Math.PI / 2;
        const dip = front ? 0.04 * clamp(1 - v.ax / (0.16 * sx(b)), 0, 1) - 0.015 * clamp(1 - Math.abs(v.ax - 0.3 * sx(b)) / (0.15 * sx(b)), 0, 1) : 0;
        return v.tt > (front ? 0.8 : 0.77) - dip || v.region === REGION.upperarm;
      };
      const body = bodice(g, m, { from: 0.36, neck });
      const pearl = body[0] ? pearls(body[0].mesh, 34, 7, torsoY(b, 0.5), torsoY(b, 0.78), [0, 0, b.L.torsoZ]) : null;
      const belt = solidBand(points(b, isTrunk), hplane(b, torsoY(b, 0.43)), cm(2.2), cm(0.35), cm(1.1), { samples: 56, tileU: 0.2 });
      return [
        ...body,
        ...puffSleeves(g, m),
        ...peplum(g, m, torsoY(b, 0.42), cm(11), 0.3, cm(1.0), 6),
        ...peplum(g, m, torsoY(b, 0.42), cm(6.5), 0.42, cm(1.6), 6, 1.9),
        ...part(belt, m),
        ...part(pearl, mat('Pearls', null, { color: '#f4efe6', roughness: 0.2, metalness: 0.1 })),
      ];
    },
  },
  {
    id: 'pencil_skirt_maxi', label: 'Pencil skirt (ankle)', slot: 'bottom', patterns: ['lace', 'ankara_floral', 'ankara_web', 'ankara', 'solid'], color: '#c98aa0', color2: '#ffffff',
    build: (g, st) => pencilSkirt(g, st, (b) => ankle(b) - cm(2), 'Pencil skirt'),
  },
  {
    id: 'pencil_skirt_midi', label: 'Pencil skirt (below the knee)', slot: 'bottom', patterns: ['ankara_web', 'ankara_floral', 'ankara', 'lace', 'solid'], color: '#d2711c', color2: '#150c08',
    build: (g, st) => pencilSkirt(g, st, (b) => knee(b) - cm(10), 'Pencil skirt'),
  },
  {
    id: 'gele', label: 'Gele (head tie)', slot: 'acc', patterns: ['pleated', 'damask', 'asooke', 'lace', 'solid'], color: '#c98aa0', color2: '#e6b3c4',
    build: gele,
  },
  {
    id: 'coral_beads', label: 'Coral beads (iyun)', slot: 'acc', patterns: ['solid'], color: '#c8322a', color2: '#d9a441',
    build: coralBeads,
  },
  {
    id: 'gold_necklace', label: 'Gold necklace & pendant', slot: 'acc', patterns: ['solid'], color: '#d9a441', color2: '#000000',
    build: goldNecklace,
  },
  {
    id: 'pearl_necklace', label: 'Pearl necklace', slot: 'acc', patterns: ['solid'], color: '#f2ece0', color2: '#000000',
    build: pearlNecklace,
  },
];
