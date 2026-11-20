/**
 * Work, hobby and sports kit: a chef's double-breasted jacket and tall pleated hat, a bib apron, over-ear headphones,
 * a camera on a neck strap, long sports socks, and numbered football and basketball
 * jerseys.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION } from './body';
import { cloth, isTrunk, mat, overWorn, points, shell, shellPart, STEEL, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { dressPts, knee, looseSkin } from './drape';
import { Caster } from './project';
import { cord, ellipsoid, frameOf, hullRing, loftRings, merge, rayRing, v3 } from './ring';
import { cutShell } from './shell';
import { chestSkin, singletCut } from './singlet';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const soften = (path: Vec3[], passes: number): Vec3[] => {
  let p = path;
  for (let k = 0; k < passes; k++) p = p.map((q, i) => (i === 0 || i === p.length - 1 ? q : v3.scale(v3.add(v3.add(p[i - 1], p[i + 1]), v3.scale(q, 2)), 0.25)));
  return p;
};
/** Whatever is already worn over the trunk, seen from the front, to lay things on. */
const frontSurface = (g: GCtx) => {
  const worn = merge([...(g.topParts ?? []), ...(g.jacketParts ?? [])].map((p) => p.mesh));
  return worn ? new Caster(worn, null, () => true, 'front') : new Caster(g.body, g.faceVerts, () => true, 'front');
};

/** The chef's jacket: long sleeves, a stand collar, and two rows of cloth-covered buttons down the front. */
function chefJacket(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, L = b.L, tn = cm(2.6) / (L.neckY - L.hipY);
  const m = cloth(g, 'Chef jacket', st);
  const body = shellPart(g, {
    covers: (v) => (isTrunk(v) && v.tt > 0.1) || (v.region === REGION.neck && v.t < 1 + tn) ||
      v.region === REGION.upperarm || (v.region === REGION.lowerarm && v.t < 0.9),
    offset: (v) => cm(1.1) + (v.region === REGION.lowerarm ? cm(0.4) * v.t : 0), tile: 0.3, relax: 3,
  }, m);
  if (!body[0]) return [];
  const surf = new Caster(body[0].mesh, null, () => true, 'front');
  const studs: PolyMesh[] = [];
  for (const s of [1, -1]) for (let k = 0; k < 5; k++) {
    const tt = 0.86 - k * 0.1, x = s * (0.3 - 0.03 * k) * L.shoulderX, y = L.hipY + tt * (L.neckY - L.hipY);
    const hit = surf.hit(x, y);
    if (hit) studs.push(ellipsoid(frameOf(v3.madd(hit.p, hit.n, cm(0.2)), hit.n, [0, 1, 0]), [cm(1), cm(1), cm(0.45)], [0.5, 0.5], 14, 6));
  }
  return [...body, ...(studs.length ? [{ mesh: merge(studs)!, material: mat('Chef jacket buttons', null, { color: st.color2, roughness: 0.5, doubleSided: true }) }] : [])];
}

/** A tall pleated chef's hat (toque): a fitted band round the head, then a puffed, pleated crown above it. */
function chefHat(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, H = b.L.crownY - b.L.chinY;
  const head = points(b, (v) => v.region === REGION.head);
  const bandY = b.L.chinY + 0.7 * H, n = v3.norm([0, 1, -0.08]), S = 64;
  const band = hullRing(head, { origin: [0, bandY, b.L.headZ], normal: n, ref: [0, 0, 1] }, { slab: cm(0.8), samples: S, offset: cm(0.6) });
  if (!band) return [];
  let c: Vec3 = [0, 0, 0];
  for (const p of band) c = v3.add(c, v3.scale(p, 1 / band.length));
  const at = (k: number, t: number): Vec3[] => band.map((p, j) => {
    // Pleats: sixteen soft folds round the crown, fading in above the band.
    const pleat = 1 + 0.05 * Math.cos((j / S) * Math.PI * 32) * smooth((t - 0.18) / 0.2);
    const r = k * pleat;
    return [c[0] + (p[0] - c[0]) * r, p[1] + t * cm(24), c[2] + (p[2] - c[2]) * r];
  });
  const rings: Vec3[][] = [];
  // The band (straight), then the crown flaring out to 1.3x and rounding over the top.
  for (let i = 0; i <= 4; i++) rings.push(at(1, (i / 4) * 0.18));
  for (let i = 1; i <= 14; i++) {
    const t = i / 14, flare = 1 + 0.32 * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2), close = t > 0.82 ? Math.cos(((t - 0.82) / 0.18) * Math.PI / 2) : 1;
    rings.push(at(flare * Math.max(0.05, close), 0.18 + 0.82 * t - (t > 0.82 ? 0.08 * (t - 0.82) / 0.18 : 0)));
  }
  const mesh = loftRings(rings, { closedAround: true, closedAcross: false, tileU: 0.25, tileV: 0.25 });
  const fabric = mat('Chef hat', null, { color: st.color, roughness: 0.85, doubleSided: true });
  return [{ mesh, material: fabric, headwear: true, hidesHair: true, smooth: true }];
}


