/**
 * Bags worn on the body: a makeshift canvas backpack. The pack rests against the upper back (over
 * any top); two webbing straps run from its top over the shoulders, down the chest and back under
 * the arms to its bottom corners. The pack moves rigidly with the chest; the straps follow the
 * shoulders and chest.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION } from './body';
import { clamp, cloth, hplane, isTrunk, mat, points, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { hullRing, loftRings, merge, orientOutward, rayRing, roundedBox, frameOf, v3 } from './ring';

/** Rounded-rectangle outline in the horizontal plane at height y, centred (cx, cz): half sizes hx, hz. */
function slab(cx: number, y: number, cz: number, hx: number, hz: number, n = 32, k = 4): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    out.push([cx + Math.sign(c) * Math.abs(c) ** (2 / k) * hx, y, cz + Math.sign(s) * Math.abs(s) ** (2 / k) * hz]);
  }
  return out;
}

/**
 * A closed, rounded box lofted from horizontal slabs: width w, depth d from yBot to yTop, its
 * front face at zFront(y) (following the back it rests on).
 */
function pillow(yBot: number, yTop: number, zFront: (y: number) => number, w: number, d: number, sag = 0.08): PolyMesh {
  const rings: Vec3[][] = [];
  const K = 10;
  for (let k = 0; k <= K; k++) {
    const t = k / K, y = yBot + (yTop - yBot) * t;
    // Rounded top and bottom (the ends close in), fuller in the middle (stuffed canvas sags).
    const end = Math.sin(Math.PI * Math.min(1, Math.max(0.12, t))) ** 0.35;
    const belly = 1 + sag * Math.sin(Math.PI * t);
    const hz = (d / 2) * end * belly;
    rings.push(slab(0, y, zFront(y) - hz, (w / 2) * (0.85 + 0.15 * end) * (1 + 0.03 * Math.sin(Math.PI * t)), hz));
  }
  const cap = (r: Vec3[]) => {
    let c: Vec3 = [0, 0, 0];
    for (const p of r) c = v3.add(c, v3.scale(p, 1 / r.length));
    return r.map(() => c);
  };
  const m = loftRings([cap(rings[0]), ...rings, cap(rings[K])], { closedAround: true, tileU: 0.25, tileV: 0.25 });
  return orientOutward(m, [0, (yBot + yTop) / 2, zFront((yBot + yTop) / 2) - d / 2]);
}

