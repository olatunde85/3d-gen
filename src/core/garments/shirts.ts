/**
 * Open-collared shirts: a V neckline whose collar points (revers) lie flat on the chest, a collar
 * stand round the back of the neck, and a button placket below the V. Shared by the prison
 * jumpsuit's top and the camp-collar shirt: a loose, short-sleeved resort shirt in a tropical
 * print, worn open to the sternum and tucked in.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import type { Material } from '../mesh';
import { cm, REGION, type Body, type VInfo } from './body';
import { part } from './drape';
import { clamp, cloth, cylinderUVs, isTrunk, isUpper, mat, points, shell, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { Caster, gridMesh, liftGrid, OUTWARD } from './project';
import { cord, ellipsoid, frameOf, merge, orientOutward, solidBand, v3 } from './ring';

export interface CollarOpts {
  /** Trunk height (tt) of the V's point. */
  ttV: number;
  /** Half-width of the V at the base of the neck, as a fraction of the shoulder width. */
  vw: number;
  /** Width of the collar points at the top (decimetres). */
  lapelW: number;
  /** Buttons down the placket below the V, and their spacing (decimetres). */
  buttons: number;
  spacing: number;
  /** Trunk height (tt) the placket runs down to. */
  placketTo: number;
  buttonColor: string;
  /** Distance of the collar stand from the neck (decimetres). */
  standOffset: number;
}

/** Where the V neckline (and a slightly lowered back neck) is cut out of a shirt's shell. */
export function vNeck(b: Body, o: Pick<CollarOpts, 'ttV' | 'vw'>) {
  const sx = b.L.shoulderX;
  return (v: VInfo) => {
    if (Math.abs(v.tth) < Math.PI / 2) return v.tt > o.ttV && v.ax < o.vw * sx * clamp((v.tt - o.ttV) / (1 - o.ttV), 0, 1) + cm(0.6);
    return (v.ax / (0.38 * sx)) ** 2 + ((1.02 - v.tt) / 0.04) ** 2 < 1;
  };
}

/**
 * The open collar of a shirt whose shell is `top`: a stand round the back of the neck, two collar
 * points lying on the chest either side of the V (from the collarbones down to the V's point),
 * and a placket with buttons below it.
 */
