/**
 * Beach accessories: sunglasses (and aviators), flip-flops and leather slides (the straw tote is a carried prop: props/carry.ts).
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION, type Body } from './body';
import { cloth, footSole, mat, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { Caster } from './project';
import { cord, ellipsoid, frameOf, hullRing, loftRings, merge, orientOutward, ribbon, v3 } from './ring';
import { makePattern } from './textures';

/** Every vertex of a part looks up its skin weights at `at` (the part moves rigidly with that spot). */
const rigidAt = (m: PolyMesh, at: Vec3): Float32Array => {
  const out = new Float32Array(m.positions.length);
  for (let i = 0; i < out.length; i += 3) out.set(at, i);
  return out;
};

/** Smooth closed outline of a rounded rectangle (superellipse) in a frame's x/y plane. */
function superellipse(o: Vec3, x: Vec3, y: Vec3, rx: number, ry: number, n = 40, k = 4): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const px = Math.sign(c) * Math.abs(c) ** (2 / k) * rx, py = Math.sign(s) * Math.abs(s) ** (2 / k) * ry;
    out.push(v3.add(o, v3.add(v3.scale(x, px), v3.scale(y, py))));
  }
  return out;
}

/** A flat, gently curved disc filling a closed outline (fan from its centre, bulged along `out`). */
function disc(outline: Vec3[], out: Vec3, bulge: number): PolyMesh {
  let c: Vec3 = [0, 0, 0];
  for (const p of outline) c = v3.add(c, v3.scale(p, 1 / outline.length));
  const rings: Vec3[][] = [];
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    rings.push(outline.map((p) => v3.madd(v3.lerp(c, p, t), out, bulge * (1 - t * t))));
  }
  return orientOutward(loftRings(rings, { closedAround: true, uRepeats: 1, tileV: 0.05 }), v3.madd(c, out, -1));
}

// --- Sunglasses ------------------------------------------------------------------------------

/** Teardrop aviator lens outline: a flat top, deepest toward the nose (inner side toward -s along x). */
function teardrop(o: Vec3, x: Vec3, y: Vec3, rx: number, ry: number, s: number, n = 48): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), sn = Math.sin(a);
    const px = c * rx;
    // Upper half: a gently arched brow line; lower half: rounder and deeper on the inner side.
    const py = sn >= 0 ? Math.abs(sn) ** 0.45 * ry * 0.72 : -(Math.abs(sn) ** 0.85) * ry * (1 + 0.16 * -s * c);
    out.push(v3.add(o, v3.add(v3.scale(x, px), v3.scale(y, py))));
  }
  return out;
}

interface Frames {
  name: string;
  /** Lens half-width and half-height. */
  rx: number;
  ry: number;
  outline: (o: Vec3, x: Vec3, y: Vec3, rx: number, ry: number, s: number) => Vec3[];
  /** Rim and temple thickness. */
  rim: number;
  arm: number;
  /** Aviators: a straight top bar between the lenses and nose pads, as well as the bridge. */
  aviator: boolean;
  /** Glossy acetate (not metal) frames, with nearly opaque lenses. */
  acetate?: boolean;
}

/** Cat-eye lens outline: a slim rounded rectangle whose outer top corner sweeps up and out. */
function catEye(o: Vec3, x: Vec3, y: Vec3, rx: number, ry: number, s: number, n = 48): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), sn = Math.sin(a);
    // (s: +1 for the left lens, whose outer side is +x.)
    // u: -1 at the inner (nose) side to +1 at the outer side.
    const u = c * s, outer = Math.max(0, u), top = Math.max(0, sn);
    const px = Math.sign(c) * Math.abs(c) ** 0.75 * rx;
    // The whole lens lifts toward its outer side; the top edge sweeps up into a point at the outer
    // corner, and the bottom edge curves up to meet it.
    const lift = ry * 0.3 * u;
    const flick = ry * 0.6 * outer ** 4 * top ** 0.35;
    const py = sn >= 0 ? sn ** 0.6 * ry * 0.75 + lift + flick : -(Math.abs(sn) ** 0.9) * ry * (1 - 0.35 * outer) + lift * 0.6;
    out.push(v3.add(o, v3.add(v3.scale(x, px), v3.scale(y, py))));
  }
  return out;
}