/**
 * A bib apron: a bib with a straight top edge across the upper chest that widens below the chest to the sides, held
 * by a strap from each top corner round the back of the neck; a skirt from the waist to below the knee; ties round
 * the waist, knotted at the front with the ends hanging down.
 */
function apron(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, L = b.L, H = L.neckY - L.hipY, sx = L.shoulderX;
  const clear = overWorn(g, cm(0.5), cm(0.5));
  // Half-width of the bib by torso height: narrow at the top, flaring out to the sides between the chest and the waist.
  const topT = 0.8, half = (tt: number) => (0.52 + 0.62 * smooth((0.66 - tt) / 0.3)) * sx;
  const bib = shell(g, {
    covers: (v, q) => isTrunk(v) && v.tt > 0.22 && v.tt < topT && q[2] > L.torsoZ - cm(2) && Math.abs(q[0]) < half(v.tt),
    offset: clear, tile: 0.3, relax: 2, hemDepth: cm(0.15),
  });
  // The skirt: from the waist to below the knee, round the front and sides, falling straight over the hips and legs.
  let hipX = 0;
  for (const v of b.verts(REGION.hips)) hipX = Math.max(hipX, Math.abs(b.coords[v * 3]));
  const yTop = L.hipY + 0.28 * H, yEnd = knee(b) - cm(8), c: Vec3 = [0, 0, L.torsoZ];
  const src = [...dressPts(b), ...(g.worn ?? [])].filter((q) => Math.abs(q[0]) < hipX + cm(2.5));
  const M = 40, R = 16, rows: Vec3[][] = [];
  let prev: number[] = [];
  for (let i = 0; i <= R; i++) {
    const y = yTop + (yEnd - yTop) * (i / R), h = hullRing(src.filter((q) => Math.abs(q[1] - y) < cm(3)), { origin: [0, y, L.torsoZ], normal: [0, 1, 0] }, { slab: cm(3), samples: 96, offset: cm(1) });
    const row: Vec3[] = [], rr: number[] = [];
    for (let j = 0; j <= M; j++) {
      const a = -1.3 + 2.6 * (j / M), d: Vec3 = [Math.sin(a), 0, Math.cos(a)];
      const rad = Math.max(prev[j] ?? 0, h ? rayRing(h, [c[0], y, c[2]], d) ?? 0 : 0);
      rr.push(rad); row.push([c[0] + d[0] * rad, y, c[2] + d[2] * rad]);
    }
    prev = rr; rows.push(row);
  }
  const skirt = loftRings(rows, { closedAround: false, tileU: 0.3, tileV: 0.3 });
  const fabric = { ...cloth(g, 'Apron', st), doubleSided: true };

  // The neck strap: from each top corner of the bib, up over the collarbone to the side of the neck and round the back.
  const neck = points(b, (v) => v.region === REGION.neck);
  const base = neck.filter((p) => Math.abs(p[1] - L.neckY) < cm(1.5));
  const halfX = Math.max(...base.map((p) => Math.abs(p[0]))), nz = base.reduce((s, p) => s + p[2], 0) / Math.max(1, base.length);
  const backZ = Math.min(...base.map((p) => p[2]));
  const collar = (g.worn ?? []).some((p) => Math.abs(p[1] - L.neckY) < cm(2) && Math.abs(p[0]) < halfX + cm(4)) ? cm(1.6) : cm(0.7);
  const surf = frontSurface(g), topY = L.hipY + topT * H - cm(0.6);
  const onFront = (x: number, y: number, lift: number): Vec3 => {
    const h = surf.hit(x, y);
    return h ? v3.madd(h.p, h.n, lift) : [x, y, L.torsoZ + cm(10)];
  };
  // Over the bib the strap lies on the bib itself (which stands clear of the clothes), so it runs on into it.
  const onBib = bib ? new Caster(bib.mesh, null, () => true, 'front') : null;
  const lieAt = (x: number, y: number): Vec3 => { const h = onBib?.hit(x, y); return h ? v3.madd(h.p, h.n, cm(0.35)) : onFront(x, y, cm(0.9)); };
  const side = (s: number): Vec3[] => {
    // From just inside the bib's top corner on this side.
    let corner: Vec3 = [s * (half(topT) - cm(1.6)), topY - cm(3), 0];
    if (bib) {
      const P = bib.mesh.positions;
      let top = -Infinity;
      for (let i = 1; i < P.length; i += 3) top = Math.max(top, P[i]);
      let ex = 0;
      for (let i = 0; i < P.length; i += 3) if (P[i + 1] > top - cm(1.5) && P[i] * s > ex) ex = P[i] * s;
      corner = [s * (ex - cm(1.4)), top - cm(2), 0];
    }
    const from = lieAt(corner[0], corner[1]), to: Vec3 = [s * (halfX + collar), L.neckY - cm(1), nz + cm(0.5)];
    const path: Vec3[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t;
      const lie = lieAt(x, y), z = from[2] + (to[2] - from[2]) * t;
      path.push([x, y, Math.max(z, lie[2])]);
    }
    return path;
  };
  const behind = behindNeck(g, halfX, nz, backZ, L.neckY - cm(1), cm(1.5), collar).reverse();
  const strap = soften([...side(-1), ...behind, ...side(1).reverse()], 3);

  // Waist ties: round the waist over the apron, knotted at the front, the two ends hanging over the skirt.
  const waistY = yTop + cm(0.8);
  const waist = hullRing(src.filter((q) => Math.abs(q[1] - waistY) < cm(3)), { origin: [0, waistY, L.torsoZ], normal: [0, 1, 0] }, { slab: cm(3), samples: 64, offset: cm(1.5) });
  const frontZ = (y: number, x: number) => {
    const i = Math.max(0, Math.min(R, Math.round(((y - yTop) / (yEnd - yTop)) * R))), j = Math.round(M / 2 + (x / cm(30)) * (M / 2.6));
    return rows[i][Math.max(0, Math.min(M, j))][2];
  };
  const knot: Vec3 = [cm(1), waistY, frontZ(waistY, cm(1)) + cm(1)];
  const ends = [[-cm(1.5), cm(30)], [cm(3), cm(36)]].map(([dx, len]) => {
    const path: Vec3[] = [];
    for (let k = 0; k <= 8; k++) { const y = waistY - (len * k) / 8, x = knot[0] + dx * (k / 8); path.push([x, y, frontZ(y, x) + cm(0.5)]); }
    return cord(path, cm(0.45), false, 6);
  });
  const ties = mat('Apron ties', null, { color: st.color2, roughness: 0.8 });
  return [
    ...(bib ? [{ mesh: bib.mesh, material: fabric, smooth: true }] : []),
    { mesh: skirt, material: fabric, skinAt: looseSkin(b, skirt, 0.3, 0.3) },
    { mesh: merge([cord(strap, cm(0.5), false, 6), ...(waist ? [cord(waist, cm(0.45), true, 6)] : []), ellipsoid(frameOf(knot, [0, 0, 1], [0, 1, 0]), [cm(1.5), cm(1), cm(0.8)], [0.5, 0.5], 10, 6)])!, material: ties },
    { mesh: merge(ends)!, material: ties, skinAt: looseSkin(b, merge(ends)!, 0.3, 0.3) },
  ];
}

