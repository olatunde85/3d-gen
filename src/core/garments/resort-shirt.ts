/** The fitted casualsuit03 shirt, shortened at the biceps with open, eased sleeve hems. */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION } from './body';
import { clamp, cloth, hplane, mat, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { keepIslands, outfitCloth, outfitCovers, type Island } from './outfit-cut';
import { Caster } from './project';
import { UVs } from './shell';
import { ellipsoid, frameOf, hullRing, loftRings, merge, orientOutward, v3 } from './ring';

const FROM = 'male_casualsuit03';
const isTrousers = (i: Island) => i.v1 > 0.95 && i.v0 < 0.45;
// Four UV islands: front and back of each original long sleeve.
const isSleeve = (i: Island) => (i.u0 > 0.52 && i.v1 < 0.45) || (i.u1 < 0.15 && i.v0 < 0.45);
// The source shirt's separate collar stand and fall, preserved as designed.
const isCollar = (i: Island) => i.v0 > 0.44 && i.v1 < 0.74 && ((i.u0 > 0.04 && i.u1 < 0.15) || (i.u0 > 0.43 && i.u1 < 0.48));
const SLEEVE_END = 0.55;

interface Corner { p: Vec3; uv: [number, number]; key: string; t: number }

export function cutLooseShortSleeves(g: GCtx, source: PolyMesh): { mesh: PolyMesh; hems: Vec3[][] } {
  const axes = new Map<number, { a: Vec3; dir: Vec3; len: number }>();
  for (const side of [-1, 1]) {
    const [a, b] = g.body.axis(REGION.upperarm, side), d = v3.sub(b, a), len = v3.len(d);
    axes.set(side, { a, dir: v3.scale(d, 1 / len), len });
  }
  const P = source.positions, U = source.uvs;
  const positions: number[] = [], faces: number[] = [], sizes: number[] = [], faceUVs: number[] = [];
  const uvs = new UVs(), vertex = new Map<string, number>();
  const hemKeys = new Map<number, Set<string>>([[-1, new Set()], [1, new Set()]]);
  const point = (v: number): Vec3 => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  const uv = (v: number): [number, number] => [U[v * 2], U[v * 2 + 1]];
  const tOf = (p: Vec3, side: number) => {
    const axis = axes.get(side)!;
    return v3.dot(v3.sub(p, axis.a), axis.dir) / axis.len;
  };
  const clipEdge = (a: Corner, b: Corner): Corner => {
    const f = clamp((SLEEVE_END - a.t) / (b.t - a.t), 0, 1);
    return { p: v3.lerp(a.p, b.p, f), uv: [a.uv[0] + (b.uv[0] - a.uv[0]) * f, a.uv[1] + (b.uv[1] - a.uv[1]) * f],
      key: `h${[a.key, b.key].sort().join('_')}`, t: SLEEVE_END };
  };
  const store = (q: Corner, side: number) => {
    let id = vertex.get(q.key);
    if (id !== undefined) return id;
    const axis = axes.get(side)!;
    const on = v3.madd(axis.a, axis.dir, axis.len * q.t);
    const r = v3.sub(q.p, on), radial = v3.sub(r, v3.scale(axis.dir, v3.dot(r, axis.dir)));
    // Keep the source shoulder seam joined to the torso. Ease starts below it and reaches
    // full width at the open cuff, rather than splitting the back of the armhole.
    const ease = cm(2.5) * Math.pow(clamp((q.t - 0.18) / (SLEEVE_END - 0.18), 0, 1), 1.7);
    const p = v3.madd(q.p, v3.norm(radial), ease);
    id = positions.length / 3;
    vertex.set(q.key, id);
    positions.push(...p);
    if (q.t === SLEEVE_END) hemKeys.get(side)!.add(q.key);
    return id;
  };
  for (let f = 0, c = 0; f < source.faceSizes.length; c += source.faceSizes[f++]) {
    const side = Math.sign(Array.from(source.faceVerts.subarray(c, c + source.faceSizes[f])).reduce((sum, v) => sum + P[v * 3], 0)) || 1;
    const polygon: Corner[] = [];
    for (let k = 0; k < source.faceSizes[f]; k++) {
      const v = source.faceVerts[c + k], t = source.faceUVs[c + k];
      polygon.push({ p: point(v), uv: uv(t), key: `v${v}`, t: tOf(point(v), side) });
    }
    const kept: Corner[] = [];
    for (let k = 0; k < polygon.length; k++) {
      const a = polygon[k], b = polygon[(k + 1) % polygon.length];
      if (a.t <= SLEEVE_END) kept.push(a);
      if ((a.t <= SLEEVE_END) !== (b.t <= SLEEVE_END)) kept.push(clipEdge(a, b));
    }
    if (kept.length < 3) continue;
    sizes.push(kept.length);
    for (const q of kept) {
      faces.push(store(q, side));
      faceUVs.push(uvs.add(...q.uv));
    }
  }
  const hems: Vec3[][] = [];
  for (const side of [-1, 1]) {
    const axis = axes.get(side)!;
    const center = v3.madd(axis.a, axis.dir, axis.len * SLEEVE_END);
    const front = v3.norm(v3.sub([0, 0, 1], v3.scale(axis.dir, axis.dir[2])));
    const cross = v3.cross(axis.dir, front);
    const ids = [...hemKeys.get(side)!].map(key => vertex.get(key)!).filter(id => id !== undefined);
    ids.sort((a, b) => {
      const angle = (id: number) => {
        const p: Vec3 = [positions[id * 3], positions[id * 3 + 1], positions[id * 3 + 2]], d = v3.sub(p, center);
        return Math.atan2(v3.dot(d, cross), v3.dot(d, front));
      };
      return angle(a) - angle(b);
    });
    if (ids.length < 8) continue;
    // Relax the cut contour without shrinking its radius, as with the loose shorts hems.
    let ring = ids.map(id => [positions[id * 3], positions[id * 3 + 1], positions[id * 3 + 2]] as Vec3);
    const radius = ring.reduce((sum, p) => sum + v3.len(v3.sub(p, center)) / ring.length, 0);
    for (let pass = 0; pass < 8; pass++) ring = ring.map((p, i) => v3.add(v3.scale(p, 0.5), v3.scale(v3.add(ring[(i + ring.length - 1) % ring.length], ring[(i + 1) % ring.length]), 0.25)));
    ring = ring.map(p => v3.madd(center, v3.norm(v3.sub(p, center)), radius));
    ring.forEach((p, k) => positions.splice(ids[k] * 3, 3, ...p));
    hems.push(ring);
  }
  return { mesh: { positions: Float32Array.from(positions), faceSizes: Uint8Array.from(sizes), faceVerts: Uint32Array.from(faces), faceUVs: Uint32Array.from(faceUVs), uvs: Float32Array.from(uvs.data) }, hems };
}

/** Give the untucked shirt enough room over suit trousers without shifting its collar or shoulders. */
function clearTrouserWaist(g: GCtx, mesh: PolyMesh): PolyMesh {
  const b = g.body, p = new Float32Array(mesh.positions);
  const height = b.L.neckY - b.L.hipY;
  for (let i = 0; i < p.length; i += 3) {
    const t = (p[i + 1] - b.L.hipY) / height;
    const x = p[i], z = p[i + 2] - b.L.torsoZ;
    const r = Math.hypot(x, z);
    if (r < cm(1)) continue;
    const k = clamp((0.42 - t) / 0.32, 0, 1), ease = cm(2.0) * k * k * (3 - 2 * k);
    p[i] += x / r * ease;
    p[i + 2] += z / r * ease;
  }
  return { ...mesh, positions: p };
}

/** A continuous lower edge masks the source shirt's small slits over a higher suit waistband. */
function continuousLowerHem(g: GCtx, body: PolyMesh, st: GarmentStyle): GPart[] {
  const P = body.positions, b = g.body;
  let minY = Infinity;
  const surface: Vec3[] = [];
  for (let i = 0; i < P.length; i += 3) {
    minY = Math.min(minY, P[i + 1]);
    surface.push([P[i], P[i + 1], P[i + 2]]);
  }
  const topY = minY + cm(5.5), bottomY = minY - cm(0.2);
  const top = hullRing(surface, hplane(b, topY), { slab: cm(1.5), samples: 56, offset: -cm(0.15) });
  if (!top) return [];
  const bottom = top.map(p => [p[0] * 1.025, bottomY, b.L.torsoZ + (p[2] - b.L.torsoZ) * 1.025] as Vec3);
  const inside = bottom.map(p => [p[0] * 0.985, bottomY + cm(0.1), b.L.torsoZ + (p[2] - b.L.torsoZ) * 0.985] as Vec3);
  const mesh = orientOutward(loftRings([top, bottom, inside], { closedAround: true, tileU: 0.25, tileV: 0.1 }),
    [0, (topY + bottomY) / 2, b.L.torsoZ]);
  const skinAt = new Float32Array(mesh.positions);
  for (let i = 1; i < skinAt.length; i += 3) skinAt[i] = topY;
  return [{ mesh, material: cloth(g, 'Resort shirt continuous hem', st, { roughness: 0.86, doubleSided: true }), skinAt, smooth: true }];
}

/** Small facings bridge the source asset's front collar to its shirt fronts on either side of the V. */
function collarFacings(g: GCtx, body: PolyMesh, color: string): GPart[] {
  const shirt = new Caster(body, null, () => true, 'front');
  const skin = new Caster(g.body, g.faceVerts, () => true, 'front');
  const at = (x: number, t: number): Vec3 => {
    const y = torsoY(g.body, t);
    const front = shirt.hit(x, y), beneath = skin.hit(x, y);
    const z = Math.max(front?.p[2] ?? -Infinity, beneath?.p[2] ?? -Infinity);
    return [x, y, (Number.isFinite(z) ? z : g.body.L.torsoZ + cm(9)) + cm(0.3)];
  };
  return [-1, 1].map(side => {
    const rows: Vec3[][] = [
      [at(side * cm(3.1), 0.83), at(side * cm(5.6), 0.83)],
      [at(side * cm(3.4), 0.89), at(side * cm(7.1), 0.89)],
      [at(side * cm(4.8), 0.96), at(side * cm(6.1), 0.96)],
    ];
    const mesh = orientOutward(loftRings(rows, { closedAround: false, tileU: 0.12, tileV: 0.12 }),
      [0, torsoY(g.body, 0.9), g.body.L.torsoZ]);
    return { mesh, material: mat('Resort shirt collar facing', null, { color, roughness: 0.86, doubleSided: true }), collar: true, smooth: true };
  });
}

function buildResortShirt(g: GCtx, st: GarmentStyle): GPart[] {
  const o = g.outfits?.[FROM];
  if (!o) return [];
  const src = { ...o.mesh, ref: Int32Array.from(o.ref) };
  let body = keepIslands(src, i => !isTrousers(i) && !isSleeve(i) && !isCollar(i));
  if (g.layered.bottomId === 'suit_trousers') body = clearTrouserWaist(g, body);
  const collar = keepIslands(src, isCollar);
  const sleeves = cutLooseShortSleeves(g, keepIslands(src, isSleeve));
  const fabric = outfitCloth(g, o, 'Short-sleeve resort shirt', st, 6, { roughness: 0.86, doubleSided: true });
  const sleeveMaterial = { ...fabric, name: 'Resort shirt short loose sleeves' };
  const hides = outfitCovers(g, o, body, [REGION.torso, REGION.hips, REGION.neck]);
  const armHides = outfitCovers(g, o, sleeves.mesh, [REGION.upperarm], cm(5));
  for (let f = 0; f < armHides.length; f++) {
    if (!armHides[f]) continue;
    const q = g.faceVerts.subarray(f * 4, f * 4 + 4);
    if ([...q].every(v => g.body.info[v].region === REGION.upperarm && g.body.info[v].t > 0.4)) armHides[f] = 0;
  }
  const hems = sleeves.hems.map(ring => {
    const center = ring.reduce<Vec3>((sum, p) => v3.add(sum, v3.scale(p, 1 / ring.length)), [0, 0, 0]);
    const inset = ring.map(p => v3.madd(p, v3.norm(v3.sub(center, p)), cm(0.28)));
    return orientOutward(loftRings([ring, inset], { closedAround: true, tileU: 0.24, tileV: 0.04 }), center);
  });
  // The source shirt has its own front facings; add discrete light buttons over its print.
  const front = new Caster(body, null, () => true, 'front'), buttons: PolyMesh[] = [];
  for (let i = 0; i < 5; i++) {
    const hit = front.hit(cm(0.9), torsoY(g.body, 0.75) - i * cm(7));
    if (!hit) continue;
    buttons.push(ellipsoid(frameOf(v3.madd(hit.p, [0, 0, 1], cm(0.18)), [0, 0, 1], [0, 1, 0]), [cm(0.55), cm(0.55), cm(0.18)], [0.5, 0.5], 10, 5));
  }
  const hemMesh = merge(hems), buttonMesh = merge(buttons);
  return [
    { mesh: body, material: fabric, hides, smooth: true },
    ...(g.layered.bottomId === 'suit_trousers' ? continuousLowerHem(g, body, st) : []),
    { mesh: sleeves.mesh, material: sleeveMaterial, hides: armHides, smooth: true },
    ...(hemMesh ? [{ mesh: hemMesh, material: { ...fabric, name: 'Resort shirt open sleeve hems' }, smooth: true }] : []),
    ...collarFacings(g, body, st.color),
    { mesh: collar, material: { ...fabric, name: 'Resort shirt source collar' }, collar: true, smooth: true },
    ...(buttonMesh ? [{ mesh: buttonMesh, material: mat('Resort shirt white buttons', null, { color: '#f5f3e9', roughness: 0.4 }) }] : []),
  ];
}

export const RESORT_SHIRT: GarmentDef = {
  id: 'tropical_short_shirt', label: 'Short-sleeve resort shirt', slot: 'top',
  patterns: ['resort_geo', 'tropical', 'linen', 'solid'], color: '#f8f7f1', color2: '#3c4d2a',
  colorLabels: ['Fabric', 'Print'], fromOutfit: FROM, build: buildResortShirt,
};