const WAYFARER: Frames = { name: 'Sunglasses', rx: cm(2.9), ry: cm(2.3), outline: (o, x, y, rx, ry) => superellipse(o, x, y, rx, ry), rim: cm(0.16), arm: cm(0.18), aviator: false };
const CAT_EYE: Frames = { name: 'Sleek sunglasses', rx: cm(2.9), ry: cm(1.9), outline: catEye, rim: cm(0.22), arm: cm(0.16), aviator: false, acetate: true };
const AVIATOR: Frames = { name: 'Aviators', rx: cm(2.95), ry: cm(2.55), outline: teardrop, rim: cm(0.085), arm: cm(0.1), aviator: true };

/** Glasses fitted to the face: lenses over the eyes wrapping a little round it, temples back over the ears. */
function eyewear(g: GCtx, st: GarmentStyle, f: Frames): GPart[] {
  const b = g.body;
  const eyeR = b.joint('eye.R____head'), eyeL = b.joint('eye.L____head');
  const front = Math.max(b.joint('eye.L____tail')[2], b.joint('eye.R____tail')[2]);
  // Head surface points, for the nose bridge and the ears.
  const head = b.verts(REGION.head).map((v) => b.p(v));
  const eyeY = (eyeL[1] + eyeR[1]) / 2;
  let bridgeZ = front;
  for (const p of head) if (Math.abs(p[0]) < cm(0.6) && Math.abs(p[1] - eyeY) < cm(0.8)) bridgeZ = Math.max(bridgeZ, p[2]);
  const lensZ = Math.max(front + cm(1.0), bridgeZ + cm(0.15));
  const lenses: PolyMesh[] = [], rims: PolyMesh[] = [], arms: PolyMesh[] = [], tops: Vec3[] = [];
  for (const [s, eye] of [[1, eyeL], [-1, eyeR]] as const) {
    // Lens: centred a little outside the eye, turned 12 degrees to wrap the face.
    const yaw = s * 0.21;
    const x: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)], y: Vec3 = [0, 1, 0], out = v3.cross(x, y);
    const o: Vec3 = [eye[0] + s * cm(0.3), eyeY - cm(0.2), lensZ - Math.abs(eye[0]) * Math.sin(Math.abs(yaw)) * 0.4];
    const rim = f.outline(o, x, y, f.rx, f.ry, s);
    lenses.push(disc(rim, out, cm(0.25)));
    rims.push(cord([...rim, rim[0]], f.rim, false, 6));
    // The rim's inner top corner (where an aviator's top bar meets it).
    tops.push(v3.madd(v3.madd(o, x, -s * f.rx * 0.62), y, f.ry * 0.62));
    // Temple arm: from the lens's outer corner back above the ear and down behind it.
    let ear: Vec3 = [s * 0.5, eyeY, 0];
    for (const p of head) if (p[0] * s > ear[0] * s && Math.abs(p[1] - eyeY) < cm(3)) ear = p;
    const hinge = v3.madd(v3.madd(o, x, s * f.rx), y, f.aviator ? f.ry * 0.45 : 0);
    // (Close to the head: under the hair once it reaches it.)
    const above: Vec3 = [ear[0] - s * cm(0.15), eyeY + cm(0.2), ear[2] + cm(1)];
    // The tip tucks in behind the ear, toward the head (inside the hair).
    const behind: Vec3 = [ear[0] - s * cm(0.6), eyeY - cm(1.6), ear[2] - cm(1.6)];
    arms.push(cord([hinge, v3.lerp(hinge, above, 0.5), above, behind], f.arm, false, 6));
  }
  // Bridge between the lenses, over the nose; aviators add a straight bar above it and nose pads.
  const extras: (PolyMesh | null)[] = [cord([
    [cm(1.4), eyeY + cm(0.6), lensZ],
    [0, eyeY + cm(0.9), bridgeZ + cm(0.5)],
    [-cm(1.4), eyeY + cm(0.6), lensZ],
  ], f.aviator ? f.rim * 1.2 : cm(0.15), false, 6)];
  if (f.aviator) {
    extras.push(cord([tops[0], [0, tops[0][1] + cm(0.1), (tops[0][2] + tops[1][2]) / 2 + cm(0.1)], tops[1]], f.rim, false, 6));
    for (const s of [1, -1]) {
      const pad: Vec3 = [s * cm(0.75), eyeY - cm(0.6), bridgeZ - cm(0.1)];
      extras.push(ellipsoid(frameOf(pad, v3.norm([s * 0.8, 0, 0.6]), [0, 1, 0]), [cm(0.35), cm(0.55), cm(0.12)], [0.5, 0.5], 8, 4));
    }
  }
  const frame = mat(`${f.name} frame`, null, f.acetate ? { color: st.color2, roughness: 0.12, metalness: 0 } : { color: st.color2, roughness: 0.25, metalness: 0.85 });
  const lens = mat(`${f.name} lenses`, null, { color: st.color, roughness: 0.04, metalness: 0.3, alpha: 'blend', opacity: f.acetate ? 0.96 : 0.88 });
  const skull = b.joint('head____head');
  const at: Vec3 = [0, eyeY, skull[2]];
  const frameMesh = merge([...rims, ...arms, ...extras])!, lensMesh = merge(lenses)!;
  return [
    { mesh: frameMesh, material: frame, skinAt: rigidAt(frameMesh, at) },
    { mesh: lensMesh, material: lens, skinAt: rigidAt(lensMesh, at) },
  ];
}

