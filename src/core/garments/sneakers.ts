/**
 * Chunky white sneakers, designed as a shoe rather than wrapped round the foot's surface: in each
 * foot's frame (x along the foot, z across, y up) the upper is a loft of rounded cross-sections
 * sized to contain the foot with a margin (so toes never show), rising from a rounded toe box over
 * the instep to a padded collar round the ankle; a cupsole follows the same outline with rounded
 * edges, under a thin outsole. Laces criss-cross the instep. The shoe moves rigidly with the foot.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION, type Body } from './body';
import { cloth, hplane, mat, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, hullRing, loftRings, merge, orientOutward, v3 } from './ring';

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

interface Shoe {
  upper: PolyMesh;
  sole: PolyMesh;
  outsole: PolyMesh;
  laces: PolyMesh;
  collar: PolyMesh;
  /** Middle of the foot (skin lookup for the rigid shoe). */
  mid: Vec3;
}

function shoe(b: Body, s: number): Shoe | null {
  const side = s > 0 ? '.L' : '.R';
  const foot = b.verts(REGION.foot, s).map((v) => b.p(v));
  if (!foot.length) return null;
  const ankle = b.joint(`foot${side}____head`);
  // The collar covers the whole foot (whose skin is hidden), at least 1.2 cm above the ankle joint.
  let footTop = -Infinity;
  for (const p of foot) footTop = Math.max(footTop, p[1]);
  const collarY = Math.max(ankle[1] + cm(1.2), footTop + cm(0.4));
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
  // The shoe: 1.2 cm behind the heel to 1.8 cm past the toes.
  const sx0 = x0 - cm(1.2), sx1 = x1 + cm(1.8), L = sx1 - sx0;
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
  // Cross-section at slab i: half-width with a margin, rounded off at the toe and heel; height: a
  // toe box at least 5.6 cm tall, the instep just over the foot, the collar at the back.
  const M = 36;
  const ring = (i: number): Vec3[] => {
    const u = i / N, x = sx0 + L * u;
    const toeRound = Math.sqrt(Math.max(0, 1 - smooth(0.78, 1, u) ** 2)), heelRound = Math.sqrt(Math.max(0, 1 - smooth(0.12, 0, u) ** 2));
    const zc = (zLo[i] + zHi[i]) / 2;
    const a = ((zHi[i] - zLo[i]) / 2 + cm(0.9)) * Math.max(0.05, toeRound * heelRound);
    let h = Math.max(top[i] + cm(1.4), minY + cm(4.4));
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
  const upper = orientOutward(loftRings(rings, { closedAround: true, tileU: 0.12, tileV: 0.12 }), world(sx0 + L / 2, minY + cm(3), (zLo[N >> 1] + zHi[N >> 1]) / 2));
  // Cupsole: the footprint 1.3 cm outside the foot, rounded at the toe and heel, walls up 1.5 cm,
  // a rounded bottom edge.
  const outline: Vec3[] = [];
  for (let i = 0; i <= N; i++) outline.push(world(sx0 + (L * i) / N, 0, zHi[i] + cm(1.3)));
  for (let i = N; i >= 0; i--) outline.push(world(sx0 + (L * i) / N, 0, zLo[i] - cm(1.3)));
  let oc: Vec3 = [0, 0, 0];
  for (const p of outline) oc = v3.add(oc, v3.scale(p, 1 / outline.length));
  const zMid = v3.dot(v3.sub(oc, fa), Z);
  const rounded = outline.map((p) => {
    const u = v3.dot(v3.sub(p, fa), X), zz = v3.dot(v3.sub(p, fa), Z);
    const e = Math.max(smooth(sx1 - cm(4), sx1 + cm(0.5), u), smooth(sx0 + cm(3), sx0 - cm(0.5), u));
    return world(u, 0, zMid + (zz - zMid) * (1 - 0.55 * e * e));
  });
  const level = (y: number, inset: number) => rounded.map((p) => {
    const d = v3.norm([p[0] - oc[0], 0, p[2] - oc[2]]);
    return [p[0] - d[0] * inset, y, p[2] - d[2] * inset] as Vec3;
  });
  const cap = (r: Vec3[], up: boolean) => {
    let c: Vec3 = [0, 0, 0];
    for (const p of r) c = v3.add(c, v3.scale(p, 1 / r.length));
    const inner = r.map((p) => v3.lerp(p, c, 0.99));
    return loftRings(up ? [r, inner] : [inner, r], { closedAround: true, uRepeats: 2, tileV: 0.1 });
  };
  const sTop = minY + cm(1.5), sBot = minY - cm(2.4);
  const soleRings = [level(sTop, cm(0.25)), level(sTop - cm(0.15), 0), level(sBot + cm(0.4), 0), level(sBot + cm(0.1), cm(0.2)), level(sBot, cm(0.5))];
  const sole = orientOutward(merge([loftRings(soleRings, { closedAround: true, tileU: 0.12, tileV: 0.05 }), cap(soleRings[0], true), cap(soleRings[soleRings.length - 1], false)])!, world(sx0 + L / 2, minY - cm(0.5), zMid));
  const oRings = [level(sBot, cm(0.45)), level(sBot - cm(0.45), cm(0.6))];
  const outsole = orientOutward(merge([loftRings(oRings, { closedAround: true, tileU: 0.12, tileV: 0.05 }), cap(oRings[1], false)])!, world(sx0 + L / 2, sBot, zMid));
  // Laces: six rows of eyelets either side of the instep's top; the lace criss-crosses between
  // them and runs straight across each row, standing proud of the upper with a little sag.
  const lacesParts: PolyMesh[] = [];
  const surfaceAt = (ri: number, k: number, lift: number) => {
    // Ring (fractional) ri, angle index (fractional) k, `lift` off the surface.
    const r0 = rings[Math.floor(ri)], r1 = rings[Math.min(N, Math.floor(ri) + 1)], f = ri - Math.floor(ri);
    const at = (r: Vec3[]) => {
      const k0 = Math.floor(k), kf = k - k0;
      return v3.lerp(r[k0 % M], r[(k0 + 1) % M], kf);
    };
    const p = v3.lerp(at(r0), at(r1), f);
    let c: Vec3 = [0, 0, 0];
    for (const q of r0) c = v3.add(c, v3.scale(q, 1 / r0.length));
    return v3.madd(p, v3.norm(v3.sub(p, c)), lift);
  };
  const kL = M * 0.17, kR = M * 0.33;
  const rowAt = (i: number) => N * (0.3 + i * 0.065);
  // A lace from (row a, side ka) to (row b, side kb), following the upper's curve just above it.
  const lace = (a: number, ka: number, bRow: number, kb: number) => {
    const pts: Vec3[] = [];
    for (let t = 0; t <= 1.0001; t += 0.25) pts.push(surfaceAt(rowAt(a) + (rowAt(bRow) - rowAt(a)) * t, ka + (kb - ka) * t, cm(0.45) + cm(0.15) * Math.sin(Math.PI * t)));
    return cord(pts, cm(0.26), false, 5);
  };
  const rows: [Vec3, Vec3][] = [];
  for (let i = 0; i < 6; i++) {
    rows.push([surfaceAt(rowAt(i), kL, cm(0.25)), surfaceAt(rowAt(i), kR, cm(0.25))]);
    lacesParts.push(lace(i, kL, i, kR));
    if (i < 5) lacesParts.push(lace(i, kL, i + 1, kR), lace(i, kR, i + 1, kL));
  }
  // Eyelets: small rings round each lace hole.
  for (const [a, z] of rows)
    for (const p of [a, z]) {
      const loop: Vec3[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = (k / 10) * Math.PI * 2;
        loop.push(v3.add(p, v3.add(v3.scale(X, Math.cos(t) * cm(0.45)), v3.scale(Z, Math.sin(t) * cm(0.45)))));
      }
      lacesParts.push(cord(loop, cm(0.1), false, 5));
    }
  // Tongue: a padded flap rising from under the laces in front of the shin.
  const tr = rings[Math.round(N * 0.33)];
  const tTop = tr[Math.round(M * 0.25)];
  const lift = (p: Vec3) => [p[0], p[1] + cm(0.35), p[2]] as Vec3;
  const tongue = cord([lift(rings[Math.round(N * 0.42)][Math.round(M * 0.25)]), lift(tTop), [tTop[0] - X[0] * cm(0.6), collarY + cm(1.6), tTop[2] - X[2] * cm(0.6)]], cm(1.5), false, 10);
  // Padded collar round the ankle, on the upper's top edge.
  const legRing = hullRing(legLow.length ? legLow : foot, hplane(b, collarY + cm(0.2)), { slab: cm(1.2), samples: 32, offset: cm(0.7) });
  const collar = merge([legRing ? cord([...legRing, legRing[0]], cm(0.6), false, 8) : null, tongue])!;
  // Side stitching: a line along each side above the sole, from the toe box to the heel.
  const stitch: PolyMesh[] = [];
  for (const k of [Math.round(M * 0.03), Math.round(M * 0.47)]) {
    const line: Vec3[] = [];
    for (let i = Math.round(N * 0.12); i <= Math.round(N * 0.86); i++) {
      const r = rings[i], p = r[k];
      let c: Vec3 = [0, 0, 0];
      for (const q of r) c = v3.add(c, v3.scale(q, 1 / r.length));
      line.push(v3.madd(p, v3.norm([p[0] - c[0], 0, p[2] - c[2]]), cm(0.05)));
    }
    stitch.push(cord(line, cm(0.06), false, 4));
  }
  return { upper, sole, outsole, laces: merge([...lacesParts, ...stitch])!, collar, mid: v3.lerp(fa, fb, 0.45) };
}

/**
 * `st`: the upper's finish (smooth leather, or worn canvas) and colour; color2 tints the sole
 * (a worn pair's sole is grubby too).
 */
export function sneakers(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const fv = g.faceVerts;
  // A worn pair: grubby laces and a darker outsole too.
  const worn = st.pattern !== 'nappa';
  const sole = st.color2, outsole = worn ? '#8f8a80' : '#cfcdc8', laces = worn ? '#b3ada1' : '#e9e6df';
  const leather = cloth(g, 'Sneaker leather', st, { roughness: st.pattern === 'nappa' ? 0.45 : 0.85 });
  const shoes = [1, -1].map((s) => shoe(b, s)).filter((x): x is Shoe => !!x);
  if (shoes.length < 2) return [];
  // Rigid: every vertex follows the middle of its own foot.
  const lookup = (m: PolyMesh): Float32Array => {
    const out = new Float32Array(m.positions.length);
    for (let i = 0; i < out.length; i += 3) {
      const d = (k: number) => Math.hypot(m.positions[i] - shoes[k].mid[0], m.positions[i + 2] - shoes[k].mid[2]);
      out.set(d(0) < d(1) ? shoes[0].mid : shoes[1].mid, i);
    }
    return out;
  };
  const part = (pick: (x: Shoe) => PolyMesh, extra: Partial<GPart> & { material: GPart['material'] }): GPart => {
    const mesh = merge(shoes.map(pick))!;
    return { mesh, skinAt: lookup(mesh), ...extra };
  };
  // Skin under the shoes: the feet (the collar rises above them).
  const hides = new Uint8Array(fv.length / 4);
  for (let f = 0; f < hides.length; f++) {
    const v = fv[f * 4];
    if (b.regions[v] === REGION.foot) hides[f] = 1;
  }
  return [
    part((x) => x.upper, { material: leather, hides }),
    part((x) => x.sole, { material: mat('Sneaker midsole', null, { color: sole, roughness: 0.6 }), ground: true }),
    part((x) => x.outsole, { material: mat('Sneaker outsole', null, { color: outsole, roughness: 0.85 }), ground: true }),
    part((x) => x.laces, { material: mat('Sneaker laces', null, { color: laces, roughness: 0.9 }) }),
    part((x) => x.collar, { material: leather }),
  ];
}

export const SNEAKERS: GarmentDef = {
  id: 'sneakers', label: 'Sneakers', slot: 'feet', patterns: ['nappa', 'workwear'], color: '#f3f2ee', color2: '#f7f7f5',
  build: sneakers,
};