/** A flat strap (webbing) along a polyline, lying on a surface with the given normals: width w. */
function ribbon(line: Vec3[], normals: Vec3[], w: number, th: number): PolyMesh {
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

function backpack(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const sx = b.L.shoulderX;
  // Large: from just below the shoulders to the lower back.
  const W = cm(32), D = cm(15), yTop = torsoY(b, 0.88), yBot = torsoY(b, 0.22);
  // What it rests on: the back (and any top over it).
  const surf = [...points(b, (v) => isTrunk(v) || v.region === REGION.neck || (v.region === REGION.upperarm && v.t < 0.12)), ...(g.worn ?? []), ...(g.jacket ?? [])];
  // The back's depth at each height (its rearmost point across the pack's width), smoothed: the
  // pack's front face rests on it.
  const step = cm(2), backZ: number[] = [];
  for (let y = yBot - step; y <= yTop + step * 2; y += step) {
    let z = Infinity;
    for (const p of surf) if (Math.abs(p[0]) < W * 0.4 && Math.abs(p[1] - y) < step) z = Math.min(z, p[2]);
    backZ.push(z);
  }
  for (let i = 0; i < backZ.length; i++) if (!Number.isFinite(backZ[i])) backZ[i] = backZ[i - 1] ?? b.L.torsoZ - cm(10);
  for (let it = 0; it < 3; it++) for (let i = 1; i < backZ.length - 1; i++) backZ[i] = Math.min(backZ[i], (backZ[i - 1] + backZ[i] + backZ[i + 1]) / 3);
  const zFront = (y: number) => {
    const f = clamp((y - (yBot - step)) / step, 0, backZ.length - 1.001), i = Math.floor(f);
    return backZ[i] + (backZ[i + 1] - backZ[i]) * (f - i) - cm(0.3);
  };
  const canvas = cloth(g, 'Backpack', st, { roughness: 0.9 });
  const webbing = mat('Backpack straps', null, { color: st.color2, roughness: 0.85 });
  const pack = pillow(yBot, yTop, zFront, W, D);
  // Top flap: a softer slab draped over the top third; front pocket on the lower half.
  const flap = pillow(yTop - cm(13), yTop + cm(1.5), (y) => zFront(y) - D * 0.06, W * 0.98, D * 1.12, 0.02);
  const pocket = pillow(yBot + cm(4), yBot + cm(19), (y) => zFront(y) - D * 0.85, W * 0.7, cm(6.5), 0.15);
  // Buckles holding the flap down.
  const buckles: PolyMesh[] = [];
  for (const x of [-W * 0.22, W * 0.22]) buckles.push(roundedBox(frameOf([x, yTop - cm(12), zFront(yTop - cm(12)) - D * 1.16], [0, 0, -1], [0, 1, 0]), [cm(1.4), cm(1), cm(0.25)], 1));
  // Straps: in the vertical plane at x = +-0.5 sx (straight over the shoulders), round the shoulder from the pack's top to the
  // chest; then from the chest under the arm back to the pack's bottom corner.
  const straps: PolyMesh[] = [];
  // The torso alone (no arms), for the lower straps hugging the sides.
  const torso = [...points(b, isTrunk), ...[...(g.worn ?? []), ...(g.jacket ?? [])].filter((p) => Math.abs(p[0]) < 0.95 * sx)];
  const hulls = new Map<number, Vec3[] | null>();
  const hullAt = (y: number) => {
    const k = Math.round(y / cm(1));
    if (!hulls.has(k)) hulls.set(k, hullRing(torso, hplane(b, k * cm(1)), { slab: cm(1.2), samples: 96, offset: cm(0.5) }));
    return hulls.get(k)!;
  };
  for (const s of [1, -1]) {
    const xs = s * 0.5 * sx;
    const loop = hullRing(surf, { origin: [xs, torsoY(b, 0.85), b.L.torsoZ], normal: [1, 0, 0], ref: [0, 0, 1] }, { slab: cm(1.2), samples: 96, offset: cm(0.5) });
    if (!loop) continue;
    // Over the shoulder: from the back (z < torso) at the pack's top, over the top, down the front to the chest.
    const chestY = torsoY(b, 0.55);
    // Angle round the slice from the front (0) up over the shoulder (pi/2) to the back (pi); the
    // strap runs from the back, at the pack's top, over the shoulder and down to the chest.
    const yc = torsoY(b, 0.85);
    const over = loop
      .map((p) => ({ p, a: Math.atan2(p[1] - yc, p[2] - b.L.torsoZ) }))
      .filter((o) => o.a > -Math.PI / 2 && (o.p[2] < b.L.torsoZ ? o.p[1] > yTop - cm(4) : o.p[1] > chestY))
      .sort((p, q) => q.a - p.a)
      .map((o) => o.p);
    if (over.length < 4) continue;
    // Lower strap: from the chest end round the side (just under the arm) to the pack's bottom corner.
    const low: Vec3[] = [];
    const start = over[over.length - 1], end: Vec3 = [s * W * 0.42, yBot + cm(5), zFront(yBot + cm(5)) - D * 0.3];
    for (let k = 1; k <= 14; k++) {
      const t = k / 14;
      // Round the side of the torso, just below the armpit, to the pack's bottom corner.
      const x = start[0] + (end[0] - start[0]) * t;
      const y = start[1] + (end[1] - start[1]) * t;
      const z = start[2] + (end[2] - start[2]) * t;
      const h = hullAt(y);
      const c: Vec3 = [0, y, b.L.torsoZ];
      const d = v3.norm([x - c[0], 0, z - c[2]]);
      const r = h ? rayRing(h, c, d) : null;
      low.push(r !== null && t < 0.85 ? [c[0] + d[0] * r, y, c[2] + d[2] * r] : [x, y, z]);
    }
    const line = [...over, ...low];
    // Normals: away from a point inside the chest (up on the shoulders, out on the chest and sides).
    const inside = (p: Vec3): Vec3 => [p[0] * 0.4, Math.min(p[1], torsoY(b, 0.8)) - cm(12), b.L.torsoZ];
    const normals = line.map((p) => v3.norm(v3.sub(p, inside(p))));
    straps.push(ribbon(line, normals, cm(4), cm(0.35)));
  }
  // Rigid with the chest: every vertex of the pack looks up its weights at the upper back.
  const chest: Vec3 = [0, torsoY(b, 0.75), b.L.torsoZ];
  const rigid = (m: PolyMesh): Float32Array => {
    const out = new Float32Array(m.positions.length);
    for (let i = 0; i < out.length; i += 3) out.set(chest, i);
    return out;
  };
  // Straps: weights from points pulled in toward the midline (they follow the chest and shoulders,
  // not the swinging arms).
  const strapLook = (m: PolyMesh): Float32Array => {
    const out = new Float32Array(m.positions);
    for (let i = 0; i < out.length; i += 3) out[i] = clamp(out[i], -0.55 * sx, 0.55 * sx);
    return out;
  };
  const body = merge([pack, flap, pocket])!, metal = merge(buckles)!, strapMesh = merge(straps);
  return [
    { mesh: body, material: canvas, skinAt: rigid(body) },
    { mesh: metal, material: mat('Backpack buckles', null, { color: '#2b2a26', roughness: 0.5, metalness: 0.4 }), skinAt: rigid(metal) },
    ...(strapMesh ? [{ mesh: strapMesh, material: { ...webbing, doubleSided: true }, skinAt: strapLook(strapMesh) }] : []),
  ];
}

export const BAGS: GarmentDef[] = [
  { id: 'backpack', label: 'Canvas backpack', slot: 'acc', patterns: ['workwear', 'solid', 'camo'], color: '#5d5b3e', color2: '#3d3b2a', build: backpack },
];