// --- Flip-flops ------------------------------------------------------------------------------

/**
 * A sole moulded to the foot: the footprint outline, its top following the underside of the foot
 * (so the forefoot and toes rest on it) and its bottom flat on the ground `thick` below the heel.
 */
function moulded(b: Body, s: number, under: Caster, thick: number, margin: number): PolyMesh | null {
  const foot = b.verts(REGION.foot, s).map((v) => b.p(v));
  if (!foot.length) return null;
  let minY = Infinity;
  for (const p of foot) minY = Math.min(minY, p[1]);
  const ring = hullRing(foot, { origin: [0, minY, 0], normal: [0, 1, 0] }, { slab: cm(40), samples: 40, offset: margin });
  if (!ring) return null;
  let c: Vec3 = [0, 0, 0];
  for (const p of ring) c = v3.add(c, v3.scale(p, 1 / ring.length));
  // Underside height at (x, z): the foot's lowest surface there, or the nearest found further in.
  const topAt = (x: number, z: number) => {
    for (let k = 0; k <= 6; k++) {
      const h = under.hit(x + (c[0] - x) * k * 0.12, z + (c[2] - z) * k * 0.12);
      if (h) return Math.max(minY, h.p[1]) + cm(0.05);
    }
    return minY;
  };
  const layer = (k: number, y: (x: number, z: number) => number) =>
    ring.map((p) => {
      const q = v3.lerp(p, c, k);
      return [q[0], y(q[0], q[2]), q[2]] as Vec3;
    });
  const floor = minY - thick;
  const steps = [0, 0.3, 0.55, 0.75, 0.9, 0.99];
  const rings = [...steps.map((k) => layer(k, topAt)), ...[...steps].reverse().map((k) => layer(k, () => floor))];
  return orientOutward(loftRings(rings, { closedAround: true, closedAcross: true, tileU: 0.1, tileV: 0.1 }), [c[0], (minY + floor) / 2, c[2]]);
}

/**
 * Flip-flops: a thick sole and a Y-shaped thong. A short post rises between the first two toes;
 * from a knot on top of the foot two straps run over the instep down to the sole's edges. The
 * straps are laid on the top of the foot by casting rays down onto it.
 */
