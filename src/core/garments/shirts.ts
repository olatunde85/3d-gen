/**
 * Shirts: a V neckline cut and a button placket (used by the prison jumpsuit's top), and the
 * resort shirt, cut from a MakeHuman suit and printed.
 */
import { compact, type PolyMesh } from '../geometry';
import { smoothstep, type Vec3 } from '../math';
import type { Material } from '../mesh';
import { cm, REGION, type Body, type VInfo } from './body';
import { part } from './drape';
import { clamp, hplane, isTrunk, mat, points, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { keepIslands, outfitCloth, outfitCovers, SHIRT_REGIONS, type Island } from './outfit-cut';
import { Caster, OUTWARD } from './project';
import { boundaryChain, cord, ellipsoid, frameOf, hullRing, loftRings, merge, orientOutward, rayRing, v3 } from './ring';

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
  // Satin: a soft lustre (about 2 m of cloth per unit of the atlas).
  const m = outfitCloth(g, o, 'Silk blouse', st, 6, { roughness: st.pattern === 'satin' ? 0.32 : 0.6 });
  return [{ mesh, material: m, hides: outfitCovers(g, o, mesh, SHIRT_REGIONS), smooth: true }];
}

const CLERIC_FROM = 'male_casualsuit02';

/**
 * Clerical shirt: the long-sleeved top of MakeHuman's casual suit 02 (its jeans left out), closed
 * round the neck, made up as a shirt: a button placket down the front, a band collar standing round
 * high on the neck with its rolled top edge, and the white tab at the throat. Tucked in.
 */