/**
 * A strap's path round the back of the neck, from the right side (+x) to the left: an oval through the sides of the
 * neck that bulges out wherever the clothes there (a collar) stand further out, so it always lies on top of them.
 */
function behindNeck(g: GCtx, halfX: number, nz: number, backZ: number, y0: number, rise: number, gap: number): Vec3[] {
  const worn = [...(g.worn ?? []), ...(g.jacket ?? [])].filter((q) => q[2] < nz + cm(1) && Math.abs(q[1] - y0 - rise / 2) < rise / 2 + cm(2.5) && Math.hypot(q[0], q[2] - nz) < Math.max(halfX, nz - backZ) + gap + cm(3));
  const out: Vec3[] = [];
  for (let i = 1; i < 16; i++) {
    const a = Math.PI * (i / 16), back = Math.sin(a), y = y0 + rise * back;
    const ex = Math.cos(a) * (halfX + gap), ez = -(nz - backZ + gap) * back, base = Math.hypot(ex, ez), d: [number, number] = [ex / base, ez / base];
    let r = base;
    for (const q of worn) {
      if (Math.abs(q[1] - y) > cm(2.5)) continue;
      const qx = q[0], qz = q[2] - nz, along = qx * d[0] + qz * d[1];
      if (along > 0 && Math.abs(qx * d[1] - qz * d[0]) < cm(1.5)) r = Math.max(r, along + gap);
    }
    out.push([d[0] * r, y, nz + d[1] * r]);
  }
  return out;
}

/** A closed cylinder along +z of a frame: radius by height (0 = back, 1 = front), capped at both ends. */
function lathe(f: { o: Vec3; x: Vec3; y: Vec3; z: Vec3 }, profile: [number, number][], seg = 28): PolyMesh {
  const at = (z: number, r: number) => {
    const ring: Vec3[] = [];
    for (let j = 0; j < seg; j++) { const a = (j / seg) * Math.PI * 2; ring.push(v3.add(f.o, v3.add(v3.add(v3.scale(f.x, Math.cos(a) * r), v3.scale(f.y, Math.sin(a) * r)), v3.scale(f.z, z)))); }
    return ring;
  };
  const rings = [at(profile[0][0], 0), ...profile.map(([z, r]) => at(z, r)), at(profile[profile.length - 1][0], 0)];
  return loftRings(rings, { closedAround: true, closedAcross: false, tileU: 0.1, tileV: 0.1 });
}

