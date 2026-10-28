import type { PolyMesh } from './geometry';
import { vertexNormals } from './geometry';

export interface Material {
  name: string;
  /** sRGB hex colour; multiplies the texture when there is one. */
  color: string;
  roughness: number;
  metalness: number;
  /** Texture file names (see AssetLibrary.texture). */
  map?: string;
  normalMap?: string;
  /** glTF metallic-roughness texture (roughness in G). Where it's used, it replaces `roughness`, which stays as the average for formats without it. */
  roughnessMap?: string;
  alpha: 'opaque' | 'mask' | 'blend';
  doubleSided: boolean;
  /** sRGB hex glow colour (neon, visors). */
  emissive?: string;
  /** 0..1, for alpha 'blend' materials without a texture. */
  opacity?: number;
}

export interface MeshGroup {
  material: number;
  /** Triangle list (for GLB / real-time rendering). */
  indices: Uint32Array;
  /** Original polygons (mostly quads) for FBX / OBJ: sizes + flattened vertex indices. */
  polySizes: Uint8Array;
  polyIndices: Uint32Array;
}

/**
 * Format-neutral mesh. Units are metres, +Y up, character faces +Z, feet on y = 0.
 * Vertices are split at UV seams, so every vertex has exactly one uv.
 */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  groups: MeshGroup[];
  materials: Material[];
  /** Skinning (present when rigged): 4 bone indices + 4 weights per vertex. */
  joints?: Uint16Array;
  weights?: Float32Array;
  /** Facial blend shapes: names, per-vertex offsets (vertex count * 3 each) and resting weights. */
  morphs?: { names: string[]; deltas: Float32Array[]; defaults: number[] };
}

/** Morph offsets moved by more than this (metres) count as changed (for sparse exports): 0.05 mm,
 * far below anything visible, keeps the many barely-moved vertices out of the files. */
export const MORPH_EPSILON = 5e-5;

/** Positions with the morphs applied at the given weights (e.g. to bake an expression into an OBJ). */
export function morphedPositions(m: MeshData, weights?: number[]): Float32Array {
  const out = Float32Array.from(m.positions);
  if (!m.morphs) return out;
  const w = weights ?? m.morphs.defaults;
  m.morphs.deltas.forEach((d, s) => {
    if (!w[s]) return;
    for (let i = 0; i < out.length; i++) out[i] += d[i] * w[s];
  });
  return out;
}

export function triangleCount(m: MeshData): number {
  return m.groups.reduce((s, g) => s + g.indices.length / 3, 0);
}

/** Accumulates parts (each a PolyMesh + material) into one MeshData. */
export class MeshAssembler {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  private jnt: number[] = [];
  private wgt: number[] = [];
  private skinned = true;
  private groups: MeshGroup[] = [];
  private morph: number[][];
  readonly materials: Material[] = [];

  /** `morphs`: blend-shape names and resting weights; parts without offsets get zeros. */
  constructor(private morphs?: { names: string[]; defaults: number[] }) {
    this.morph = (morphs?.names ?? []).map(() => []);
  }

  add(part: PolyMesh, material: Material): void {
    const N = vertexNormals(part);
    if (!part.skin) this.skinned = false;
    const base = this.pos.length / 3;
    const key = new Map<number, number>(); // (vertex, uv) -> output index
    const nUV = part.uvs.length / 2;
    const polyIdx: number[] = [];
    const tris: number[] = [];
    for (let f = 0, c = 0; f < part.faceSizes.length; f++) {
      const n = part.faceSizes[f];
      const out: number[] = [];
      for (let k = 0; k < n; k++) {
        const v = part.faceVerts[c + k], t = part.faceUVs[c + k];
        const id = v * nUV + t;
        let o = key.get(id);
        if (o === undefined) {
          o = base + key.size;
          key.set(id, o);
          this.pos.push(part.positions[v * 3], part.positions[v * 3 + 1], part.positions[v * 3 + 2]);
          this.nrm.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
          this.uv.push(part.uvs[t * 2], part.uvs[t * 2 + 1]);
          this.morph.forEach((arr, s) => {
            const d = part.morphs?.[s];
            if (d) arr.push(d[v * 3], d[v * 3 + 1], d[v * 3 + 2]);
            else arr.push(0, 0, 0);
          });
          if (part.skin) for (let k = 0; k < 4; k++) {
            this.jnt.push(part.skin.j[v * 4 + k]);
            this.wgt.push(part.skin.w[v * 4 + k]);
          }
        }
        out.push(o);
      }
      polyIdx.push(...out);
      for (let k = 1; k < n - 1; k++) tris.push(out[0], out[k], out[k + 1]);
      c += n;
    }
    this.materials.push(material);
    this.groups.push({
      material: this.materials.length - 1,
      indices: Uint32Array.from(tris),
      polySizes: Uint8Array.from(part.faceSizes),
      polyIndices: Uint32Array.from(polyIdx),
    });
  }

  build(): MeshData {
    return {
      positions: Float32Array.from(this.pos),
      normals: Float32Array.from(this.nrm),
      uvs: Float32Array.from(this.uv),
      groups: this.groups,
      materials: this.materials,
      ...(this.skinned && this.jnt.length ? { joints: Uint16Array.from(this.jnt), weights: Float32Array.from(this.wgt) } : {}),
      ...(this.morphs ? { morphs: { names: this.morphs.names, defaults: this.morphs.defaults, deltas: this.morph.map((a) => Float32Array.from(a)) } } : {}),
    };
  }
}

/** A copy of `m` with only the groups `keep` accepts (vertices compacted, materials renumbered). */
export function pickGroups(m: MeshData, keep: (group: number) => boolean): MeshData {
  const remap = new Int32Array(m.positions.length / 3).fill(-1);
  const kept = m.groups.filter((_, i) => keep(i));
  let n = 0;
  for (const g of kept) for (const v of g.indices) if (remap[v] < 0) remap[v] = n++;
  for (const g of kept) for (const v of g.polyIndices) if (remap[v] < 0) remap[v] = n++;
  const take = <T extends Float32Array | Uint16Array>(src: T, k: number): T => {
    const out = new (src.constructor as new (n: number) => T)(n * k);
    for (let v = 0; v < remap.length; v++) if (remap[v] >= 0) for (let c = 0; c < k; c++) out[remap[v] * k + c] = src[v * k + c];
    return out;
  };
  return {
    positions: take(m.positions, 3),
    normals: take(m.normals, 3),
    uvs: take(m.uvs, 2),
    materials: kept.map((g) => m.materials[g.material]),
    groups: kept.map((g, i) => ({
      material: i,
      indices: g.indices.map((v) => remap[v]),
      polySizes: g.polySizes,
      polyIndices: g.polyIndices.map((v) => remap[v]),
    })),
    ...(m.joints && m.weights ? { joints: take(m.joints, 4), weights: take(m.weights, 4) } : {}),
    ...(m.morphs ? { morphs: { ...m.morphs, deltas: m.morphs.deltas.map((d) => take(d, 3)) } } : {}),
  };
}