function clericalShirt(g: GCtx, st: GarmentStyle): GPart[] {
  const o = g.outfits?.[CLERIC_FROM];
  if (!o) return [];
  // Atlas: the jeans legs are the two tall islands in its lower half.
  let mesh = keepIslands({ ...o.mesh, ref: Int32Array.from(o.ref) }, (i) => !(i.v1 < 0.6 && i.u1 - i.u0 > 0.3));
  if (g.layered.bottom && g.worn?.length) mesh = tuckInto(g, mesh);
  const m = outfitCloth(g, o, 'Clerical shirt', st, 6, { roughness: 0.7 });
  // Band collar: from the shirt's neckline up 3 cm round the neck, its top rolled; open 2.5 cm at
  // the front, where the white tab fills it.
  const b = g.body, sx = b.L.shoulderX;
  const neckV = points(b, (v) => v.region === REGION.neck);
  // What the band fits round: the neck and the base of the neck where it slopes into the shoulders.
  const fitPts = points(b, (v) => v.region === REGION.neck || (isTrunk(v) && v.tt > 0.92));
  let nc: Vec3 = [0, 0, 0];
  for (const q of neckV) nc = v3.add(nc, v3.scale(q, 1 / neckV.length));
  const edge = boundaryChain(mesh, (p) => p[1] > b.L.neckY - cm(6) && Math.abs(p[0]) < 0.6 * sx);
  const parts: GPart[] = [{ mesh, material: m, hides: outfitCovers(g, o, mesh, SHIRT_REGIONS), smooth: true }];
  if (edge.length > 8) {
    // The neckline, smoothed and ordered round the neck from the front-left to the front-right
    // (the gap for the tab at the front).
    const pts = edge.slice(0, edge.length - (v3.len(v3.sub(edge[0], edge[edge.length - 1])) < 1e-6 ? 1 : 0));
    const ang = (p: Vec3) => Math.atan2(p[0] - nc[0], p[2] - nc[2]);
    // The band's gap at the front is a little narrower than the tab, so the two overlap.
    const N = 72, gap = 0.2, ring0: Vec3[] = [];
    for (let k = 0; k <= N; k++) {
      // From +gap round the back to -gap (angles: 0 = front).
      const a = gap + ((2 * Math.PI - 2 * gap) * k) / N, aa = a > Math.PI ? a - 2 * Math.PI : a;
      let best = pts[0], bd = Infinity;
      for (const p of pts) {
        const d = Math.abs(Math.atan2(Math.sin(ang(p) - aa), Math.cos(ang(p) - aa)));
        if (d < bd) [bd, best] = [d, p];
      }
      ring0.push(best);
    }
    let base = ring0;
    for (let it = 0; it < 4; it++) base = base.map((p, i) => (i === 0 || i === base.length - 1 ? p : v3.scale(v3.add(v3.add(base[i - 1], v3.scale(p, 2)), base[i + 1]), 0.25)));
    // Each band ring: up from the neckline, drawn in to 4 mm off the neck.
    const neckAt = (p: Vec3, y: number) => {
      const d = v3.norm([p[0] - nc[0], 0, p[2] - nc[2]]);
      // (Snug: 2 mm off the neck, so a jacket's collar lies over it.)
      const h = hullRing(fitPts, hplane(b, y), { slab: cm(1), samples: 64, offset: cm(0.2) });
      const r = h && rayRing(h, [nc[0], y, nc[2]], d);
      return r ? v3.madd([nc[0], y, nc[2]], d, r) : p;
    };
    const up = (h: number, k: number) => base.map((p) => v3.lerp(v3.add(p, [0, h, 0]), neckAt(p, p[1] + h), k));
    // (About 4 cm: a clerical collar stands high on the neck.)
    // The band's foot flares out 1.5 cm over the shirt's neckline (filling any gap between it and a
    // jacket's collar), then it rises snug round the neck.
    const flare = base.map((p) => {
      const d = v3.norm([p[0] - nc[0], 0, p[2] - nc[2]]);
      return v3.add(v3.madd(p, d, cm(1.5)), [0, -cm(1), 0]);
    });
    const rings = [flare, base.map((p) => v3.add(p, [0, -cm(0.2), 0])), up(cm(0.9), 0.85), up(cm(3), 1), up(cm(4.2), 1)];
    const band = orientOutward(loftRings(rings, { closedAround: false, tileU: 0.2, tileV: 0.1 }), [nc[0], b.L.neckY - cm(6), nc[2]]);
    const bandMesh = merge([band, cord(rings[4], cm(0.18), false, 6)]);
    // (Under a jacket's collar, which lies over it at the back.)
    if (bandMesh) parts.push({ mesh: bandMesh, material: { ...m, doubleSided: true }, collar: true, collarUnder: true });
    // Tab: a white insert in the band's gap at the front. Its bottom meets the shirt's front
    // neckline (which stands a little out from the neck), easing back onto the neck toward its top.
    // (The tab's edges: 2 samples in from the band's ends, over the band.)
    const [L0, R0] = [rings[1][2], rings[1][N - 2]], [L1, R1] = [rings[4][2], rings[4][N - 2]];
    // The shirt's front edge at the centre: its outermost vertex near the top, in front of the neck.
    const MP = mesh.positions;
    let edgeP: Vec3 | null = null;
    for (let i = 0; i < MP.length; i += 3)
      if (Math.abs(MP[i] - nc[0]) < cm(1.5) && MP[i + 2] > nc[2] && MP[i + 1] < b.L.neckY && MP[i + 1] > (L0[1] + R0[1]) / 2 - cm(4))
        if (!edgeP || MP[i + 1] + (MP[i + 2] - nc[2]) * 0.05 > edgeP[1] + (edgeP[2] - nc[2]) * 0.05) edgeP = [MP[i], MP[i + 1], MP[i + 2]];
    const yBot = edgeP ? Math.min((L0[1] + R0[1]) / 2, edgeP[1] - cm(0.4)) : (L0[1] + R0[1]) / 2;
    const rShirt = edgeP ? Math.hypot(edgeP[0] - nc[0], edgeP[2] - nc[2]) : 0;
    const yTop = (L1[1] + R1[1]) / 2;
    const tabRows: Vec3[][] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, y = yBot + (yTop - yBot) * t, row: Vec3[] = [];
      const l = v3.lerp(L0, L1, t), r = v3.lerp(R0, R1, t);
      for (let j = 0; j <= 6; j++) {
        const q = v3.lerp(l, r, j / 6), c = neckAt([q[0], y, q[2]], y), d = v3.norm([c[0] - nc[0], 0, c[2] - nc[2]]);
        // (Just in front of the band, which it overlaps at its edges.)
        const rNeck = Math.hypot(c[0] - nc[0], c[2] - nc[2]) + cm(0.12);
        // Out to the shirt's edge at the bottom, back on the neck by halfway up.
        const k = 1 - Math.min(1, t * 2), rr = Math.max(rNeck, rNeck + (rShirt - rNeck) * k * k * (3 - 2 * k));
        row.push([nc[0] + d[0] * rr, y, nc[2] + d[2] * rr]);
      }
      tabRows.push(row);
    }
    const tab = orientOutward(loftRings(tabRows, { closedAround: false, tileU: 0.05, tileV: 0.05 }), [nc[0], b.L.neckY, nc[2] - cm(5)]);
    parts.push({ mesh: tab, material: mat('Clerical collar tab', null, { color: '#f6f5f0', roughness: 0.45, doubleSided: true }), collar: true });
  }
  return [...parts, ...placket(g, mesh, m, { ttV: 0.97, buttons: 5, spacing: cm(8), placketTo: 0.25, buttonColor: '#1c1c1e' })];
}

export const SHIRTS: GarmentDef[] = [
  {
    id: 'clerical_shirt', label: 'Clerical shirt (tab collar)', slot: 'top', patterns: ['solid', 'linen'], color: '#141416', color2: '#26262a',
    fromOutfit: CLERIC_FROM, build: clericalShirt,
  },
  {
    id: 'silk_blouse', label: 'Silk blouse', slot: 'top', patterns: ['satin', 'solid'], color: '#efe2cc', color2: '#fff8ec',
    fromOutfit: BLOUSE_FROM, build: silkBlouse,
  },
  {
    id: 'camp_shirt', label: 'Resort shirt', slot: 'top', patterns: ['tropical', 'solid', 'linen'], color: '#efe6d4', color2: '#e58aa6',
    fromOutfit: RESORT_FROM, build: resortShirt,
  },
];