/** A rounded rectangle extruded along a frame's z, with a small bevel at both faces (half-sizes; r: corner radius). */
function block(f: { o: Vec3; x: Vec3; y: Vec3; z: Vec3 }, hx: number, hy: number, hz: number, r: number, bevel: number): PolyMesh {
  const ring = (inset: number, z: number): Vec3[] => {
    const pts: Vec3[] = [], rr = Math.max(0.0001, r - inset * 0.5), ax = hx - inset - rr, ay = hy - inset - rr;
    for (const [cx, cy, a0] of [[ax, ay, 0], [-ax, ay, 0.5], [-ax, -ay, 1], [ax, -ay, 1.5]] as const)
      for (let k = 0; k <= 5; k++) { const a = (a0 + k / 10) * Math.PI; pts.push(v3.add(f.o, v3.add(v3.add(v3.scale(f.x, cx + Math.cos(a) * rr), v3.scale(f.y, cy + Math.sin(a) * rr)), v3.scale(f.z, z)))); }
    return pts;
  };
  const centre = (z: number) => ring(0, z).map(() => v3.add(f.o, v3.scale(f.z, z)));
  const rings = [centre(-hz), ring(bevel, -hz), ring(0, -hz + bevel), ring(0, hz - bevel), ring(bevel, hz), centre(hz)];
  return loftRings(rings, { closedAround: true, closedAcross: false, tileU: 0.1, tileV: 0.1 });
}

/** One headphone ear cup in a frame whose z points away from the head: a padded cushion, then the rounded shell. */
function earCup(o: Vec3, out: Vec3, up: Vec3) {
  const f = frameOf(o, out, up), R = cm(4.2), T = cm(2.6);
  const shell = lathe(f, [[0, R * 0.9], [T * 0.15, R], [T * 0.75, R], [T, R * 0.82], [T * 1.08, R * 0.55]]);
  const ring: Vec3[] = [];
  for (let j = 0; j < 24; j++) { const a = (j / 24) * Math.PI * 2; ring.push(v3.add(o, v3.add(v3.scale(f.x, Math.cos(a) * R * 0.74), v3.scale(f.y, Math.sin(a) * R * 0.74)))); }
  const cushion = cord([...ring, ring[0]], cm(1), true, 10);
  return { shell, cushion, top: v3.add(v3.madd(o, f.y, R * 0.95), v3.scale(f.z, T * 0.5)), f };
}

/** The headphones' band between two points, bowed through `via`, with a padded strip under its middle. */
function headband(a: Vec3, via: Vec3, c: Vec3): { band: PolyMesh; pad: PolyMesh } {
  const path: Vec3[] = [];
  for (let k = 0; k <= 24; k++) {
    const t = k / 24, u = 1 - t;
    path.push([u * u * a[0] + 2 * u * t * via[0] + t * t * c[0], u * u * a[1] + 2 * u * t * via[1] + t * t * c[1], u * u * a[2] + 2 * u * t * via[2] + t * t * c[2]]);
  }
  return { band: cord(path, cm(0.55), false, 8), pad: cord(path.slice(6, 19), cm(0.85), false, 8) };
}

/** Over-ear headphones worn on the ears: a cup over each ear, the band over the top of the head. */
function headphones(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, L = b.L, shells: PolyMesh[] = [], pads: PolyMesh[] = [], tops: Vec3[] = [];
  // The ears: the head's widest points a little above the chin-to-crown middle, behind its centre.
  const Hh = L.crownY - L.chinY, ey = L.chinY + 0.43 * Hh, ez = L.headZ - cm(2.2);
  const head = points(b, (v) => v.region === REGION.head).filter((p) => Math.abs(p[1] - ey) < cm(2) && Math.abs(p[2] - ez) < cm(3));
  const earX = Math.max(cm(6), ...head.map((p) => Math.abs(p[0])));
  for (const s of [1, -1]) {
    const cup = earCup([s * (earX + cm(1.4)), ey, ez], [s, 0, 0], [0, 1, 0]);
    shells.push(cup.shell); pads.push(cup.cushion); tops.push(cup.top);
  }
  const band = headband(tops[0], [0, L.crownY + cm(3.4) + (L.crownY - tops[0][1]) * 0.9, ez], tops[1]);
  return [
    { mesh: merge([...shells, band.band])!, material: mat('Headphones', null, { color: st.color, roughness: 0.4 }) },
    { mesh: merge([...pads, band.pad])!, material: mat('Headphone pads', null, { color: st.color2, roughness: 0.75 }) },
  ];
}

/**
 * A camera (a DSLR with a zoom lens) on a neck strap: the strap round the back of the neck, the camera resting on the
 * chest with its lens forward. On rigged characters it has its own joint, so the photo clip can lift it to the eye;
 * the strap's sides stretch with it.
 */
