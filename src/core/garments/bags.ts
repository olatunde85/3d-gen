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
import { hullRing, loftRings, merge, orientOutward, rayRing, ribbon, roundedBox, frameOf, v3 } from './ring';

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
    if (!hulls.has(k)) hulls.set(k, hullRing(torso, hplane(b, k * cm(1)), { slab: cm(1.2), samples: 96, offset: cm(0.8) }));
    return hulls.get(k)!;
  };
  for (const s of [1, -1]) {
    const xs = s * 0.55 * sx;
    // (Over the top's collar and prints: always on top.)
    const loop = hullRing(surf, { origin: [xs, torsoY(b, 0.85), b.L.torsoZ], normal: [1, 0, 0], ref: [0, 0, 1] }, { slab: cm(2), samples: 96, offset: cm(0.8) });
    if (!loop) continue;
    // Over the shoulder: from the back (z < torso) at the pack's top, over the top, down the front to the chest.
    const chestY = torsoY(b, 0.72);
    // Angle round the slice from the front (0) up over the shoulder (pi/2) to the back (pi); the
    // strap runs from the back, at the pack's top, over the shoulder and down to the chest.
    const yc = torsoY(b, 0.85);
    const over = loop
      .map((p) => ({ p, a: Math.atan2(p[1] - yc, p[2] - b.L.torsoZ) }))
      .filter((o) => o.a > -Math.PI / 2 && (o.p[2] < b.L.torsoZ ? o.p[1] > yTop - cm(4) : o.p[1] > chestY))
      .sort((p, q) => q.a - p.a)
      .map((o) => o.p);
    if (over.length < 4) continue;
    // Down the front and round the side: by angle round the torso (0 = front), the strap keeps the angle it reaches the
    // chest at (a straight line down the front), curves out under the arm, and runs round the side to the pack's bottom
    // corner, lying on the torso (and the clothes over it) all the way.
    const start = over[over.length - 1];
    const cornerY = yBot + cm(5), corner: Vec3 = [s * W * 0.42, cornerY, zFront(cornerY) - D * 0.3];
    const aEnd = Math.atan2(corner[0], corner[2] - b.L.torsoZ);
    const yBend = torsoY(b, 0.6), ySide = torsoY(b, 0.42);
    const ease = (x: number) => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };
    const low: Vec3[] = [];
    // The point on the torso's outline at height y whose x is x (seen from the front), by its angle.
    const angleAtX = (h: Vec3[], c: Vec3, x: number) => {
      let lo = 0, hi = s * Math.PI / 2;
      for (let k = 0; k < 24; k++) {
        const m = (lo + hi) / 2, d: Vec3 = [Math.sin(m), 0, Math.cos(m)], r = rayRing(h, c, d) ?? 0;
        if (Math.abs(d[0] * r) < Math.abs(x)) lo = m; else hi = m;
      }
      return (lo + hi) / 2;
    };
    for (let y = start[1] - cm(1.5); y > cornerY; y -= cm(1.5)) {
      const h = hullAt(y), c: Vec3 = [0, y, b.L.torsoZ];
      // Seen from the front: straight down from the shoulder, then easing out to the side under the arm.
      const a = y > ySide && h
        ? angleAtX(h, c, start[0] + (s * 0.98 * sx - start[0]) * ease((yBend + (start[1] - yBend) * 0.3 - y) / (yBend + (start[1] - yBend) * 0.3 - ySide)) ** 1.4)
        : s * Math.PI / 2 + (aEnd - s * Math.PI / 2) * ease((ySide - y) / (ySide - cornerY));
      const d: Vec3 = [Math.sin(a), 0, Math.cos(a)];
      const r = h ? rayRing(h, c, d) : null;
      low.push(r !== null ? [c[0] + d[0] * r, y, c[2] + d[2] * r] : [c[0] + d[0] * cm(15), y, c[2] + d[2] * cm(15)]);
    }
    low.push(corner);
    // Smoothed along its length, so loose clothes' folds and a collar's bumps don't make it wave, then pushed back out
    // wherever smoothing sank it into the torso or clothes.
    // (Only lightly over the shoulder: smoothing a tight curve pulls it in, under the clothes.)
    const smoothed = (pts: Vec3[], passes: number) => {
      let out = pts;
      for (let it = 0; it < passes; it++) out = out.map((q, i) => (i === 0 || i === out.length - 1 ? q : v3.scale(v3.add(v3.add(out[i - 1], out[i + 1]), v3.scale(q, 2)), 0.25)));
      return out;
    };
    const front = smoothed([start, ...low], 14).slice(1).map((q, i, all) => {
      if (i === all.length - 1) return q;
      const h = hullAt(q[1]), c: Vec3 = [0, q[1], b.L.torsoZ], d = v3.norm([q[0], 0, q[2] - c[2]]), r = h ? rayRing(h, c, d) : null, now = Math.hypot(q[0], q[2] - c[2]);
      return r !== null && r > now ? [d[0] * r, q[1], c[2] + d[2] * r] as Vec3 : q;
    });
    const line = [...smoothed(over, 2), ...front];
    // Normals: out from the torso's axis at the strap's height, and from the shoulder's middle over the top, so the
    // ribbon lies flat without twisting.
    const yS = torsoY(b, 0.8);
    const normals = line.map((p) => v3.norm(v3.sub(p, [p[0] * (p[1] > yS ? 0.6 : 0), Math.min(p[1], yS), b.L.torsoZ])));
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
  { id: 'backpack', label: 'Canvas backpack', slot: 'bag', patterns: ['workwear', 'solid', 'camo'], color: '#5d5b3e', color2: '#3d3b2a', build: backpack },
];
