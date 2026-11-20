/**
 * Safety hard hat: a rigid, glossy dome sitting over the head on its harness, with a raised ridge from front to back
 * and a short brim all round, longest at the front.
 */
import type { Vec3 } from '../math';
import { cm, REGION } from './body';
import { mat, points, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, hullRing, loftRings, merge, v3 } from './ring';

const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

function hardHat(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, H = b.L.crownY - b.L.chinY;
  const head = points(b, v => v.region === REGION.head);
  // The rim sits level round the head just above the brows, a little higher at the back.
  const bandY = b.L.chinY + 0.645 * H, n = v3.norm([0, 1, -0.1]);
  const S = 64;
  const band = hullRing(head, { origin: [0, bandY, b.L.headZ], normal: n, ref: [0, 0, 1] }, { slab: cm(0.8), samples: S, offset: cm(2) });
  if (!band) return [];
  let c: Vec3 = [0, 0, 0];
  for (const p of band) c = v3.add(c, v3.scale(p, 1 / band.length));
  const top = b.L.crownY + cm(2.2);

  // The dome: the rim ring drawn up and in to the top, like a quarter ellipse.
  const rings: Vec3[][] = [];
  const steps = 14;
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * (Math.PI / 2), shrink = Math.max(0.04, Math.cos(t)), rise = Math.sin(t);
    rings.push(band.map(p => {
      const y = p[1] + (top - p[1]) * rise;
      return [c[0] + (p[0] - c[0]) * shrink, y, c[2] + (p[2] - c[2]) * shrink * 1.02] as Vec3;
    }));
  }
  const shell = loftRings(rings, { closedAround: true, closedAcross: false, tileU: 0.2, tileV: 0.2 });

  // The brim: out from the rim, longest at the front and angled slightly down.
  const brim: Vec3[][] = [0, 1].map(k => band.map(p => {
    const out = v3.norm([p[0] - c[0], 0, p[2] - c[2]]);
    const front = Math.max(0, out[2]), reach = cm(1.1) + cm(2.6) * smooth(front * 1.4 - 0.3);
    return k === 0 ? v3.madd(p, [0, -1, 0], cm(0.2)) : v3.add(v3.madd(p, out, reach), [0, -reach * 0.32, 0]);
  }));
  const brimMesh = loftRings(brim, { closedAround: true, closedAcross: false, tileU: 0.2, tileV: 0.2 });

  // The ridge over the crown: a raised rib following the dome from the front of the rim, over the top, to the back.
  const at = (dir: number) => band.reduce((best, p, j) => (p[2] - c[2]) * dir > (band[best][2] - c[2]) * dir ? j : best, 0);
  const jf = at(1), jb = at(-1);
  const path: Vec3[] = [];
  for (let k = 4; k < rings.length - 1; k++) path.push(rings[k][jf]);
  for (let k = rings.length - 2; k >= 4; k--) path.push(rings[k][jb]);
  // Smoothed, so the rib runs as one even curve.
  for (let it = 0; it < 6; it++) for (let i = 1; i < path.length - 1; i++) path[i] = v3.scale(v3.add(v3.add(path[i - 1], path[i + 1]), v3.scale(path[i], 2)), 0.25);
  const ridge = cord(path.map(p => v3.add(p, v3.scale(v3.norm(v3.sub(p, [c[0], bandY, c[2]])), -cm(0.2)))), cm(1), false, 10);

  const plastic = mat('Hard hat', null, { color: st.color, roughness: 0.32, doubleSided: true });
  return [
    { mesh: merge([shell, brimMesh])!, material: plastic, headwear: true, hidesHair: true, smooth: true },
    { mesh: ridge, material: { ...plastic, name: 'Hard hat ridge' }, headwear: true },
  ];
}

export const HARD_HAT: GarmentDef = {
  id: 'hard_hat', label: 'Hard hat', slot: 'hat', patterns: ['solid'], color: '#f2b51d', color2: '#f2b51d', build: hardHat,
};
