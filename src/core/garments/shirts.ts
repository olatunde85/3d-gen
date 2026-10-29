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
import { clamp, cloth, cylinderUVs, hplane, isTrunk, isUpper, mat, points, shell, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { Caster, gridMesh, liftGrid, OUTWARD } from './project';
import { cord, ellipsoid, frameOf, hullRing, loftRings, merge, orientOutward, v3 } from './ring';

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
 * The open collar, laid over whatever is outermost (the shirt, or a jacket's lapels): round the
 * back of the neck a stand rises and folds over into a fall that lies down over the shoulders (or
 * the jacket's collar), dipping toward the front where it runs into two collar points (revers)
 * lying on the chest either side of the V, from the collarbones down to the V's point.
 */
export function openCollar(g: GCtx, m: Material, o: CollarOpts): GPart[] {
  const b = g.body, sx = b.L.shoulderX;
  const surfaces = merge(g.wornMeshes ?? []);
  if (!surfaces) return [];
  const two = { ...m, doubleSided: true };
  const neckPts = points(b, (v) => v.region === REGION.neck || (isTrunk(v) && v.tt > 0.88));
  // What the fall lies on: the neck and shoulders and anything worn over them.
  const outer = [...neckPts, ...(g.worn ?? []), ...(g.jacket ?? [])].filter((p) => p[1] > b.L.neckY - cm(6));
  // Stand and fall: rings round the back of the neck (angle A either side of the back), each
  // dipping toward its ends where the collar opens into the revers.
  const A = 2.75, S = 56, nY = b.L.neckY;
  const arc: [number, number] = [Math.PI - A, Math.PI + A];
  const dip = (j: number) => -cm(4) * Math.abs((2 * j) / S - 1) ** 2.6;
  // Each point of a ring comes from the hull at its own (dipped) height, so the collar widens
  // with the body as it comes down toward the front.
  const ring = (src: Vec3[], y: number, off: number): Vec3[] | null => {
    const cache = new Map<number, Vec3[] | null>();
    const out: Vec3[] = [];
    for (let j = 0; j <= S; j++) {
      const k = Math.round((y + dip(j)) / cm(0.5));
      if (!cache.has(k)) cache.set(k, hullRing(src, hplane(b, k * cm(0.5)), { slab: cm(1.2), samples: S, offset: off, arc }));
      const r = cache.get(k);
      if (!r) return null;
      out.push(r[j]);
    }
    // Smooth out the steps between heights.
    for (let it = 0; it < 4; it++) {
      const prev = out.map((q) => [...q] as Vec3);
      for (let j = 1; j < S; j++) out[j] = v3.scale(v3.add(v3.add(prev[j - 1], v3.scale(prev[j], 2)), prev[j + 1]), 0.25);
    }
    return out;
  };
  const so = o.standOffset;
  const rings = [
    ring(neckPts, nY - cm(1.2), so),
    ring(neckPts, nY + cm(1.6), so + cm(0.1)),
    // The fold: rounded over the top of the stand.
    ring(neckPts, nY + cm(1.95), so + cm(0.45)),
    ring(neckPts, nY + cm(1.4), so + cm(0.85)),
    // The fall, lying out over what is below it.
    ring(outer, nY - cm(1.6), cm(0.45)),
  ];
  const parts: GPart[] = [];
  if (rings.every((r) => r)) {
    const rs = rings as Vec3[][];
    // The fall never sits inside the stand.
    const c: Vec3 = [0, 0, b.L.torsoZ];
    for (let j = 0; j <= S; j++) {
      const inner = rs[3][j], p = rs[4][j];
      const ri = Math.hypot(inner[0] - c[0], inner[2] - c[2]), rp = Math.hypot(p[0] - c[0], p[2] - c[2]);
      if (rp < ri + cm(0.3)) {
        const k = (ri + cm(0.3)) / (rp || 1);
        rs[4][j] = [c[0] + (p[0] - c[0]) * k, p[1], c[2] + (p[2] - c[2]) * k];
      }
    }
    parts.push(...part(orientOutward(loftRings(rs, { closedAround: false, tileU: 0.2, tileV: 0.1 }), [0, nY, b.L.torsoZ - cm(20)]), two));
    parts.push(...part(cord(rs[4], cm(0.2), false, 6), m));
  }
  // Revers: cast onto the outermost surface (over a jacket's lapels when one is worn).
  const front = new Caster(surfaces, null, () => true, 'front');
  // The inner edge runs down the V from the base of the neck (covering the neckline's cut up to
  // where the stand ends); the outer point lies on the collarbone (tt 0.94).
  const yTopV = torsoY(b, 1), yBotV = torsoY(b, o.ttV), drop = yTopV - torsoY(b, 0.94) + cm(3);
  const flaps: PolyMesh[] = [];
  for (const s of [1, -1]) {
    // Inner edge down the V; the outer edge flares out to a point `lapelW` wide at the top,
    // angled down toward the shoulder.
    const R = 14, C = 8, grid: Vec3[][] = [];
    for (let i = 0; i <= R; i++) {
      const t = i / R;
      const row: Vec3[] = [];
      for (let j = 0; j <= C; j++) {
        const u = j / C;
        const yIn = yTopV + (yBotV - yTopV) * t;
        const xIn = s * (o.vw * sx * (1 - t) + cm(0.6));
        const x = xIn + s * u * o.lapelW * (1 - t) ** 0.6;
        // The top edge slopes down to the point.
        const y = yIn - u * drop * (1 - t);
        // A ray that misses (past the shoulder's edge) reuses its neighbour.
        const hit = front.hit(x, y);
        const prev = row[row.length - 1] ?? grid[grid.length - 1]?.[j];
        if (hit) row.push(hit.p);
        else if (prev) row.push(prev);
        else row.push([x, y, b.L.torsoZ + cm(10)]);
      }
      grid.push(row);
    }
    const lifted = liftGrid(grid, cm(0.4), OUTWARD.front, 2);
    flaps.push(orientOutward(gridMesh(lifted, 0.3), v3.madd(grid[R >> 1][C >> 1], OUTWARD.front, -1)));
    // A rolled edge along the outer and top edges gives the point thickness and a shadow line.
    const edge = [...lifted.map((row) => row[C]).reverse(), ...lifted[0].slice(0, C).reverse()];
    flaps.push(cord(edge, cm(0.22), false, 6));
    // The fold down the V: a soft rounded edge that also covers the neckline's cut.
    flaps.push(cord(lifted.map((row) => v3.madd(row[0], OUTWARD.front, -cm(0.1))), cm(0.3), false, 6));
  }
  parts.push(...part(merge(flaps), two));
  return parts;
}

/** The button placket below the V of a shirt whose shell is `top`, with its buttons. */
export function placket(g: GCtx, top: PolyMesh, m: Material, o: CollarOpts): GPart[] {
  const b = g.body;
  const front = new Caster(top, null, () => true, 'front');
  const yBotV = torsoY(b, o.ttV);
  const parts: GPart[] = [];
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

// Rayon: a soft sheen.
const campCloth = (g: GCtx, st: GarmentStyle) => cloth(g, 'Camp shirt', st, { roughness: 0.62 });
/** Open to the sternum; wide spread revers; the stand loose enough for chains to lie inside it. */
const CAMP: CollarOpts = { ttV: 0.6, vw: 0.42, lapelW: cm(7.8), buttons: 3, spacing: cm(10), placketTo: 0.02, buttonColor: '#efe8da', standOffset: cm(1.8) };

/** Loose short-sleeved resort shirt, open to the sternum and tucked in. */
function campShirt(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const m = campCloth(g, st);
  const ease = cm(1.2), sleeveEnd = 0.5;
  const collar = CAMP;
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
  return [{ mesh: top.mesh, material: m, hides: top.covered, smooth: true }, ...placket(g, top.mesh, m, collar)];
}

export const SHIRTS: GarmentDef[] = [
  { id: 'camp_shirt', label: 'Camp-collar shirt (open)', slot: 'top', patterns: ['tropical', 'solid', 'linen'], color: '#efe6d4', color2: '#e58aa6', build: campShirt, collar: (g, st) => openCollar(g, campCloth(g, st), CAMP) },
];
