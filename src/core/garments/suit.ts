/**
 * Suits: the jacket and trousers of MakeHuman's elegant suit 01 (padded shoulders, notch lapels
 * rolling to a single button, a collar set close round the back of the neck, sleeves with
 * buttoned cuffs, tailored trousers), cut from the suit and made up in the chosen cloth. The
 * suit's own shirt front, tie, collar and cuffs are left out, so any top shows in the V. The
 * trousers get pressed creases.
 */
import { compact, type PolyMesh } from '../geometry';
import { smoothstep, type Vec3 } from '../math';
import { cm, REGION } from './body';
import { crotchY, dressPts, knee, looseSkin, soleY } from './drape';
import { Caster, OUTWARD } from './project';
import { cord, hullRing, loftRings, merge, orientOutward, rayRing, v3 } from './ring';
import { hplane, isTrunk, mat, shell, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { keepIslands, outfitCloth, outfitCovers, type Island } from './outfit-cut';
import { shade, shirtTieTexture } from './textures';

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

// The tie on the suit's shirt front, in its texture (0..1, y down): traced from the outfit's own
// texture (the shirt front is the island at u 0.35..0.49, v 0.82..0.98).
const TIE: [number, number][] = ([[170, 278], [252, 268], [258, 335], [232, 415], [195, 515], [150, 600], [108, 668], [55, 672], [82, 560], [108, 450], [132, 380], [145, 322]] as const)
  .map(([x, y]): [number, number] => [(712 + x / 2) / 2048, (36 + y / 2) / 2048]);

/**
 * The suit's own shirt and tie (its shirt front, collar and cuffs), worn under the suit jacket: the
 * shirt in `color`, the tie in `color2`, plain or with repp stripes in the shirt's colour.
 */
function suitShirtTie(g: GCtx, st: GarmentStyle): GPart[] {
  const o = g.outfits?.[FROM];
  if (!o) return [];
  const mesh = keepIslands({ ...o.mesh, ref: Int32Array.from(o.ref) }, isShirt);
  const stripe = st.pattern === 'striped' ? st.color : null;
  const tex = g.texture(`shirt_tie_${st.color}_${st.color2}_${st.pattern}`, () => shirtTieTexture(2048, TIE, st.color, st.color2, stripe));
  // A backing in the shirt's colour on the skin under the shirt front, collar and knot: the outfit's
  // pieces leave small gaps between them (wider on a thick neck), which it fills.
  const r = shell(g, {
    covers: (v) => (isTrunk(v) && v.tt > 0.7 && Math.abs(v.tth) < 1.2) || (v.region === REGION.neck && v.t < 0.55),
    offset: cm(0.15), tile: 0.3, relax: 2,
  });
  return [
    { mesh, material: mat('Shirt and tie', tex, { roughness: 0.6, doubleSided: true }), hides: outfitCovers(g, o, mesh, [REGION.torso, REGION.neck]), smooth: true, collar: true },
    ...(r ? [{ mesh: r.mesh, material: mat('Shirt backing', null, { color: st.color, roughness: 0.7 }), hides: r.covered }] : []),
  ];
}

function suitJacket(g: GCtx, st: GarmentStyle): GPart[] {
  const o = g.outfits?.[FROM];
  if (!o) return [];
  const buttons = keepIslands(o.mesh, isButton);
  return [
    ...cut(g, st, 'Suit jacket', (i) => !isTrousers(i) && !isShirt(i) && !isButton(i), [REGION.torso, REGION.hips, REGION.neck, REGION.upperarm, REGION.lowerarm]),
    // Horn buttons a shade darker than the cloth.
    { mesh: buttons, material: mat('Suit buttons', null, { color: shade(st.color, 0.6), roughness: 0.35 }) },
  ];
}


/**
 * Overcoat: the suit jacket lengthened to just below the knee. A skirt hangs from the jacket's hem
 * (open at the front where the jacket opens), falling straight and never closer to the hips and
 * legs than 2 cm, flaring a little toward its own hem, and skinned loosely so it swings with both
 * legs.
 */
function overcoat(g: GCtx, st: GarmentStyle): GPart[] {
  const o = g.outfits?.[FROM];
  if (!o) return [];
  const b = g.body;
  const jacket = cut(g, st, 'Overcoat', (i) => !isTrousers(i) && !isShirt(i) && !isButton(i), [REGION.torso, REGION.hips, REGION.neck, REGION.upperarm, REGION.lowerarm]);
  if (!jacket.length) return [];
  const jm = jacket[0].mesh;
  // The jacket's outline by angle round the body (0 = front) and height (1 cm): its outermost
  // point, so the skirt can lie just over it; and its lowest point (the hem) per angle. The open
  // front has no jacket low down.
  let hipX = 0;
  for (const v of b.verts(REGION.hips)) hipX = Math.max(hipX, Math.abs(b.coords[v * 3]));
  const c: Vec3 = [0, 0, b.L.torsoZ], AB = 96;
  const angOf = (x: number, z: number) => Math.atan2(x - c[0], z - c[2]);
  const binOf = (a: number) => ((Math.floor((a / (2 * Math.PI) + 0.5) * AB) % AB) + AB) % AB;
  const outR = new Map<number, number>(), lowY = new Array<number>(AB).fill(Infinity);
  const P = jm.positions;
  for (let i = 0; i < P.length; i += 3) {
    const [x, y, z] = [P[i], P[i + 1], P[i + 2]];
    if (Math.abs(x) > hipX + cm(4) || y > b.L.hipY + cm(14)) continue;
    const k = binOf(angOf(x, z));
    lowY[k] = Math.min(lowY[k], y);
    const key = k * 10000 + Math.round(y / cm(1));
    outR.set(key, Math.max(outR.get(key) ?? 0, Math.hypot(x - c[0], z - c[2])));
  }
  const ys = lowY.filter((y) => Number.isFinite(y)).sort((p, q) => p - q);
  const hemY = ys[Math.floor(ys.length / 2)];
  const ok = lowY.map((y) => y < hemY + cm(5));
  // The front edges: walking from the front (bin AB/2) both ways to the first hem bins.
  let l = AB / 2, r = AB / 2;
  while (!ok[l % AB] && l < AB - 1) l++;
  while (!ok[(r + AB) % AB] && r > 1) r--;
  const aL = -Math.PI + ((l + 0.5) / AB) * 2 * Math.PI, aR = -Math.PI + ((r + AB + 0.5) / AB) * 2 * Math.PI;
  const jacketR = (a: number, y: number) => {
    const k = binOf(a), h = Math.round(y / cm(1));
    let m = 0;
    for (const dk of [-1, 0, 1]) for (const dh of [-1, 0, 1]) m = Math.max(m, outR.get(((k + dk + AB) % AB) * 10000 + h + dh) ?? 0);
    return m;
  };
  // The skirt: from 8 cm above the jacket's hem, lying flush on the jacket (it carries on its
  // surface, no ledge), down to just below the knee, falling straight, never closer to the hips and
  // legs than 2 cm.
  // (The jacket is cut at yCut; the skirt starts 2.5 cm above, over the jacket's remaining edge.)
  const yCut = hemY + cm(6), yTop = yCut + cm(2.5), yEnd = knee(b) - cm(6), src = dressPts(b);
  const hulls = new Map<number, Vec3[] | null>();
  const hullAt = (y: number) => {
    const k = Math.round(y / cm(1));
    if (!hulls.has(k)) hulls.set(k, hullRing(src, hplane(b, k * cm(1)), { slab: cm(2), samples: 96, offset: cm(2) }));
    return hulls.get(k)!;
  };
  const M = 72, R = 24, rows: Vec3[][] = [];
  let prevR: number[] = [];
  for (let i = 0; i <= R; i++) {
    const y = yTop + (yEnd - yTop) * (i / R), row: Vec3[] = [], rr: number[] = [];
    for (let j = 0; j <= M; j++) {
      const a = aL + ((aR - aL) * j) / M, d: Vec3 = [Math.sin(a), 0, Math.cos(a)];
      const h = hullAt(y), hr = h ? rayRing(h, [c[0], y, c[2]], d) ?? 0 : 0;
      const rad = Math.max(prevR[j] ?? 0, hr, jacketR(a, y) + cm(0.15));
      rr.push(rad);
      row.push([c[0] + d[0] * rad, y, c[2] + d[2] * rad]);
    }
    prevR = rr;
    rows.push(row);
  }
  // Even out the columns round the body (the hull's facets), keeping the front edges.
  for (const row of rows.slice(1))
    for (let it = 0; it < 3; it++) {
      const prev = row.map((q) => [...q] as Vec3);
      for (let jj = 1; jj < row.length - 1; jj++) row[jj] = v3.scale(v3.add(v3.add(prev[jj - 1], v3.scale(prev[jj], 2)), prev[jj + 1]), 0.25);
    }
  // The jacket under the skirt is cut away (it would poke through when walking).
  const ref = jm.ref;
  jacket[0] = {
    ...jacket[0],
    mesh: compact(jm, (_, cs) => !Array.from(cs).some((v) => P[v * 3 + 1] < yCut && Math.abs(P[v * 3]) < hipX + cm(4) && (!ref || ref[v] < 0 || b.regions[ref[v]] !== REGION.lowerarm))),
  };
  // UVs at the jacket's scale: one unit of its atlas is about 1.85 m of cloth.
  const skirt = orientOutward(loftRings(rows, { closedAround: false, tileU: 1.85, tileV: 1.85 }), [0, (yTop + yEnd) / 2, b.L.torsoZ]);
  // Edges: the hem and down each front.
  const edges = merge([cord(rows[R], cm(0.3), false, 6), cord(rows.map((r) => r[0]), cm(0.25), false, 6), cord(rows.map((r) => r[r.length - 1]), cm(0.25), false, 6)]);
  // The same cloth, without the jacket's fold map (it belongs to the jacket's own UVs).
  const cloth = { ...jacket[0].material, normalMap: undefined };
  const buttons = keepIslands(o.mesh, isButton);
  return [
    ...jacket,
    { mesh: skirt, material: cloth, skinAt: looseSkin(b, skirt, 0.3, 0.3) },
    ...(edges ? [{ mesh: edges, material: cloth, skinAt: looseSkin(b, edges, 0.3, 0.3) }] : []),
    { mesh: buttons, material: mat('Overcoat buttons', null, { color: '#151515', roughness: 0.3 }) },
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
  {
    id: 'suit_shirt_tie', label: 'Shirt & tie (under a suit jacket)', slot: 'top', patterns: ['solid', 'striped'], color: '#f4f4f2', color2: '#121214',
    colorLabels: ['Shirt', 'Tie'], setOnly: true, fromOutfit: FROM, build: suitShirtTie,
  },
  { id: 'suit_jacket', label: 'Suit jacket', slot: 'jacket', patterns: ['linen', 'suiting', 'solid'], color: '#e9b7c0', color2: '#f3d6db', fromOutfit: FROM, build: suitJacket },
  { id: 'overcoat', label: 'Long overcoat', slot: 'jacket', patterns: ['suiting', 'solid', 'linen'], color: '#141416', color2: '#26262c', fromOutfit: FROM, build: overcoat },
  { id: 'suit_trousers', label: 'Suit trousers', slot: 'bottom', patterns: ['linen', 'suiting', 'solid'], color: '#e9b7c0', color2: '#f3d6db', fromOutfit: FROM, build: suitTrousers },
];