function camera(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, L = b.L, H = L.neckY - L.hipY;
  const neck = points(b, (v) => v.region === REGION.neck), base = neck.filter((p) => Math.abs(p[1] - L.neckY) < cm(1.5));
  if (!base.length) return [];
  const halfX = Math.max(...base.map((p) => Math.abs(p[0]))), nz = base.reduce((s, p) => s + p[2], 0) / base.length;
  const backZ = Math.min(...base.map((p) => p[2]));
  const collar = (g.worn ?? []).some((p) => Math.abs(p[1] - L.neckY) < cm(2) && Math.abs(p[0]) < halfX + cm(4)) ? cm(1.5) : cm(0.6);
  const surf = frontSurface(g);
  const y = L.hipY + 0.58 * H, hit = surf.hit(0, y);
  // The camera hangs with its back flat on the chest and the lens pointing forward and a little down.
  const centre: Vec3 = hit ? v3.madd(hit.p, [0, 0, 1], cm(2.6)) : [0, y, L.torsoZ + cm(13)];
  const f = frameOf(centre, v3.norm([0, -0.12, 1]), [0, 1, 0]);
  const at = (x: number, yy: number, z: number): Vec3 => v3.add(f.o, v3.add(v3.add(v3.scale(f.x, x), v3.scale(f.y, yy)), v3.scale(f.z, z)));
  const sub = (o: Vec3) => ({ ...f, o });
  // f.x is the camera's left (the photographer's right is -x): the grip and shutter are there.
  const body = block(f, cm(6.4), cm(3.7), cm(2.2), cm(0.9), cm(0.35));
  const grip = block(sub(at(-cm(5.1), -cm(0.3), cm(1.5))), cm(1.5), cm(3.4), cm(1.5), cm(1.2), cm(0.3));
  const hump = block(sub(at(0, cm(4.3), -cm(0.3))), cm(2.3), cm(1.2), cm(1.7), cm(0.6), cm(0.3));
  const shoe = block(sub(at(0, cm(5.65), -cm(0.3))), cm(1), cm(0.15), cm(0.9), cm(0.1), cm(0.05));
  const lensF = sub(at(0, -cm(0.2), 0));
  const lens = lathe(lensF, [[cm(2.1), cm(3.1)], [cm(2.9), cm(3.1)], [cm(3), cm(3.35)], [cm(9.4), cm(3.35)], [cm(9.5), cm(3.6)], [cm(10.4), cm(3.6)], [cm(10.5), cm(3.2)]], 32);
  // A ribbed zoom ring in rubber and a thin silver ring near the front.
  const ribs: PolyMesh[] = [];
  for (let k = 0; k < 7; k++) ribs.push(lathe(sub(at(0, -cm(0.2), cm(4.6) + k * cm(0.42))), [[0, cm(3.38)], [cm(0.25), cm(3.48)]], 32));
  const silver = lathe(sub(at(0, -cm(0.2), cm(8.7))), [[0, cm(3.37)], [cm(0.25), cm(3.37)]], 32);
  const glass = ellipsoid(frameOf(at(0, -cm(0.2), cm(10.35)), f.z, f.y), [cm(2.9), cm(2.9), cm(0.35)], [0.5, 0.5], 24, 8);
  const shutter = lathe(sub(at(-cm(5.1), cm(3.2), cm(1.6))), [[0, cm(0.5)], [cm(0.3), cm(0.5)]], 12);
  const dial = lathe({ ...frameOf(at(cm(3.6), cm(3.9), -cm(0.2)), f.y, f.z) }, [[0, cm(1.1)], [cm(0.55), cm(1.1)]], 20);
  const lugs = [1, -1].map((s) => at(s * cm(6.6), cm(2.6), -cm(0.3)));
  const pivot = centre;

  // The strap: from each lug up over the collarbone to the side of the neck, and round the back of it.
  const onFront = (x: number, yy: number): number => { const h = surf.hit(x, yy); return h ? h.p[2] + cm(0.6) : nz + cm(2); };
  const sidePath = (s: number): Vec3[] => {
    const lug = lugs[s > 0 ? 0 : 1], top: Vec3 = [s * (halfX + collar), L.neckY - cm(1.5), nz + cm(0.5)], path: Vec3[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, x = lug[0] + (top[0] - lug[0]) * t, yy = lug[1] + (top[1] - lug[1]) * t;
      path.push([x, yy, Math.max(lug[2] + (top[2] - lug[2]) * t - cm(1) * Math.sin(t * Math.PI), onFront(x, yy))]);
    }
    return path;
  };
  const behind = behindNeck(g, halfX, nz, backZ, L.neckY - cm(1.5), cm(2), collar);
  const strapPath = soften([...sidePath(1), ...behind, ...sidePath(-1).reverse()], 2);
  const strap = cord(strapPath, cm(0.45), false, 6);
  // Each strap vertex follows the camera more the nearer it is to the lugs (none above the collarbones).
  const P = strap.positions, weight = new Float32Array(P.length / 3), yHi = L.neckY - cm(4), yLo = lugs[0][1] + cm(1);
  for (let i = 0; i < weight.length; i++) weight[i] = smooth((yHi - P[i * 3 + 1]) / (yHi - yLo));
  const rigid = { bone: 'Camera' as const, pivot };
  return [
    { mesh: merge([body, grip, hump, shoe, dial])!, material: mat('Camera body', null, { color: st.color, roughness: 0.55 }), prop: rigid },
    { mesh: merge([lens, ...ribs])!, material: mat('Camera lens barrel', null, { color: '#121315', roughness: 0.6 }), prop: rigid },
    { mesh: merge([silver, shutter])!, material: mat('Camera lens ring', null, STEEL), prop: rigid },
    { mesh: glass, material: mat('Camera lens glass', null, { color: '#1a2a3d', roughness: 0.04, metalness: 0.7 }), prop: rigid },
    { mesh: strap, material: mat('Camera strap', null, { color: st.color2, roughness: 0.75 }), prop: { ...rigid, weight } },
  ];
}

