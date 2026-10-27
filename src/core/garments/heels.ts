/**
 * High heels: the feet are arched in the body mesh itself (pointed down at the ankle, toes bent
 * back flat at the ball), so the skeleton, skin weights and every animation carry the heel pose;
 * then a pump is built around the arched foot: a fitted upper with a low-cut vamp, a sole under
 * the forefoot and a slim block heel down to the floor.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, makeBody, REGION, type Body } from './body';
import { cloth, mat, shell, Y, type GarmentDef, type GCtx, type GPart } from './kit';
import { hullRing, loftRings, merge, orientOutward, v3 } from './ring';

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

/** Lowest y of the foot's vertices within a band of t (its sole line). */
function soleY(b: Body, s: number, t0: number, t1: number): number {
  let y = Infinity;
  for (const v of b.verts(REGION.foot, s)) {
    const t = b.info[v].t;
    if (t >= t0 && t <= t1) y = Math.min(y, b.coords[v * 3 + 1]);
  }
  return y;
}

function pump(g: GCtx, color: string): GPart[] {
  const b = g.body;
  const leather = cloth(g, 'Heels', { pattern: 'leather', color, color2: '#000000' }, { roughness: 0.28 });
  const floor = Math.min(soleY(b, 1, 0.6, 2), soleY(b, -1, 0.6, 2));
  // Sides and heel counter: fitted, low on the sides and higher round the heel; the instep is bare.
  const VAMP = 0.7;
  const sides = shell(g, {
    covers: (v, p) => {
      if (v.region !== REGION.foot || v.t > VAMP + 0.04) return false;
      const sole = soleY(b, v.side, Math.max(0, v.t - 0.08), v.t + 0.08);
      return p[1] - sole < cm(2.4) + cm(3) * Math.min(1, Math.max(0, (0.3 - v.t) / 0.25));
    },
    offset: cm(0.3), tile: 0.12, relax: 6,
  });
  // Toe box: a smooth shell lofted round the forefoot, bridging over the toes.
  const boxes: PolyMesh[] = [];
  const hidden = new Uint8Array(g.faceVerts.length / 4);
  for (const s of [1, -1]) {
    const [a, c] = b.axis(REGION.foot, s);
    const ax = v3.norm(v3.sub(c, a));
    const foot = b.verts(REGION.foot, s);
    const pts = foot.map((v) => b.p(v));
    let tMax = 0;
    for (const p of pts) tMax = Math.max(tMax, v3.dot(v3.sub(p, a), ax));
    const len = v3.len(v3.sub(c, a));
    const rings: Vec3[][] = [];
    const steps = 9;
    for (let k = 0; k <= steps; k++) {
      const d = len * VAMP + (tMax - len * VAMP - cm(0.6)) * (k / steps);
      const r = hullRing(pts, { origin: v3.madd(a, ax, d), normal: ax, ref: Y }, { slab: cm(0.9), samples: 28, offset: cm(0.35) + cm(0.15) * (k / steps) });
      if (r) rings.push(r);
    }
    if (rings.length > 2) {
      const last = rings[rings.length - 1], cl = centroid(last);
      rings.push(last.map((p) => v3.lerp(p, v3.madd(cl, ax, cm(0.5)), 0.6)), last.map(() => v3.madd(cl, ax, cm(0.7))));
      boxes.push(orientOutward(loftRings(rings, { closedAround: true, tileU: 0.1, tileV: 0.1 }), v3.madd(a, ax, len)));
    }
    // Hide the toes' skin inside the box.
    const inBox = new Set(foot.filter((v) => b.info[v].t > VAMP + 0.05));
    for (let f = 0; f < hidden.length; f++) {
      let all = true;
      for (let q = 0; q < 4 && all; q++) all = inBox.has(g.faceVerts[f * 4 + q]);
      if (all) hidden[f] = 1;
    }
  }
  const soles: PolyMesh[] = [], heels: PolyMesh[] = [];
  for (const s of [1, -1]) {
    const foot = b.verts(REGION.foot, s).map((v) => b.p(v));
    // Underside of the foot at (x, z): the lowest foot point nearby.
    const under = (x: number, z: number) => {
      let y = Infinity;
      for (const r of [cm(1.2), cm(2.2), cm(3.5)]) {
        for (const p of foot) if (Math.hypot(p[0] - x, p[2] - z) < r) y = Math.min(y, p[1]);
        if (y < Infinity) return y;
      }
      return floor;
    };
    // Footprint outline (top view), slightly outside the upper.
    const outline = hullRing(foot, { origin: [0, floor, 0], normal: Y }, { slab: cm(40), samples: 40, offset: cm(0.45) });
    if (!outline) continue;
    const c = centroid(outline);
    const layer = (k: number, dy: number) => outline.map((p) => {
      const q = v3.lerp(p, c, k);
      return [q[0], under(q[0], q[2]) + dy, q[2]] as Vec3;
    });
    // Top surface reaches into the upper (no gap); bottom is the sole's tread.
    const top = cm(0.35), bot = -cm(0.55);
    const rings = [layer(0.97, top), layer(0.6, top), layer(0.25, top), layer(0, top), layer(0, bot), layer(0.25, bot), layer(0.6, bot), layer(0.97, bot)];
    const sole = loftRings(rings, { closedAround: true, tileU: 0.1, tileV: 0.1 });
    soles.push(orientOutward(sole, [c[0], under(c[0], c[2]), c[2]]));
    // Heel block: from the sole under the heel down to the floor, slimmer at the tip.
    let hc: Vec3 = [0, 0, 0], zMin = Infinity;
    for (const p of foot) zMin = Math.min(zMin, p[2]);
    const heelPts = foot.filter((p) => p[2] < zMin + cm(5));
    hc = centroid(heelPts);
    const hz = zMin + cm(2.4);
    const ht = under(hc[0], hz) + bot + cm(0.2);
    const hr: Vec3[][] = [];
    for (let k = 0; k <= 5; k++) {
      const f = k / 5;
      const y = ht + (floor - cm(0.7) - ht) * f;
      const r = cm(1.6) - cm(0.95) * f;
      const zc = hz + cm(0.6) * f;
      hr.push(Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return [hc[0] + Math.cos(a) * r, y, zc + Math.sin(a) * r * 1.2] as Vec3;
      }));
    }
    hr.push(hr[hr.length - 1].map((p) => v3.lerp(p, centroid(hr[hr.length - 1]), 0.98)));
    heels.push(orientOutward(loftRings(hr, { closedAround: true, tileU: 0.1 }), [hc[0], (ht + floor) / 2, hz]));
  }
  const dark = mat('Heel soles', null, { color: '#151313', roughness: 0.45 });
  // Sole, heel and toe box move rigidly with the foot (a shoe doesn't bend with the toes).
  const mids = [1, -1].map((s) => {
    const [a, c] = b.axis(REGION.foot, s);
    return v3.lerp(a, c, 0.45);
  });
  const rigidAt = (m: PolyMesh) => {
    const P = m.positions, out = new Float32Array(P.length);
    for (let i = 0; i < P.length; i += 3) out.set(P[i] > 0 ? mids[0] : mids[1], i);
    return out;
  };
  const withRigid = (m: PolyMesh | null) => (m ? { mesh: m, skinAt: rigidAt(m) } : null);
  const box = withRigid(merge(boxes)), soleM = withRigid(merge(soles)), heelM = withRigid(merge(heels));
  return [
    ...(sides ? [{ mesh: sides.mesh, material: leather, hides: sides.covered, smooth: true }] : []),
    ...(box ? [{ ...box, material: leather, hides: hidden }] : []),
    ...(soleM ? [{ ...soleM, material: dark, ground: true }] : []),
    ...(heelM ? [{ ...heelM, material: leather, ground: true }] : []),
  ];
}

function centroid(pts: Vec3[]): Vec3 {
  let c: Vec3 = [0, 0, 0];
  for (const p of pts) c = v3.add(c, v3.scale(p, 1 / pts.length));
  return c;
}

export const HEELS: GarmentDef = {
  id: 'heels', label: 'High heels', slot: 'feet', patterns: ['leather'], color: '#c9a07a', color2: '#000000',
  build: (g, st) => pump(g, st.color),
};
