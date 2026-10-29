/**
 * High heels: the feet are arched in the body mesh itself (pointed down at the ankle, toes bent
 * back flat at the ball), so the skeleton, skin weights and every animation carry the heel pose;
 * then a pointed pump is built around the arched foot (see pumpShoe).
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, makeBody, REGION, type Body } from './body';
import { clamp, cloth, mat, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, loftRings, merge, orientOutward, v3 } from './ring';

/** Foot pitch for heels (radians): about a 7 cm heel on an adult foot. */
const ARCH = (24 * Math.PI) / 180;

function rotX(p: Vec3, o: Vec3, a: number): Vec3 {
  const y = p[1] - o[1], z = p[2] - o[2];
  return [p[0], o[1] + y * Math.cos(a) - z * Math.sin(a), o[2] + y * Math.sin(a) + z * Math.cos(a)];
}

/**
 * Arch both feet in place (MakeHuman decimetres): the foot pitches down about the ankle, the
 * toes bend back about the ball of the foot so they rest flat, and the bottom of the shin follows
 * a little for a smooth ankle.
 */
export function archFeet(coords: Float32Array, regions: Uint8Array, joints: Record<string, number[]>): void {
  const b = makeBody(coords, new Float32Array(coords.length), regions, joints);
  const out = new Float32Array(coords);
  for (const s of [1, -1]) {
    const ankle = b.joint(`foot${s > 0 ? '.L' : '.R'}____head`);
    const ball = rotX(b.joint(`toe3-1${s > 0 ? '.L' : '.R'}____head`), ankle, ARCH);
    const blend = (v: number, w: number, w2: number) => {
      let p = rotX(b.p(v), ankle, ARCH * w);
      if (w2) p = rotX(p, ball, -ARCH * w2);
      out.set(p, v * 3);
    };
    for (const v of b.verts(REGION.foot, s)) {
      const t = b.info[v].t;
      blend(v, 1, Math.min(1, Math.max(0, (t - 0.9) / 0.15)));
    }
    for (const v of b.verts(REGION.lowerleg, s)) {
      const t = b.info[v].t;
      if (t > 0.86) blend(v, Math.min(1, (t - 0.86) / 0.14) ** 2 * 0.7, 0);
    }
  }
  coords.set(out);
}

/**
 * One pointed pump round an arched foot (side s), designed as a shoe: in the foot's frame (x along
 * the foot, level; y up), cross-sections from behind the heel to a point 3.5 cm past the toes, each
 * a rounded arch over a flat bottom that follows the underside of the arched foot. Behind the vamp
 * the upper is cut down to a low topline (higher round the heel counter): the clamped part lies
 * inside the foot, out of sight. A thin sole follows the bottom, and a stiletto heel drops from
 * under the heel to the floor.
 */