/** Long sports socks pulled up to just below the knee, with a ribbed turnover band at the top. */
function sportSocks(g: GCtx, st: GarmentStyle): GPart[] {
  const sock = shell(g, { covers: (v) => v.region === REGION.lowerleg && v.t > 0.08, offset: cm(0.35), tile: 0.15, relax: 2 });
  const band = shell(g, { covers: (v) => v.region === REGION.lowerleg && v.t > 0.06 && v.t < 0.2, offset: cm(0.6), tile: 0.15, relax: 2 });
  return [
    ...(sock ? [{ mesh: sock.mesh, material: cloth(g, 'Sports socks', st), hides: sock.covered, smooth: true }] : []),
    ...(band ? [{ mesh: band.mesh, material: cloth(g, 'Sports sock bands', { ...st, pattern: 'rib', color: st.color2 }), smooth: true }] : []),
  ];
}


// --- Jerseys -----------------------------------------------------------------------------------

/** Stroke paths of the digits 0-9 in a unit box (x across, y up), drawn as rounded athletic numerals. */
const DIGITS: [number, number][][][] = [
  [Array.from({ length: 28 }, (_, k) => { const a = (k / 24) * Math.PI * 2; return [0.5 + 0.42 * Math.sin(a), 0.5 + 0.48 * Math.cos(a)] as [number, number]; })],
  [[[0.22, 0.78], [0.55, 1], [0.55, 0]], [[0.25, 0], [0.85, 0]]],
  [[[0.08, 0.74], [0.25, 0.95], [0.55, 1], [0.86, 0.86], [0.9, 0.62], [0.6, 0.38], [0.08, 0], [0.94, 0]]],
  [[[0.08, 0.86], [0.42, 1], [0.82, 0.92], [0.86, 0.68], [0.45, 0.53], [0.9, 0.36], [0.86, 0.1], [0.45, 0], [0.06, 0.12]]],
  [[[0.72, 0], [0.72, 1], [0.06, 0.3], [0.96, 0.3]]],
  [[[0.88, 1], [0.16, 1], [0.1, 0.56], [0.5, 0.64], [0.88, 0.48], [0.9, 0.2], [0.5, 0], [0.06, 0.1]]],
  [[[0.84, 0.92], [0.5, 1], [0.16, 0.8], [0.1, 0.36], [0.26, 0.04], [0.62, 0.02], [0.9, 0.28], [0.78, 0.56], [0.44, 0.6], [0.12, 0.42]]],
  [[[0.06, 1], [0.94, 1], [0.36, 0]]],
  [Array.from({ length: 41 }, (_, k) => { const t = k / 40, a = t * Math.PI * 4; const top = t < 0.5; return [0.5 + (top ? 0.34 : 0.42) * Math.sin(a) * (top ? 1 : -1), top ? 0.76 + 0.24 * Math.cos(a) : 0.27 - 0.27 * Math.cos(a)] as [number, number]; })],
  [[[0.88, 0.58], [0.56, 0.4], [0.22, 0.44], [0.1, 0.72], [0.38, 1], [0.74, 0.98], [0.9, 0.64], [0.84, 0.26], [0.5, 0], [0.14, 0.08]]],
];

