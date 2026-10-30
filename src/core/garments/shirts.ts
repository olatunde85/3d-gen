/**
 * Shirts: a V neckline cut and a button placket (used by the prison jumpsuit's top), and the
 * resort shirt, cut from a MakeHuman suit and printed.
 */
import { compact, type PolyMesh } from '../geometry';
import { smoothstep, type Vec3 } from '../math';
import type { Material } from '../mesh';
import { cm, type Body, type VInfo } from './body';
import { part } from './drape';
import { clamp, hplane, mat, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { keepIslands, outfitCloth, outfitCovers, SHIRT_REGIONS, type Island } from './outfit-cut';
import { Caster, OUTWARD } from './project';
import { boundaryChain, cord, ellipsoid, frameOf, hullRing, merge, rayRing, v3 } from './ring';

/** A V neckline: its point's trunk height (tt), and half-width at the base of the neck (fraction of the shoulder width). */
export interface VOpts {
  ttV: number;
  vw: number;
}

/** Where the V neckline (and a slightly lowered back neck) is cut out of a shirt's shell. */
export function vNeck(b: Body, o: VOpts) {
  const sx = b.L.shoulderX;
  return (v: VInfo) => {
    if (Math.abs(v.tth) < Math.PI / 2) return v.tt > o.ttV && v.ax < o.vw * sx * clamp((v.tt - o.ttV) / (1 - o.ttV), 0, 1) + cm(0.6);
    return (v.ax / (0.38 * sx)) ** 2 + ((1.02 - v.tt) / 0.04) ** 2 < 1;
  };
}

export interface PlacketOpts {
  /** Trunk height (tt) of the V's point, where the placket starts. */
  ttV: number;
  /** Buttons below the V, and their spacing (decimetres). */
  buttons: number;
  spacing: number;
  /** Trunk height (tt) the placket runs down to. */
  placketTo: number;
  buttonColor: string;
}

/**
 * The button placket below the V of a shirt whose shell is `top`, with its buttons. A shirt
 * tucked in stops where the bottom (already dressed, in `g.worn`) covers it.
 */
export function placket(g: GCtx, top: PolyMesh, m: Material, o: PlacketOpts): GPart[] {
  const b = g.body;
  const front = new Caster(top, null, () => true, 'front');
  const yBotV = torsoY(b, o.ttV);
  const under = (g.worn ?? []).filter((q) => Math.abs(q[0]) < cm(1.5) && q[2] > b.L.torsoZ);
  const tucked = (p: Vec3) => under.some((q) => Math.abs(q[1] - p[1]) < cm(1.5) && q[2] > p[2] + cm(0.1));
  const btns: PolyMesh[] = [];
  for (let k = 0; k < o.buttons; k++) {
    const hit = front.hit(0, yBotV - cm(3) - k * o.spacing);
    if (hit && !tucked(hit.p)) btns.push(ellipsoid(frameOf(v3.madd(hit.p, OUTWARD.front, cm(0.2)), OUTWARD.front, [0, 1, 0]), [cm(0.6), cm(0.6), cm(0.25)], [0.5, 0.5], 10, 5));
  }
  const pts: Vec3[] = [];
  for (let y = yBotV; y > torsoY(b, o.placketTo); y -= cm(2)) {
    const hit = front.hit(0, y);
    if (!hit || tucked(hit.p)) break;
    pts.push(v3.madd(hit.p, OUTWARD.front, cm(0.05)));
  }
  return [
    ...part(merge(btns), mat(`${m.name} buttons`, null, { color: o.buttonColor, roughness: 0.4 })),
    ...part(pts.length > 2 ? cord(pts, cm(0.12), false, 4) : null, { ...m, name: `${m.name} placket` }),
  ];
}

/**
 * Resort shirt: the shirt of MakeHuman's casual suit 01 (collar, placket and buttons, yoke, cuffs,
 * folds), cut from the suit and printed in the chosen pattern; tucked into any trousers.
 */
function resortShirt(g: GCtx, st: GarmentStyle): GPart[] {
  const o = g.outfits?.[RESORT_FROM];
  if (!o) return [];
  // The suit's shirt pieces are on both sides of its UV atlas; the jeans are in the middle. Each
  // vertex keeps the body vertex it follows (`ref`: a jacket over it hides what it covers).
  const src = { ...o.mesh, ref: Int32Array.from(o.ref) };
  let mesh = keepIslands(src, (i) => (i.u1 < 0.36 || i.u0 > 0.71) && !isCollar(i));
  if (g.layered.bottom && g.worn?.length) mesh = tuckInto(g, mesh);
  const collar = keepIslands(src, isCollar);
  // Rayon: a soft sheen. The print tiles six times across the atlas (one unit is about 2 m of cloth).
  const m = outfitCloth(g, o, 'Resort shirt', st, 6, { roughness: 0.62 });
  return [
    { mesh, material: m, hides: outfitCovers(g, o, mesh, SHIRT_REGIONS), smooth: true },
    { mesh: collar, material: m, collar: true, smooth: true },
  ];
}

const RESORT_FROM = 'male_casualsuit01';
// The suit shirt's collar: one island at the right of its UV atlas.
const isCollar = (i: Island) => i.u0 > 0.71 && i.u1 < 0.8 && i.v0 > 0.28 && i.v1 < 0.49;

/**
 * Tuck a shirt into the bottom already dressed (`g.worn`): from just above the top of the bottom
 * down, the shirt is drawn in inside it; below that it is cut off (hidden under the bottom).
 */
function tuckInto(g: GCtx, m: PolyMesh): PolyMesh {
  const b = g.body, worn = g.worn!;
  let yTop = -Infinity;
  for (const p of worn) if (Math.abs(p[0]) < cm(4) && p[2] > b.L.torsoZ) yTop = Math.max(yTop, p[1]);
  const P = new Float32Array(m.positions), c: Vec3 = [0, 0, b.L.torsoZ];
  const rings = new Map<number, Vec3[] | null>();
  const ringAt = (y: number) => {
    const k = Math.round(y / cm(1));
    if (!rings.has(k)) rings.set(k, hullRing(worn, hplane(b, k * cm(1)), { slab: cm(1.2), samples: 96, offset: -cm(1.2) }));
    return rings.get(k)!;
  };
  for (let i = 0; i < P.length; i += 3) {
    const y = P[i + 1];
    if (y > yTop + cm(3)) continue;
    const r = ringAt(Math.min(y, yTop - cm(1)));
    if (!r) continue;
    const d: Vec3 = [P[i] - c[0], 0, P[i + 2] - c[2]], rs = Math.hypot(d[0], d[2]) || 1;
    const rt = rayRing(r, [c[0], y, c[2]], [d[0] / rs, 0, d[2] / rs]);
    // Only the shirt's body round the waist (not a sleeve hanging beside it).
    if (rt === null || rs <= rt || rs > rt + cm(5)) continue;
    // Eased in over the 3 cm above the waist (the shirt blouses over it).
    const w = smoothstep(yTop + cm(3), yTop - cm(0.5), y);
    const k = (rs + (rt - rs) * w) / rs;
    P[i] = c[0] + d[0] * k;
    P[i + 2] = c[2] + d[2] * k;
  }
  // Below the waist, cut off what was drawn inside (sleeves stay).
  const yCut = yTop - cm(3.5);
  return compact({ ...m, positions: P }, (_, cs) => {
    let y = 0, x = 0;
    for (const v of cs) [y, x] = [y + P[v * 3 + 1] / cs.length, Math.max(x, Math.hypot(P[v * 3] - c[0], P[v * 3 + 2] - c[2]))];
    const r = ringAt(Math.min(y, yTop - cm(1)));
    return y > yCut || !r || x > (rayRing(r, [c[0], y, c[2]], [1, 0, 0]) ?? 0) + cm(5);
  });
}

const BLOUSE_FROM = 'female_elegantsuit01';

/**
 * Silk blouse: the blouse of MakeHuman's female elegant suit 01 (pointed collar, button front, long
 * sleeves with cuffs), cut from the suit (its skirt left out) and made up in satin, tucked in.
 */
function silkBlouse(g: GCtx, st: GarmentStyle): GPart[] {
  const o = g.outfits?.[BLOUSE_FROM];
  if (!o) return [];
  // The suit's skirt is the one wide island across the middle of its atlas.
  let mesh = keepIslands({ ...o.mesh, ref: Int32Array.from(o.ref) }, (i) => !(i.u0 < 0.05 && i.u1 > 0.7 && i.v0 > 0.44));
  if (g.layered.bottom && g.worn?.length) mesh = tuckInto(g, mesh);
  // Worn open: a deep V from the collar down between the breasts, its edges folded back.
  const b = g.body, sx = b.L.shoulderX, yTop = b.L.neckY + cm(1), yV = torsoY(b, 0.48);
  const P = mesh.positions;
  const inV = (x: number, y: number, z: number) => z > b.L.torsoZ && y > yV && y < yTop + cm(4) && Math.abs(x) < 0.26 * sx * clamp((y - yV) / (yTop - yV), 0, 1) ** 0.7;
  mesh = compact(mesh, (_, c) => {
    let x = 0, y = 0, z = 0;
    for (const v of c) [x, y, z] = [x + P[v * 3] / c.length, y + P[v * 3 + 1] / c.length, z + P[v * 3 + 2] / c.length];
    return !inV(x, y, z);
  });
  const vEdge = boundaryChain(mesh, (p) => p[2] > b.L.torsoZ && p[1] > yV - cm(2) && p[1] < yTop && Math.abs(p[0]) < 0.4 * sx);
  let edgeLine = vEdge;
  for (let it = 0; it < 5; it++) edgeLine = edgeLine.map((p, i) => (i === 0 || i === edgeLine.length - 1 ? p : v3.scale(v3.add(v3.add(edgeLine[i - 1], v3.scale(p, 2)), edgeLine[i + 1]), 0.25)));
  // Satin: a soft lustre (about 2 m of cloth per unit of the atlas).
  const m = outfitCloth(g, o, 'Silk blouse', st, 6, { roughness: st.pattern === 'satin' ? 0.32 : 0.6 });
  return [
    { mesh, material: { ...m, doubleSided: true }, hides: outfitCovers(g, o, mesh, SHIRT_REGIONS), smooth: true },
    ...part(edgeLine.length > 4 ? cord(edgeLine, cm(0.25), false, 6) : null, m),
  ];
}

export const SHIRTS: GarmentDef[] = [
  {
    id: 'silk_blouse', label: 'Silk blouse', slot: 'top', patterns: ['satin', 'solid'], color: '#efe2cc', color2: '#fff8ec',
    fromOutfit: BLOUSE_FROM, build: silkBlouse,
  },
  {
    id: 'camp_shirt', label: 'Resort shirt', slot: 'top', patterns: ['tropical', 'solid', 'linen'], color: '#efe6d4', color2: '#e58aa6',
    fromOutfit: RESORT_FROM, build: resortShirt,
  },
];