export function flipFlops(g: GCtx, color = '#d8c39a', strap = '#c9963a'): GPart[] {
  const b = g.body;
  const fv = g.faceVerts;
  const soles: PolyMesh[] = [], straps: PolyMesh[] = [];
  for (const s of [1, -1]) {
    const keepFoot = (f: number) => b.regions[fv[f * 4]] === REGION.foot && b.info[fv[f * 4]].side === s;
    const sole = moulded(b, s, new Caster(b, fv, keepFoot, 'below'), cm(1.6), cm(0.45));
    if (!sole) continue;
    soles.push(sole);
    const side = s > 0 ? '.L' : '.R';
    const top = new Caster(b, fv, keepFoot, 'above');
    const foot = b.verts(REGION.foot, s).map((v) => b.p(v));
    let minY = Infinity;
    for (const p of foot) minY = Math.min(minY, p[1]);
    const t1 = b.joint(`toe1-1${side}____head`), t2 = b.joint(`toe2-1${side}____head`);
    const [fa, fb] = b.axis(REGION.foot, s);
    const dir = v3.norm([fb[0] - fa[0], 0, fb[2] - fa[2]]), across: Vec3 = [dir[2], 0, -dir[0]];
    // Post: between the first two toes, just behind their bases.
    const post = v3.madd(v3.lerp(t1, t2, 0.5), dir, -cm(1.2));
    // A point on the top of the foot (x, z), lifted off the skin.
    const onTop = (x: number, z: number, lift = cm(0.35)): Vec3 | null => {
      const h = top.hit(x, z);
      return h ? v3.madd(h.p, h.n, lift) : null;
    };
    const knot = onTop(post[0], post[2]);
    if (!knot) continue;
    // Strap ends: where the sole's edge is, either side of the foot, a little ahead of the arch.
    const mid = v3.lerp(fa, fb, 0.4);
    let w = cm(3);
    while (w < cm(8) && top.hit(mid[0] + across[0] * w, mid[2] + across[2] * w) && top.hit(mid[0] - across[0] * w, mid[2] - across[2] * w)) w += cm(0.2);
    for (const sgn of [1, -1]) {
      // The inner (arch-side) strap reaches further back than the outer one.
      const medial = across[0] * sgn * s < 0;
      const end = medial ? v3.lerp(fa, fb, 0.3) : mid;
      const path: Vec3[] = [knot];
      for (let k = 1; k <= 10; k++) {
        const t = k / 10;
        // From the knot back toward the arch, curving out to the side.
        const x = post[0] + (end[0] - post[0]) * t + across[0] * sgn * w * t ** 0.8;
        const z = post[2] + (end[2] - post[2]) * t + across[2] * sgn * w * t ** 0.8;
        const p = onTop(x, z);
        if (p) path.push(p);
      }
      // Down the side to the sole.
      const last = path[path.length - 1];
      path.push([last[0] + across[0] * sgn * cm(0.4), minY, last[2] + across[2] * sgn * cm(0.4)]);
      straps.push(cord(path, cm(0.4), false, 8));
    }
    // The post: from the sole up through the toe gap to the knot.
    straps.push(cord([[post[0], minY + cm(0.1), post[2]], knot], cm(0.22), false, 6));
  }
  const rubber = g.texture(`solid_${color}`, () => makePattern('solid', color, color));
  return [
    ...(soles.length ? [{ mesh: merge(soles)!, material: mat('Flip-flop soles', rubber, { roughness: 0.75 }), ground: true }] : []),
    ...(straps.length ? [{ mesh: merge(straps)!, material: mat('Flip-flop straps', null, { color: strap, roughness: 0.35, metalness: 0.5 }) }] : []),
  ];
}

/**
 * Leather slides: a flat footbed and two wide leather straps over
 * the foot, one over the instep and one over the base of the toes, laid on the foot's top and
 * dropping to the sole at either side.
 */