export function openCollar(g: GCtx, top: PolyMesh, m: Material, o: CollarOpts): GPart[] {
  const b = g.body, sx = b.L.shoulderX;
  const parts: GPart[] = [];
  // Stand: wide enough to cover the neckline's edge round the back and sides.
  const neckPts = points(b, (v) => v.region === REGION.neck || (isTrunk(v) && v.tt > 0.88));
  const stand = solidBand(neckPts, { origin: [0, b.L.neckY - cm(0.9), b.L.torsoZ], normal: v3.norm([0, 1, 0.25]) }, cm(4), cm(0.4), o.standOffset, {
    samples: 56, slab: cm(1.4), arc: [Math.PI - 2.4, Math.PI + 2.4],
  });
  parts.push(...part(stand, m));
  // Collar points, placket and buttons lie on the shirt itself.
  const front = new Caster(top, null, () => true, 'front');
  // The points lie on the chest from the collarbones (tt 0.94) down the V to its point.
  const ttTop = 0.94, yTopV = torsoY(b, ttTop), yBotV = torsoY(b, o.ttV);
  const vTop = o.vw * sx * ((ttTop - o.ttV) / (1 - o.ttV));
  const flaps: PolyMesh[] = [];
  for (const s of [1, -1]) {
    // Inner edge down the V; the outer edge flares out to a point `lapelW` wide at the top,
    // angled down toward the shoulder.
    const R = 12, C = 6, grid: Vec3[][] = [];
    for (let i = 0; i <= R; i++) {
      const t = i / R;
      const row: Vec3[] = [];
      for (let j = 0; j <= C; j++) {
        const u = j / C;
        const yIn = yTopV + (yBotV - yTopV) * t;
        const xIn = s * (vTop * (1 - t) + cm(0.6));
        const x = xIn + s * u * o.lapelW * (1 - t) ** 0.6;
        const y = yIn - u * cm(2.2) * (1 - t);
        // A ray that misses (past the shoulder's edge) reuses its neighbour.
        const hit = front.hit(x, y);
        const prev = row[row.length - 1] ?? grid[grid.length - 1]?.[j];
        if (hit) row.push(hit.p);
        else if (prev) row.push(prev);
        else row.push([x, y, b.L.torsoZ + cm(10)]);
      }
      grid.push(row);
    }
    const lifted = liftGrid(grid, cm(0.45), OUTWARD.front, 1);
    flaps.push(orientOutward(gridMesh(lifted, 0.3), v3.madd(grid[R >> 1][C >> 1], OUTWARD.front, -1)));
    // A rolled edge along the outer and top edges gives the point thickness and a shadow line.
    const edge = [...lifted.map((row) => row[C]).reverse(), ...lifted[0].slice(0, C).reverse()];
    flaps.push(cord(edge, cm(0.22), false, 6));
    // The fold down the V: a soft rounded edge that also covers the neckline's cut.
    flaps.push(cord(lifted.map((row) => v3.madd(row[0], OUTWARD.front, -cm(0.1))), cm(0.3), false, 6));
  }
  parts.push(...part(merge(flaps), { ...m, doubleSided: true }));
  const btns: PolyMesh[] = [];
  for (let k = 0; k < o.buttons; k++) {
    const hit = front.hit(0, yBotV - cm(3) - k * o.spacing);
    if (hit) btns.push(ellipsoid(frameOf(v3.madd(hit.p, OUTWARD.front, cm(0.2)), OUTWARD.front, [0, 1, 0]), [cm(0.6), cm(0.6), cm(0.25)], [0.5, 0.5], 10, 5));
  }
  const pts: Vec3[] = [];
  for (let y = yBotV; y > torsoY(b, o.placketTo); y -= cm(2)) {
    const hit = front.hit(0, y);
    if (hit) pts.push(v3.madd(hit.p, OUTWARD.front, cm(0.05)));
  }
  parts.push(...part(merge(btns), mat(`${m.name} buttons`, null, { color: o.buttonColor, roughness: 0.4 })));
  parts.push(...part(pts.length > 2 ? cord(pts, cm(0.12), false, 4) : null, { ...m, name: `${m.name} placket` }));
  return parts;
}

/** Loose short-sleeved resort shirt, open to the sternum and tucked in. */
function campShirt(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  // Rayon: a soft sheen.
  const m = cloth(g, 'Camp shirt', st, { roughness: 0.62 });
  const ease = cm(1.2), sleeveEnd = 0.5;
  const collar: CollarOpts = { ttV: 0.6, vw: 0.42, lapelW: cm(8), buttons: 3, spacing: cm(10), placketTo: 0.02, buttonColor: '#efe8da', standOffset: ease * 0.8 };
  const neck = vNeck(b, collar);
  const top = shell(g, {
    // Tucked in: down over the hips under the trousers' waist.
    covers: (v) => ((isUpper(v) && v.tt >= 0.02) || (v.region === REGION.upperarm && v.t < sleeveEnd)) && !neck(v),
    // Loose short sleeves, widening toward their hems.
    // (Still inside a jacket's sleeves.)
    offset: (v) => (v.region === REGION.upperarm ? ease + cm(0.2) + cm(0.8) * clamp(v.t / sleeveEnd, 0, 1) : ease),
    tile: 0.32, relax: 6, hemDepth: cm(0.25),
  });
  if (!top) return [];
  top.mesh = cylinderUVs(top.mesh, 0, b.L.torsoZ, 0.32);
  return [{ mesh: top.mesh, material: m, hides: top.covered, smooth: true }, ...openCollar(g, top.mesh, m, collar)];
}

export const SHIRTS: GarmentDef[] = [
  { id: 'camp_shirt', label: 'Camp-collar shirt (open)', slot: 'top', patterns: ['tropical', 'solid', 'linen'], color: '#efe6d4', color2: '#e58aa6', build: campShirt },
];
