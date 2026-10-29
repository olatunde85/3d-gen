/**
 * Horsebit loafers on a sleek last (see last.ts): a low, elongated toe, a raised moccasin seam
 * round the toe, a gold horsebit across the vamp and a thin leather sole whose waist lifts under
 * the arch. Patent leather by default. The shoe moves rigidly with the foot.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, type Body } from './body';
import { capRing, feetMask, last, rigidFeet, soleOutline, surfaceAt } from './last';
import { cloth, GOLD, mat, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, loftRings, merge, orientOutward, v3 } from './ring';

interface Loafer {
  upper: PolyMesh;
  /** Foot skin below this height is inside the shoe. */
  hideBelow: number;
  trim: PolyMesh;
  sole: PolyMesh;
  bit: PolyMesh;
  mid: Vec3;
}

/** A small ring (link) of the horsebit at p, in the plane spanned by a and b. */
function link(p: Vec3, a: Vec3, b: Vec3, r: number, thick: number): PolyMesh {
  const loop: Vec3[] = [];
  for (let k = 0; k <= 14; k++) {
    const t = (k / 14) * Math.PI * 2;
    loop.push(v3.add(p, v3.add(v3.scale(a, Math.cos(t) * r), v3.scale(b, Math.sin(t) * r))));
  }
  return cord(loop, thick, false, 6);
}

function loafer(b: Body, s: number): Loafer | null {
  // Cut low round the heel and sides (5 cm), rising into the vamp halfway along the foot.
  const l = last(b, s, { margin: cm(0.55), toeH: cm(3.6), instep: cm(0.9), toe: cm(1.8), heel: cm(0.9), collarRise: 0, toeFrom: 0.76, topline: { h: cm(5), throat: 0.5 } });
  if (!l) return null;
  const { N, M, X, world, minY, sx0, sx1, fa } = l;
  const L = sx1 - sx0;
  // Sole: a thin welt just outside the upper, flat under the heel and the ball of the foot, its
  // waist lifting under the arch.
  const { level, zMid } = soleOutline(l, cm(0.4), 0.45);
  const along = (p: Vec3) => (v3.dot(v3.sub(p, fa), X) - sx0) / L;
  const bottom = (r: Vec3[]) => r.map((p) => {
    const u = along(p), arch = u > 0.27 && u < 0.52 ? Math.sin((Math.PI * (u - 0.27)) / 0.25) : 0;
    return [p[0], minY - cm(1.8) + cm(0.7) * arch, p[2]] as Vec3;
  });
  const soleRings = [level(minY + cm(0.25), cm(0.25)), level(minY + cm(0.1), 0), level(minY - cm(0.5), 0), bottom(level(0, cm(0.1)))];
  const sole = orientOutward(merge([loftRings(soleRings, { closedAround: true, tileU: 0.12, tileV: 0.05 }), capRing(soleRings[0], true), capRing(soleRings[3], false)])!, world(sx0 + L / 2, minY - cm(0.8), zMid));
  // Moccasin seam: a raised U over the toe, open toward the instep.
  const seam: Vec3[] = [];
  for (let k = 0; k <= 24; k++) {
    const t = (k / 24) * Math.PI;
    seam.push(surfaceAt(l, N * (0.56 + 0.34 * Math.sin(t)), M * (0.25 + 0.15 * Math.cos(t)), cm(0.08)));
  }
  // Piping round the opening's cut edge.
  const trim = merge([cord(seam, cm(0.2), false, 6), l.rim.length > 2 ? cord(l.rim, cm(0.3), false, 6) : null])!;
  // Horsebit: a link either side of the vamp joined by a bar with a little sag.
  const ri = N * 0.6, kL = M * 0.13, kR = M * 0.37;
  const pL = surfaceAt(l, ri, kL, cm(0.35)), pR = surfaceAt(l, ri, kR, cm(0.35));
  const across = v3.norm(v3.sub(pR, pL));
  const outL = v3.norm(v3.sub(pL, surfaceAt(l, ri, kL, 0))), outR = v3.norm(v3.sub(pR, surfaceAt(l, ri, kR, 0)));
  const bar: Vec3[] = [];
  for (let k = 0; k <= 8; k++) bar.push(surfaceAt(l, ri, kL + ((kR - kL) * k) / 8, cm(0.4) + cm(0.1) * Math.sin((Math.PI * k) / 8)));
  const bit = merge([
    link(pL, X, v3.norm(v3.cross(X, outL)), cm(0.75), cm(0.13)),
    link(pR, X, v3.norm(v3.cross(X, outR)), cm(0.75), cm(0.13)),
    cord(bar.map((p) => v3.madd(p, across, 0)), cm(0.14), false, 6),
  ])!;
  return { upper: l.upper, hideBelow: minY + cm(4.6), trim, sole, bit, mid: l.mid };
}

/** `st`: the upper's finish and colour; color2 is the sole. */
export function loafers(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const pairs = [1, -1].map((s) => loafer(b, s)).filter((x): x is Loafer => !!x);
  if (pairs.length < 2) return [];
  const leather = cloth(g, 'Loafer leather', st, { roughness: st.pattern === 'patent' ? 0.16 : 0.45 });
  const part = (pick: (x: Loafer) => PolyMesh, extra: Partial<GPart> & { material: GPart['material'] }): GPart => {
    const mesh = merge(pairs.map(pick))!;
    return { mesh, skinAt: rigidFeet(mesh, pairs.map((x) => x.mid)), ...extra };
  };
  return [
    part((x) => x.upper, { material: { ...leather, doubleSided: true }, hides: feetMask(b, g.faceVerts, pairs[0].hideBelow) }),
    part((x) => x.trim, { material: leather }),
    part((x) => x.sole, { material: mat('Loafer sole', null, { color: st.color2, roughness: 0.6 }), ground: true }),
    part((x) => x.bit, { material: mat('Horsebit', null, GOLD) }),
  ];
}

export const LOAFERS: GarmentDef = {
  id: 'loafers', label: 'Horsebit loafers', slot: 'feet', patterns: ['patent', 'nappa'], color: '#4a1219', color2: '#2b1d16',
  build: loafers,
};
