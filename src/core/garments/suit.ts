/**
 * Suits: the jacket and trousers of MakeHuman's elegant suit 01 (padded shoulders, notch lapels
 * rolling to a single button, a collar set close round the back of the neck, sleeves with
 * buttoned cuffs, tailored trousers), cut from the suit and made up in the chosen cloth. The
 * suit's own shirt front, tie, collar and cuffs are left out, so any top shows in the V. The
 * trousers get pressed creases.
 */
import type { PolyMesh } from '../geometry';
import { smoothstep, type Vec3 } from '../math';
import { cm, REGION } from './body';
import { crotchY, soleY } from './drape';
import { Caster, OUTWARD } from './project';
import { cord, merge, v3 } from './ring';
import { mat, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { keepIslands, outfitCloth, outfitCovers, type Island } from './outfit-cut';

const FROM = 'male_elegantsuit01';
// The suit's UV atlas: the trouser legs fill its lower left; the shirt front, tie, collar and
// cuffs are narrow islands in the upper middle; the buttons are tiny islands along the top;
// everything else is the jacket (back, fronts and sleeves).
const isTrousers = (i: Island) => i.v1 < 0.53 && i.u1 < 0.75;
const isShirt = (i: Island) => i.v0 >= 0.54 && i.u0 >= 0.33 && i.u1 <= 0.495;
const isButton = (i: Island) => i.v0 > 0.88 && i.u1 - i.u0 < 0.09 && !isShirt(i);
// About 1.85 m of cloth per unit of the atlas: six repeats of a 30 cm tile.
const REPEAT = 6;

function cut(g: GCtx, st: GarmentStyle, name: string, keep: (i: Island) => boolean, regions: number[]): GPart[] {
  const o = g.outfits?.[FROM];
  if (!o) return [];
  const mesh = keepIslands({ ...o.mesh, ref: Int32Array.from(o.ref) }, keep);
  const cloth = outfitCloth(g, o, name, st, REPEAT, { roughness: st.pattern === 'suiting' ? 0.75 : 0.85, doubleSided: true });
  return [{ mesh, material: cloth, hides: outfitCovers(g, o, mesh, regions), smooth: true }];
}

function suitJacket(g: GCtx, st: GarmentStyle): GPart[] {
  const o = g.outfits?.[FROM];
  if (!o) return [];
  const buttons = keepIslands(o.mesh, isButton);
  return [
    ...cut(g, st, 'Suit jacket', (i) => !isTrousers(i) && !isShirt(i) && !isButton(i), [REGION.torso, REGION.hips, REGION.upperarm, REGION.lowerarm]),
    { mesh: buttons, material: mat('Suit buttons', null, { color: '#d8c7b8', roughness: 0.35 }) },
  ];
}

/**
 * Pressed creases down the front and back of each leg, from below the crotch to the hem: the
 * cloth is pushed out into a sharp ridge along each crease line, which a fine cord marks.
 */
function creases(g: GCtx, part: GPart): GPart[] {
  const b = g.body, m = part.mesh, P = new Float32Array(m.positions), ref = m.ref;
  if (!ref) return [part];
  const yTop = crotchY(b) - cm(4), lines: PolyMesh[] = [];
  for (const s of [1, -1]) {
    const onLeg = (i: number) => ref[i] >= 0 && b.info[ref[i]].side === s && (b.regions[ref[i]] === REGION.upperleg || b.regions[ref[i]] === REGION.lowerleg);
    // The trouser leg's centre line: a straight line fitted through the middles of its
    // cross-sections (2 cm bins), from below the crotch to the hem.
    const bins = new Map<number, [number, number, number, number]>();
    for (let i = 0; i < P.length / 3; i++) {
      if (!onLeg(i) || P[i * 3 + 1] > yTop) continue;
      const k = Math.round(P[i * 3 + 1] / cm(2)), e = bins.get(k) ?? [Infinity, -Infinity, Infinity, -Infinity];
      bins.set(k, [Math.min(e[0], P[i * 3]), Math.max(e[1], P[i * 3]), Math.min(e[2], P[i * 3 + 2]), Math.max(e[3], P[i * 3 + 2])]);
    }
    const mids = [...bins].map(([k, e]): Vec3 => [(e[0] + e[1]) / 2, k * cm(2), (e[2] + e[3]) / 2]);
    if (mids.length < 3) continue;
    const my = mids.reduce((a, q) => a + q[1], 0) / mids.length;
    const fitAxis = (ax: 0 | 2) => {
      const mx = mids.reduce((a, q) => a + q[ax], 0) / mids.length;
      const sl = mids.reduce((a, q) => a + (q[1] - my) * (q[ax] - mx), 0) / (mids.reduce((a, q) => a + (q[1] - my) ** 2, 0) || 1);
      return (y: number) => mx + sl * (y - my);
    };
    const fx = fitAxis(0), fz = fitAxis(2);
    const centre = (y: number): Vec3 => [fx(y), y, fz(y)];
    for (let i = 0; i < P.length / 3; i++) {
      if (!onLeg(i)) continue;
      const y = P[i * 3 + 1];
      if (y > yTop) continue;
      const c = centre(y), dx = P[i * 3] - c[0], dz = P[i * 3 + 2] - c[2], a = Math.atan2(dx, dz);
      // Distance (radians) from the front (0) or back (PI) of the leg.
      const off = Math.min(Math.abs(a), Math.PI - Math.abs(a));
      const k = Math.exp(-((off / 0.11) ** 2)) * smoothstep(yTop, yTop - cm(8), y), d = Math.hypot(dx, dz) || 1;
      P[i * 3] += (dx / d) * cm(0.9) * k;
      P[i * 3 + 2] += (dz / d) * cm(0.9) * k;
    }
    // The crease lines themselves.
    const mesh = { ...m, positions: P };
    for (const dir of ['front', 'back'] as const) {
      const cast = new Caster(mesh, null, () => true, dir), line: Vec3[] = [];
      for (let y = yTop - cm(4); y > soleY(b) + cm(6); y -= cm(2)) {
        const c = centre(y), hit = cast.hit(c[0], y);
        if (hit) line.push(v3.madd(hit.p, OUTWARD[dir], cm(0.15)));
      }
      if (line.length > 2) lines.push(cord(line, cm(0.16), false, 3));
    }
  }
  const crease = merge(lines);
  return [{ ...part, mesh: { ...m, positions: P } }, ...(crease ? [{ mesh: crease, material: { ...part.material, name: 'Suit trousers creases' } }] : [])];
}

function suitTrousers(g: GCtx, st: GarmentStyle): GPart[] {
  return cut(g, st, 'Suit trousers', isTrousers, [REGION.hips, REGION.upperleg, REGION.lowerleg]).flatMap((p) => creases(g, p));
}

export const SUIT: GarmentDef[] = [
  { id: 'suit_jacket', label: 'Suit jacket', slot: 'jacket', patterns: ['linen', 'suiting', 'solid'], color: '#e9b7c0', color2: '#f3d6db', fromOutfit: FROM, build: suitJacket },
  { id: 'suit_trousers', label: 'Suit trousers', slot: 'bottom', patterns: ['linen', 'suiting', 'solid'], color: '#e9b7c0', color2: '#f3d6db', fromOutfit: FROM, build: suitTrousers },
];