function slides(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const fv = g.faceVerts;
  const soles: PolyMesh[] = [], straps: PolyMesh[] = [];
  for (const s of [1, -1]) {
    const keepFoot = (f: number) => b.regions[fv[f * 4]] === REGION.foot && b.info[fv[f * 4]].side === s;
    // A flat footbed, 2.2 cm thick, just outside the footprint.
    const sole = footSole(b, s, cm(2.2), cm(0.6), cm(0.2));
    if (!sole) continue;
    soles.push(sole);
    const top = new Caster(b, fv, keepFoot, 'above');
    const foot = b.verts(REGION.foot, s).map((v) => b.p(v));
    let minY = Infinity;
    for (const p of foot) minY = Math.min(minY, p[1]);
    const [fa, fb] = b.axis(REGION.foot, s);
    const dir = v3.norm([fb[0] - fa[0], 0, fb[2] - fa[2]]), across: Vec3 = [dir[2], 0, -dir[0]];
    for (const f of [0.42, 0.78]) {
      const mid = v3.lerp(fa, fb, f);
      // Across the foot's top from one side to the other, then down to the sole at each end.
      const line: Vec3[] = [], normals: Vec3[] = [];
      for (let k = -14; k <= 14; k++) {
        const x = mid[0] + across[0] * cm(0.45) * k, z = mid[2] + across[2] * cm(0.45) * k;
        const h = top.hit(x, z);
        if (!h) continue;
        line.push(v3.madd(h.p, [0, 1, 0], cm(0.35)));
        normals.push(h.n);
      }
      if (line.length < 4) continue;
      for (const end of [0, 1]) {
        const p = end ? line[line.length - 1] : line[0], n = end ? normals[normals.length - 1] : normals[0];
        const side = v3.scale(across, end ? 1 : -1);
        const down: Vec3 = [p[0] + side[0] * cm(0.4), minY + cm(0.3), p[2] + side[2] * cm(0.4)];
        const pts = [v3.lerp(p, down, 0.5), down];
        if (end) {
          line.push(...pts);
          normals.push(n, side);
        } else {
          line.unshift(...pts.reverse());
          normals.unshift(side, n);
        }
      }
      // A smooth arch: the path smoothed, its normals pointing out from an axis under the foot.
      let path = line;
      for (let it = 0; it < 4; it++) path = path.map((q, i) => (i === 0 || i === path.length - 1 ? q : v3.scale(v3.add(v3.add(path[i - 1], v3.scale(q, 2)), path[i + 1]), 0.25)));
      const axis: Vec3 = [mid[0], minY - cm(1.5), mid[2]];
      const ns = path.map((q) => {
        const d = v3.sub(q, axis);
        return v3.norm(v3.sub(d, v3.scale(dir, v3.dot(d, dir))));
      });
      straps.push(ribbon(path, ns, cm(f < 0.6 ? 3.6 : 3), cm(0.35)));
    }
  }
  const leather = cloth(g, 'Slide straps', st, { roughness: 0.45 });
  return [
    ...(soles.length ? [{ mesh: merge(soles)!, material: mat('Slide soles', null, { color: st.color2, roughness: 0.7 }), ground: true }] : []),
    ...(straps.length ? [{ mesh: merge(straps)!, material: { ...leather, doubleSided: true } }] : []),
  ];
}

export const SLIDES: GarmentDef = {
  id: 'slides', label: 'Leather slides', slot: 'feet', patterns: ['nappa', 'leather'], color: '#151515', color2: '#2a2522', build: slides,
};

export const BEACH: GarmentDef[] = [
  { id: 'sunglasses', label: 'Sunglasses', slot: 'acc', patterns: ['solid'], color: '#1a1410', color2: '#c9963a', build: (g, st) => eyewear(g, st, WAYFARER) },
  { id: 'sunglasses_sleek', label: 'Sleek sunglasses (cat-eye)', slot: 'acc', patterns: ['solid'], color: '#17110e', color2: '#141414', build: (g, st) => eyewear(g, st, CAT_EYE) },
  { id: 'aviators', label: 'Aviator sunglasses', slot: 'acc', patterns: ['solid'], color: '#3b2a1c', color2: '#d8b25a', build: (g, st) => eyewear(g, st, AVIATOR) },
];