function pumpShoe(b: Body, s: number, floor: number) {
  const foot = b.verts(REGION.foot, s).map((v) => b.p(v));
  if (!foot.length) return null;
  const [fa, fb] = b.axis(REGION.foot, s);
  const X = v3.norm([fb[0] - fa[0], 0, fb[2] - fa[2]]), Z: Vec3 = [X[2], 0, -X[0]];
  const loc = (p: Vec3) => [v3.dot(v3.sub(p, fa), X), p[1], v3.dot(v3.sub(p, fa), Z)] as const;
  const world = (x: number, y: number, z: number): Vec3 => [fa[0] + X[0] * x + Z[0] * z, y, fa[2] + X[2] * x + Z[2] * z];
  const pts = foot.map(loc);
  let x0 = Infinity, x1 = -Infinity;
  for (const p of pts) [x0, x1] = [Math.min(x0, p[0]), Math.max(x1, p[0])];
  const sx0 = x0 - cm(0.4), toe = cm(3.5), sx1 = x1 + toe, L = sx1 - sx0;
  // Per station: the foot's width (z range), top and underside.
  const N = 40, zLo: number[] = [], zHi: number[] = [], top: number[] = [], bot: number[] = [];
  for (let i = 0; i <= N; i++) {
    const x = Math.min(sx0 + (L * i) / N, x1 - cm(0.3));
    let lo = Infinity, hi = -Infinity, t = -Infinity, u = Infinity;
    for (const p of pts) {
      if (Math.abs(p[0] - x) > cm(0.9)) continue;
      [lo, hi, t, u] = [Math.min(lo, p[2]), Math.max(hi, p[2]), Math.max(t, p[1]), Math.min(u, p[1])];
    }
    zLo.push(lo); zHi.push(hi); top.push(t); bot.push(u);
  }
  const fill = (a: number[]) => {
    let last = NaN;
    for (let i = 0; i <= N; i++) (Number.isFinite(a[i]) ? (last = a[i]) : (a[i] = last));
    last = NaN;
    for (let i = N; i >= 0; i--) (Number.isFinite(a[i]) ? (last = a[i]) : (a[i] = last));
    for (let it = 0; it < 3; it++) for (let i = 1; i < N; i++) a[i] = (a[i - 1] + 2 * a[i] + a[i + 1]) / 4;
  };
  [zLo, zHi, top, bot].forEach(fill);
  // The big toe's side: the point sits a little toward it.
  const medial = -s;
  const M = 36, rings: Vec3[][] = [], rim: Vec3[] = [], rimR: Vec3[] = [];
  const vampU = 0.66;
  const station = (i: number) => {
    const u = i / N, x = sx0 + L * u;
    const past = clamp((x - (x1 - cm(1))) / (toe + cm(1)), 0, 1);
    // Pointed toe: the width narrows to a point; heel rounded.
    const heelRound = Math.sqrt(Math.max(0, 1 - Math.max(0, (0.22 - u) / 0.22) ** 2));
    const half = ((zHi[i] - zLo[i]) / 2 + cm(0.35)) * (1 - past) ** 0.9 * Math.max(0.05, heelRound);
    const zc = (zLo[i] + zHi[i]) / 2 + medial * cm(0.9) * past;
    const yb = bot[i] - cm(0.05);
    // Height: over the foot with a margin; down to the sole at the point.
    let h = Math.max(top[i] + cm(0.35), yb + cm(3)) ;
    h = yb + (h - yb) * (1 - past) ** 0.7 + cm(0.15);
    // Topline behind the vamp: 5 cm round the heel, 2.6 cm at the sides, rising into the vamp.
    const cap = u > vampU ? Infinity : yb + cm(2.6) + cm(2.6) * clamp((0.22 - u) / 0.2, 0, 1) + cm(6) * clamp((u - vampU + 0.06) / 0.06, 0, 1);
    // Round in section at the heel counter, boxier toward the toe.
    const ex = 0.55 + 0.4 * clamp((0.3 - u) / 0.3, 0, 1);
    return { x, half, zc, yb, h, cap, u, ex };
  };
  for (let i = 0; i <= N; i++) {
    const st = station(i), r: Vec3[] = [];
    let first = -1, last = -1;
    for (let k = 0; k < M; k++) {
      const th = (k / M) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      const z = st.zc + Math.sign(c) * Math.abs(c) ** st.ex * st.half;
      // (The bottom wraps 3 mm down over the sole's edge: no gap between them.)
      let y = sn >= 0 ? st.yb + (st.h - st.yb) * sn ** 0.55 : st.yb - cm(0.3) * Math.abs(sn) ** 0.3;
      if (sn >= 0 && y > st.cap) {
        y = st.cap;
        if (first < 0) first = k;
        last = k;
      }
      r.push(world(st.x, y, z));
    }
    rings.push(r);
    if (first >= 0 && st.u <= vampU + 0.01) {
      rim.push(r[first]);
      rimR.push(r[last]);
    }
  }
  const upper = orientOutward(loftRings(rings, { closedAround: true, tileU: 0.12, tileV: 0.12 }), world(sx0 + L / 2, floor + cm(4), (zLo[N >> 1] + zHi[N >> 1]) / 2));
  // The opening's edge: round the back from one side of the vamp to the other.
  const edge = [...rim.reverse(), ...rimR];
  const trim = edge.length > 3 ? cord(edge, cm(0.18), false, 6) : null;
  // Sole: a thin layer under the bottom, following the arch.
  const sl: Vec3[] = [], sr: Vec3[] = [];
  for (let i = 0; i <= N; i++) {
    const st = station(i), w = st.half + cm(0.04);
    sl.push(world(st.x, st.yb, st.zc - w));
    sr.push(world(st.x, st.yb, st.zc + w));
  }
  const outline = [...sl, ...sr.reverse()];
  const down = (p: Vec3, d: number): Vec3 => [p[0], p[1] - d, p[2]];
  const soleRings = [outline, outline.map((p) => down(p, cm(0.45)))];
  const capOf = (r: Vec3[], up: boolean) => {
    let c: Vec3 = [0, 0, 0];
    for (const p of r) c = v3.add(c, v3.scale(p, 1 / r.length));
    const inner = r.map((p) => v3.lerp(p, c, 0.98));
    return loftRings(up ? [r, inner] : [inner, r], { closedAround: true, uRepeats: 2, tileV: 0.1 });
  };
  const sole = orientOutward(merge([loftRings(soleRings, { closedAround: true, tileU: 0.1, tileV: 0.05 }), capOf(soleRings[0], true), capOf(soleRings[1], false)])!, world(sx0 + L / 2, floor + cm(2), (zLo[N >> 1] + zHi[N >> 1]) / 2));
  // Stiletto: under the heel, tapering to a fine tip on the floor, raked slightly back.
  const hs = station(Math.round(N * 0.1)), ht = hs.yb - cm(0.4);
  const heelRings: Vec3[][] = [];
  for (let k = 0; k <= 8; k++) {
    const f = k / 8, y = ht + (floor - ht) * f, r = cm(1.0) * (1 - f) ** 1.6 + cm(0.32);
    const xc = hs.x - cm(0.6) * f;
    heelRings.push(Array.from({ length: 14 }, (_, j) => {
      const a = (j / 14) * Math.PI * 2;
      return world(xc + Math.cos(a) * r * 1.15, y, hs.zc + Math.sin(a) * r);
    }));
  }
  heelRings.push(heelRings[8].map((p) => v3.lerp(p, centroid(heelRings[8]), 0.98)));
  const heel = orientOutward(loftRings(heelRings, { closedAround: true, tileU: 0.1 }), world(hs.x, (ht + floor) / 2, hs.zc));
  // Foot skin inside: below the topline, or in front of the vamp.
  const inside = (p: Vec3) => {
    const [x, y] = loc(p);
    const i = clamp(Math.round(((x - sx0) / L) * N), 0, N), st = station(i);
    return st.u > vampU || y < st.cap;
  };
  return { upper, trim, sole, heel, inside, mid: v3.lerp(fa, fb, 0.45) };
}

