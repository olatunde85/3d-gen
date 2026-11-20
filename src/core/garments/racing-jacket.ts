/** An open, short race jacket built over a fitted shirt. */
import type { PolyMesh } from '../geometry';
import { cm, REGION } from './body';
import { cloth, isTrunk, mat, shell, torsoY, type GarmentDef, type GCtx, type GPart, type GarmentStyle } from './kit';
import { cord, frameOf, merge, roundedBox, v3 } from './ring';
import { Caster } from './project';

/** The cropped jacket ends at the ribs with three-quarter sleeves; the long one reaches the hips with full sleeves. */
function racingJacket(g: GCtx, st: GarmentStyle, long = false): GPart[] {
  const b = g.body;
  // The centre gap continues all the way to the hem; there is no closure or zip panel.
  const torso = (v: typeof b.info[number]) => isTrunk(v) && v.tt > (long ? 0.08 : 0.49) && Math.abs(v.theta) > 0.39;
  const sleeve = (v: typeof b.info[number]) => v.region === REGION.upperarm ||
    (v.region === REGION.lowerarm && v.t < (long ? 0.9 : 0.36));
  const base = shell(g, {
    covers: v => torso(v) || sleeve(v),
    offset: cm(2.8), tile: 0.22, relax: 6, edgeRelax: 5,
    hemDepth: cm(0.3), edgeLoops: true,
  });
  if (!base) return [];
  const dark = cloth(g, 'Open racing jacket', st, { roughness: 0.61, doubleSided: true });
  const red = mat('Racing jacket red panels', null, { color: st.color2, roughness: 0.63, doubleSided: true });
  const white = mat('Racing jacket white panels', null, { color: '#e9ecec', roughness: 0.68, doubleSided: true });
  const trim = mat('Racing jacket edge piping', null, { color: st.color2, roughness: 0.53 });
  const parts: GPart[] = [{ mesh: base.mesh, material: dark, smooth: true }];

  // Broad red shoulder and outer-arm panels echo the reference without covering the open front.
  const shoulder = shell(g, {
    covers: v => (torso(v) && v.tt > 0.84 && Math.abs(v.theta) < 2.55) ||
      (sleeve(v) && v.t < 0.75 && Math.abs(v.theta) > 0.75 && Math.abs(v.theta) < 2.45),
    offset: cm(3.1), tile: 0.18, relax: 5, hemDepth: cm(0.2),
  });
  if (shoulder) parts.push({ mesh: shoulder.mesh, material: red, smooth: true });
  const back = shell(g, {
    covers: v => torso(v) && v.tt > 0.77 && v.tt < 0.86 && Math.abs(v.theta) > 2.35,
    offset: cm(3.15), tile: 0.15, relax: 4, noRim: true,
  });
  if (back && !long) parts.push({ mesh: back.mesh, material: white, smooth: true });

  // Bind the actual cut edges: front opening, cropped waist, collar and sleeve cuffs.
  const edges: PolyMesh[] = [];
  for (const loop of base.edgeLoops ?? []) if (loop.length > 7) edges.push(cord(loop, cm(0.22), true, 6));
  if (edges.length) parts.push({ mesh: merge(edges)!, material: trim });

  // Small sewn sponsor fields sit on the front panels rather than bridging the opening.
  const front = new Caster(base.mesh, null, () => true, 'front');
  const patches: PolyMesh[] = [];
  for (const side of [-1, 1]) {
    const hit = front.hit(side * b.L.shoulderX * 0.47, torsoY(b, 0.76));
    if (!hit) continue;
    const centre = v3.madd(hit.p, hit.n, cm(0.32));
    patches.push(roundedBox(frameOf(centre, hit.n, [0, 1, 0]), [cm(4.5), cm(1.6), cm(0.15)], 0.35));
  }
  if (patches.length && !long) parts.push({ mesh: merge(patches)!, material: white });
  return parts;
}

export const RACING_JACKET_LONG: GarmentDef = {
  id: 'racing_jacket_long', label: 'Racing jacket (long sleeves)', slot: 'jacket',
  patterns: ['leather', 'solid'], color: '#24262b', color2: '#cd2736', build: (g, st) => racingJacket(g, st, true),
};

export const RACING_JACKET: GarmentDef = {
  id: 'racing_jacket', label: 'Open racing jacket', slot: 'jacket',
  patterns: ['leather', 'solid'], color: '#24262b', color2: '#cd2736', build: racingJacket,
};