/** A number's strokes, centred at the origin with the given height, as flat 2D ribbons of half-width w. */
function numberStrokes(n: number, height: number): [number, number][][] {
  const text = String(Math.max(0, Math.min(99, Math.round(n)))), w = height * 0.62, gap = height * 0.12;
  const total = text.length * w + (text.length - 1) * gap;
  const out: [number, number][][] = [];
  [...text].forEach((ch, i) => {
    const x0 = -total / 2 + i * (w + gap);
    for (const stroke of DIGITS[Number(ch)]) {
      // Smoothed and resampled, so the projected ribbon follows the cloth.
      let pts: [number, number][] = stroke.map(([x, y]) => [x0 + x * w, (y - 0.5) * height]);
      for (let k = 0; k < 3; k++) {
        const fine: [number, number][] = [];
        for (let j = 0; j < pts.length - 1; j++) fine.push(pts[j], [(pts[j][0] + pts[j + 1][0]) / 2, (pts[j][1] + pts[j + 1][1]) / 2]);
        fine.push(pts[pts.length - 1]);
        pts = fine.map((p, j) => (j === 0 || j === fine.length - 1 ? p : [(fine[j - 1][0] + 2 * p[0] + fine[j + 1][0]) / 4, (fine[j - 1][1] + 2 * p[1] + fine[j + 1][1]) / 4]));
      }
      out.push(pts);
    }
  });
  return out;
}

/** Flat ribbons along 2D strokes, laid onto a surface seen from the front or back, `lift` out along its normal. */
function decal(strokes: [number, number][][], half: number, centre: [number, number], side: 'front' | 'back', surf: Caster, lift: number): PolyMesh | null {
  const parts: PolyMesh[] = [], mirror = side === 'back' ? -1 : 1;
  for (const s of strokes) {
    const pos: number[] = [], sizes: number[] = [], fv: number[] = [];
    for (let i = 0; i < s.length; i++) {
      const a = s[Math.max(0, i - 1)], c = s[Math.min(s.length - 1, i + 1)], d = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      const nx = -(c[1] - a[1]) / d, ny = (c[0] - a[0]) / d;
      // Three points across, so the ribbon follows the cloth's curve instead of cutting under it.
      for (const k of [-1, 0, 1]) {
        const x = centre[0] + mirror * (s[i][0] + nx * half * k), y = centre[1] + s[i][1] + ny * half * k, h = surf.hit(x, y);
        const p = h ? v3.madd(h.p, h.n, lift) : [x, y, 0] as Vec3;
        pos.push(...p);
      }
      if (i > 0) {
        const q = pos.length / 3 - 6;
        for (const o of [0, 1]) { sizes.push(4); fv.push(...(side === 'back' ? [q + o, q + 3 + o, q + 4 + o, q + 1 + o] : [q + o, q + 1 + o, q + 4 + o, q + 3 + o])); }
      }
    }
    if (sizes.length) parts.push({ positions: Float32Array.from(pos), faceSizes: Uint8Array.from(sizes), faceVerts: Uint32Array.from(fv), faceUVs: new Uint32Array(fv.length), uvs: new Float32Array(2) });
  }
  return parts.length ? merge(parts) : null;
}

/** A jersey's numbers: large on the back and smaller on the front, in the accent colour, outlined in the shirt's. */
function jerseyNumbers(g: GCtx, shirt: PolyMesh, st: GarmentStyle, back: { tt: number; h: number }, front: { x: number; tt: number; h: number }): GPart[] {
  if (st.number === undefined) return [];
  const L = g.body.L, H = L.neckY - L.hipY, y = (tt: number) => L.hipY + tt * H;
  const fromBack = new Caster(shirt, null, () => true, 'back'), fromFront = new Caster(shirt, null, () => true, 'front');
  const fill: PolyMesh[] = [], edge: PolyMesh[] = [];
  for (const [side, surf, spot] of [['back', fromBack, back], ['front', fromFront, { ...front }]] as const) {
    const strokes = numberStrokes(st.number, spot.h), cx = 'x' in spot ? spot.x * L.shoulderX : 0, half = spot.h * 0.085;
    const f = decal(strokes, half, [cx, y(spot.tt)], side, surf, cm(0.45)), o = decal(strokes, half + spot.h * 0.035, [cx, y(spot.tt)], side, surf, cm(0.3));
    if (f) fill.push(f);
    if (o) edge.push(o);
  }
  // On stripes and hoops the number goes on a dark fill outlined in white, so it reads over both colours.
  const striped = st.pattern === 'stripes' || st.pattern === 'hoops', outline = striped ? '#f4f4f2' : st.color, fillColor = striped ? '#17181c' : st.color2;
  return [
    ...(edge.length ? [{ mesh: merge(edge)!, material: mat('Jersey number outline', null, { color: outline, roughness: 0.6, doubleSided: true }) }] : []),
    ...(fill.length ? [{ mesh: merge(fill)!, material: mat('Jersey number', null, { color: fillColor, roughness: 0.5, doubleSided: true }) }] : []),
  ];
}

