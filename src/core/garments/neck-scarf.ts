/**
 * A small silk neck scarf, as cabin crew wear it: a slim band round the neck over the shirt collar, tied in a knot at
 * the centre front, with two short pointed ends falling from the knot.
 */
import type { Vec3 } from '../math';
import { cm, REGION } from './body';
import { cloth, mat, points, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { ellipsoid, frameOf, hullRing, merge, solidBand, v3 } from './ring';

function neckScarf(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, y = b.L.neckY - cm(1.2);
  // The scarf rests on the neck and, where it is worn, on the shirt's collar.
  const neck = points(b, v => v.region === REGION.neck);
  const nz = neck.reduce((s, p) => s + p[2], 0) / Math.max(1, neck.length);
  const near = (p: Vec3) => Math.hypot(p[0], p[2] - nz) < cm(7.8) && p[1] > y - cm(6) && p[1] < y + cm(5);
  const pts = [...neck, ...(g.worn ?? [])].filter(near);
  // Tilted so it sits higher at the back of the neck than at the front.
  const tilt = 0.32, normal: Vec3 = [0, Math.cos(tilt), Math.sin(tilt)];
  const plane = { origin: [0, y, nz] as Vec3, normal };
  const silk = cloth(g, 'Neck scarf silk', st, { roughness: 0.5, doubleSided: true });
  const band = solidBand(pts, plane, cm(3), cm(0.22), cm(0.35), { samples: 72, tileU: 0.1, steps: 3 });
  const ring = hullRing(pts, plane, { slab: cm(1.2), samples: 64, offset: cm(0.8) });
  if (!band || !ring) return [];
  const parts: GPart[] = [{ mesh: band, material: silk, smooth: true }];

  // The knot: centred at the front of the neck.
  let knot = ring[0];
  for (const p of ring) if (p[2] - 2 * Math.abs(p[0]) > knot[2] - 2 * Math.abs(knot[0])) knot = p;
  knot = [0, knot[1], knot[2]];
  const centre: Vec3 = [0, knot[1], nz];
  const out = v3.norm([knot[0] - centre[0], 0, knot[2] - centre[2]]);
  const at = v3.madd(knot, out, cm(0.5));
  const pieces = [ellipsoid(frameOf(at, out, [0, 1, 0]), [cm(1.5), cm(1.25), cm(0.9)], [0.5, 0.5], 16, 9)];
  // Two pointed ends falling from the knot, splayed evenly to either side.
  for (const [side, length] of [[1, cm(5.6)], [-1, cm(5.6)]] as const) {
    const down = v3.norm([side * 0.32, -1, out[2] * 0.35]);
    const mid = v3.madd(v3.madd(at, down, length * 0.85), out, cm(0.35));
    pieces.push(ellipsoid(frameOf(mid, out, down), [cm(1.55), length, cm(0.22)], [0.5, 0.5], 14, 10));
  }
  parts.push({ mesh: merge(pieces)!, material: mat('Neck scarf knot and ends', null, { color: st.color, roughness: 0.45, doubleSided: true }), smooth: true });
  return parts;
}

export const NECK_SCARF: GarmentDef = {
  id: 'neck_scarf', label: 'Silk neck scarf', slot: 'acc', patterns: ['solid', 'satin'], color: '#b52f3c', color2: '#f0d9a8',
  build: neckScarf,
};
