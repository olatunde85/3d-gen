/**
 * Chunky white sneakers on a roomy last (see last.ts) with a padded collar round the ankle; a
 * cupsole follows the same outline with rounded edges, under a thin outsole. Laces criss-cross the
 * instep. The shoe moves rigidly with the foot.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, type Body } from './body';
import { capRing, feetMask, last, rigidFeet, soleOutline, surfaceAt } from './last';
import { cloth, hplane, mat, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, hullRing, loftRings, merge, orientOutward, v3 } from './ring';

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
  // A chunky last: a roomy toe box at least 4.4 cm tall, the collar 1.2 cm above the ankle joint.
  const l = last(b, s, { margin: cm(0.9), toeH: cm(4.4), instep: cm(1.4), toe: cm(1.8), heel: cm(1.2), collarRise: cm(1.2), toeFrom: 0.78 });
  if (!l) return null;
  const { rings, N, M, X, Z, world, minY, sx0, sx1, collarY, legLow, foot } = l;
  const L = sx1 - sx0;
  // Cupsole: the footprint 1.3 cm outside the foot, walls up 1.5 cm, a rounded bottom edge.
  const { level, zMid } = soleOutline(l, cm(1.3));
  const sTop = minY + cm(1.5), sBot = minY - cm(2.4);
  const soleRings = [level(sTop, cm(0.25)), level(sTop - cm(0.15), 0), level(sBot + cm(0.4), 0), level(sBot + cm(0.1), cm(0.2)), level(sBot, cm(0.5))];
  const sole = orientOutward(merge([loftRings(soleRings, { closedAround: true, tileU: 0.12, tileV: 0.05 }), capRing(soleRings[0], true), capRing(soleRings[soleRings.length - 1], false)])!, world(sx0 + L / 2, minY - cm(0.5), zMid));
  const oRings = [level(sBot, cm(0.45)), level(sBot - cm(0.45), cm(0.6))];
  const outsole = orientOutward(merge([loftRings(oRings, { closedAround: true, tileU: 0.12, tileV: 0.05 }), capRing(oRings[1], false)])!, world(sx0 + L / 2, sBot, zMid));
  // Laces: six rows of eyelets either side of the instep's top; the lace criss-crosses between
  // them and runs straight across each row, standing proud of the upper with a little sag.
  const lacesParts: PolyMesh[] = [];
  const kL = M * 0.17, kR = M * 0.33;
  const rowAt = (i: number) => N * (0.3 + i * 0.065);
  // A lace from (row a, side ka) to (row b, side kb), following the upper's curve just above it.
  const lace = (a: number, ka: number, bRow: number, kb: number) => {
    const pts: Vec3[] = [];
    for (let t = 0; t <= 1.0001; t += 0.25) pts.push(surfaceAt(l, rowAt(a) + (rowAt(bRow) - rowAt(a)) * t, ka + (kb - ka) * t, cm(0.45) + cm(0.15) * Math.sin(Math.PI * t)));
    return cord(pts, cm(0.26), false, 5);
  };
  const rows: [Vec3, Vec3][] = [];
  for (let i = 0; i < 6; i++) {
    rows.push([surfaceAt(l, rowAt(i), kL, cm(0.25)), surfaceAt(l, rowAt(i), kR, cm(0.25))]);
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
  return { upper: l.upper, sole, outsole, laces: merge([...lacesParts, ...stitch])!, collar, mid: l.mid };
}

/**
 * `st`: the upper's finish (smooth leather, or worn canvas) and colour; color2 tints the sole
 * (a worn pair's sole is grubby too).
 */
export function sneakers(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  // A worn pair: grubby laces and a darker outsole too.
  const worn = st.pattern !== 'nappa';
  const sole = st.color2, outsole = worn ? '#8f8a80' : '#cfcdc8', laces = worn ? '#b3ada1' : '#e9e6df';
  const leather = cloth(g, 'Sneaker leather', st, { roughness: st.pattern === 'nappa' ? 0.45 : 0.85 });
  const shoes = [1, -1].map((s) => shoe(b, s)).filter((x): x is Shoe => !!x);
  if (shoes.length < 2) return [];
  const part = (pick: (x: Shoe) => PolyMesh, extra: Partial<GPart> & { material: GPart['material'] }): GPart => {
    const mesh = merge(shoes.map(pick))!;
    return { mesh, skinAt: rigidFeet(mesh, shoes.map((x) => x.mid)), ...extra };
  };
  const hides = feetMask(b, g.faceVerts);
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