function pump(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const leather = cloth(g, 'Heels', st, { roughness: st.pattern === 'patent' ? 0.15 : 0.32 });
  // The floor: under the balls of the feet (the toes rest flat there).
  let floor = Infinity;
  for (const v of b.verts(REGION.foot)) floor = Math.min(floor, b.coords[v * 3 + 1]);
  floor -= cm(0.45);
  const shoes = [1, -1].map((s) => pumpShoe(b, s, floor)).filter((x): x is NonNullable<ReturnType<typeof pumpShoe>> => !!x);
  if (shoes.length < 2) return [];
  const mids = shoes.map((x) => x.mid);
  const rigid = (m: PolyMesh) => {
    const P = m.positions, out = new Float32Array(P.length);
    for (let i = 0; i < P.length; i += 3) out.set(Math.hypot(P[i] - mids[0][0], P[i + 2] - mids[0][2]) < Math.hypot(P[i] - mids[1][0], P[i + 2] - mids[1][2]) ? mids[0] : mids[1], i);
    return out;
  };
  const part = (pick: (x: (typeof shoes)[number]) => PolyMesh | null, material: GPart['material'], extra: Partial<GPart> = {}): GPart[] => {
    const mesh = merge(shoes.map(pick));
    return mesh ? [{ mesh, material, skinAt: rigid(mesh), ...extra }] : [];
  };
  const hides = new Uint8Array(g.faceVerts.length / 4);
  for (let f = 0; f < hides.length; f++) {
    let all = true;
    for (let k = 0; k < 4 && all; k++) {
      const v = g.faceVerts[f * 4 + k];
      const sh = b.coords[v * 3] > 0 === mids[0][0] > 0 ? shoes[0] : shoes[1];
      all = b.regions[v] === REGION.foot && sh.inside(b.p(v));
    }
    hides[f] = all ? 1 : 0;
  }
  // Soles: a deeper shade of the leather.
  const lc = parseInt(st.color.slice(1), 16), sh = (k: number) => Math.round(((lc >> k) & 255) * 0.45);
  const dark = mat('Heel soles', null, { color: '#' + ((sh(16) << 16) | (sh(8) << 8) | sh(0)).toString(16).padStart(6, '0'), roughness: 0.5 });
  return [
    ...part((x) => x.upper, { ...leather, doubleSided: true }, { hides }),
    ...part((x) => x.trim, leather),
    ...part((x) => x.sole, dark, { ground: true }),
    ...part((x) => x.heel, leather, { ground: true }),
  ];
}

function centroid(pts: Vec3[]): Vec3 {
  let c: Vec3 = [0, 0, 0];
  for (const p of pts) c = v3.add(c, v3.scale(p, 1 / pts.length));
  return c;
}

export const HEELS: GarmentDef = {
  id: 'heels', label: 'High heels (pointed pumps)', slot: 'feet', patterns: ['nappa', 'patent', 'leather'], color: '#c9a07a', color2: '#000000',
  build: pump,
};
