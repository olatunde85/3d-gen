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
  clamp, cloth, hplane, isTrunk, isUpper, mat, points, shell, shellPart, torsoY, Y,
  type GarmentDef, type GarmentStyle, type GCtx, type GPart,
} from './kit';
import { ankle, blendToHull, dressPts, hang, knee, legsUnder, limbTube, loosePart, part, tubeMesh } from './drape';
import { cord, ellipsoid, frameOf, merge, solidBand, v3 } from './ring';
import { makePattern } from './textures';

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
];