/** A fitted football shirt: short sleeves, a ribbed crew collar and cuffs, and its number on the back and chest. */
function footballShirt(g: GCtx, st: GarmentStyle): GPart[] {
  const L = g.body.L;
  const r = shell(g, {
    covers: (v) => (isTrunk(v) && v.t > 0.16 && v.tt < 0.95 - 0.04 * Math.cos(v.theta)) || (v.region === REGION.upperarm && v.t < 0.5),
    offset: (v) => cm(0.7) + (v.region === REGION.upperarm ? cm(0.5) * clamp01(v.t / 0.5) : 0), tile: 0.3, relax: 3, edgeLoops: true,
  });
  if (!r) return [];
  const loops: Vec3[][] = (r.edgeLoops ?? []).filter((loop) => loop.length > 8);
  const bands = loops.filter((loop) => {
    const y = loop.reduce((a, p) => a + p[1], 0) / loop.length;
    return y > L.neckY - cm(14) || Math.abs(loop.reduce((a, p) => a + p[0], 0) / loop.length) > 0.6 * L.shoulderX;
  }).map((loop) => cord(soften([...loop, loop[0]], 2), cm(0.45), true, 6));
  return [
    { mesh: r.mesh, material: cloth(g, 'Football shirt', st), hides: r.covered, smooth: true },
    ...(bands.length ? [{ mesh: merge(bands)!, material: mat('Football shirt collar and cuffs', null, { color: st.color2, roughness: 0.7 }) }] : []),
    ...jerseyNumbers(g, r.mesh, st, { tt: 0.6, h: cm(22) }, { x: 0.42, tt: 0.74, h: cm(8) }),
  ];
}

/** A basketball jersey: sleeveless with wide shoulder straps and a scooped neck, bound in the accent colour, numbered. */
function basketballJersey(g: GCtx, st: GarmentStyle): GPart[] {
  const cut = cutShell(g.body, g.faceVerts, {
    field: singletCut(g.body, { strap: 0.14, hem: 0.02 }),
    offset: (v) => cm(0.9) + cm(0.6) * clamp01((v.tt - 0.8) / 0.16), tile: 0.3, relax: 5, edgeLoops: true, edgeSmooth: 6,
  });
  if (!cut) return [];
  const bindings = (cut.edgeLoops ?? []).filter((loop) => loop.length > 8 && loop.reduce((a, p) => a + p[1], 0) / loop.length > g.body.L.hipY + cm(8)).map((loop) => cord(loop, cm(0.5), true, 6));
  const skinAt = chestSkin(g.body, cut.mesh.positions);
  return [
    { mesh: cut.mesh, material: cloth(g, 'Basketball jersey', st), hides: cut.covered, smooth: true, skinAt },
    ...(bindings.length ? [{ mesh: merge(bindings)!, material: mat('Basketball jersey binding', null, { color: st.color2, roughness: 0.7 }), skinAt: chestSkin(g.body, merge(bindings)!.positions) }] : []),
    ...jerseyNumbers(g, cut.mesh, st, { tt: 0.56, h: cm(20) }, { x: 0, tt: 0.6, h: cm(13) }),
  ];
}

export const TRADES: GarmentDef[] = [
  { id: 'football_shirt', label: 'Football shirt (numbered)', slot: 'top', patterns: ['solid', 'stripes', 'hoops', 'sport_print', 'jersey'], color: '#1e7a3c', color2: '#f2f2ef', colorLabels: ['Shirt', 'Number and trim'], number: 10, build: footballShirt },
  { id: 'basketball_jersey', label: 'Basketball jersey (numbered)', slot: 'top', patterns: ['solid', 'stripes', 'sport_print', 'jersey'], color: '#1d4fa8', color2: '#f2f2ef', colorLabels: ['Jersey', 'Number and trim'], number: 23, build: basketballJersey },
  { id: 'chef_jacket', label: 'Chef jacket (double-breasted)', slot: 'top', patterns: ['solid', 'linen'], color: '#f4f4f1', color2: '#1d1f24', colorLabels: ['Fabric', 'Buttons'], build: chefJacket },
  { id: 'chef_hat', label: 'Chef hat (toque)', slot: 'hat', patterns: ['solid'], color: '#f6f6f3', color2: '#f6f6f3', build: chefHat },
  { id: 'apron', label: 'Bib apron', slot: 'acc', patterns: ['pinstripe', 'solid', 'linen'], color: '#17181b', color2: '#e9e9e6', colorLabels: ['Fabric', 'Stripes and ties'], build: apron },
  { id: 'headphones', label: 'Over-ear headphones', slot: 'acc', patterns: ['solid'], color: '#17181b', color2: '#2b2d31', colorLabels: ['Shell and band', 'Cushions'], build: headphones },
  { id: 'camera', label: 'Camera on a neck strap', slot: 'acc', patterns: ['solid'], color: '#1b1c1f', color2: '#2a2522', colorLabels: ['Camera', 'Strap'], build: camera },
  { id: 'sport_socks', label: 'Sports socks (knee-high)', slot: 'acc', patterns: ['rib', 'solid'], color: '#f2f2ef', color2: '#c7262f', colorLabels: ['Socks', 'Top band'], build: sportSocks },
];
