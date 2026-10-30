/**
 * Garments cut from a MakeHuman outfit: the outfit is fitted to the body and rigged like any
 * outfit, then only the pieces wanted (its UV islands, e.g. a suit's shirt but not its jeans) are
 * kept and retextured with a generated pattern on the outfit's own UVs, keeping its normal map
 * (folds and seams).
 */
import type { PolyMesh } from '../geometry';
import { compact } from '../geometry';
import type { Material } from '../mesh';
import { cm, REGION } from './body';
import { mat, type FittedOutfit, type GarmentStyle, type GCtx } from './kit';
import { Caster } from './project';
import { makePattern } from './textures';

export interface Island {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** The faces of an outfit whose UV island passes `keep` (judged by the island's UV bounds). */
export function keepIslands(m: PolyMesh, keep: (b: Island) => boolean): PolyMesh {
  const par = Int32Array.from({ length: m.uvs.length / 2 }, (_, i) => i);
  const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x])));
  const start: number[] = [];
  for (let f = 0, c = 0; f < m.faceSizes.length; c += m.faceSizes[f++]) {
    start.push(c);
    for (let k = 1; k < m.faceSizes[f]; k++) par[find(m.faceUVs[c + k])] = find(m.faceUVs[c]);
  }
  const box = new Map<number, Island>();
  for (let t = 0; t < par.length; t++) {
    const r = find(t), u = m.uvs[t * 2], v = m.uvs[t * 2 + 1];
    const b = box.get(r) ?? { u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity };
    box.set(r, { u0: Math.min(b.u0, u), u1: Math.max(b.u1, u), v0: Math.min(b.v0, v), v1: Math.max(b.v1, v) });
  }
  const ok = new Map([...box].map(([r, b]) => [r, keep(b)]));
  return compact(m, (f) => ok.get(find(m.faceUVs[start[f]])) ?? false);
}

/**
 * Body faces (in `regions`) under a piece cut from outfit `o`: every corner on the outfit's delete
 * list and within `reach` of the piece. (The delete list alone covers everything the outfit's
 * full set of pieces did, such as the chest under a suit's shirt front.)
 */
export function outfitCovers(g: GCtx, o: FittedOutfit, m: PolyMesh, regions: number[], reach = cm(3.5)): Uint8Array {
  const b = g.body, P = m.positions, cell = reach;
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < P.length; i += 3) {
    const k = key(P[i], P[i + 1], P[i + 2]);
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  }
  const del = new Uint8Array(b.info.length);
  for (const v of o.deleteVerts) del[v] = 1;
  // On the trunk the piece must lie right in front of (or behind) the skin, seen from the front or
  // back: an open front (a jacket's V) leaves the chest in it showing.
  const casts = { front: new Caster(m, null, () => true, 'front'), back: new Caster(m, null, () => true, 'back') };
  const near = new Uint8Array(b.info.length);
  for (let v = 0; v < near.length; v++) {
    if (!del[v] || !regions.includes(b.regions[v])) continue;
    const x = b.coords[v * 3], y = b.coords[v * 3 + 1], z = b.coords[v * 3 + 2];
    if (b.regions[v] === REGION.torso || b.regions[v] === REGION.hips) {
      const hit = (z >= b.L.torsoZ ? casts.front : casts.back).hit(x, y);
      if (hit && Math.abs(hit.p[2] - z) < reach + cm(1)) near[v] = 1;
      // The tops of the shoulders (away from the front's middle) face up: there the piece lies
      // above the skin, which front and back rays miss; it's hidden where the piece is close.
      const info = b.info[v];
      if (near[v] || info.tt < 0.85 || Math.abs(info.tth) < 0.6) continue;
    }
    const [cx, cy, cz] = [Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)];
    search: for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const i of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? [])
            if ((P[i] - x) ** 2 + (P[i + 1] - y) ** 2 + (P[i + 2] - z) ** 2 < reach * reach) {
              near[v] = 1;
              break search;
            }
  }
  const fv = g.faceVerts, out = new Uint8Array(fv.length / 4);
  for (let f = 0; f < out.length; f++) out[f] = near[fv[f * 4]] & near[fv[f * 4 + 1]] & near[fv[f * 4 + 2]] & near[fv[f * 4 + 3]];
  return out;
}

/** Upper-body regions a shirt covers. */
export const SHIRT_REGIONS = [REGION.torso, REGION.neck, REGION.upperarm, REGION.lowerarm];

/**
 * The outfit's surface in a generated pattern: `repeat` tiles of it across the outfit's UV atlas,
 * with the outfit's normal map.
 */
export function outfitCloth(g: GCtx, o: FittedOutfit, name: string, st: GarmentStyle, repeat: number, extra: Partial<Material> = {}): Material {
  const tex = g.texture(`${st.pattern}_${st.color}_${st.color2}_x${repeat}`, () => makePattern(st.pattern, st.color, st.color2, 1, repeat));
  return mat(name, { map: tex.map, alpha: false }, { normalMap: o.normalMap, roughness: 0.8, ...extra });
}
