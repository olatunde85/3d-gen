/**
 * Skin roughness map (glTF metallic-roughness layout: roughness in G, metalness 0 in B).
 * Skin isn't evenly shiny: the lips are smooth and slightly glossy, the nose and forehead
 * (the T-zone) a little shinier than the cheeks, with soft transitions and fine variation.
 * Areas are found from the face shapes: the vertices a shape moves most are the ones it is about
 * (pucker = lips, sneer = nose, inner brow raise = forehead). Base-mesh UVs are the same for
 * every character, so the map is built once per library and shared.
 */
import type { AssetLibrary } from './assets';
import { faceShapeDelta } from './face';
import { encodePNG } from './garments/textures';
import { scalpMask } from './looks/hair';
import { DEFAULT_PARAMS } from './params';

export const SKIN_ROUGH = 'skin_roughness.png';
const SIZE = 512;
const BASE = 0.68, LIPS = 0.5, NOSE = 0.52, FOREHEAD = 0.58, SCALP = 0.85;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Per-vertex movement of a face shape, 0..1 relative to its largest movement. */
function moved(lib: AssetLibrary, shape: string): Float32Array {
  const d = faceShapeDelta(lib, { ...DEFAULT_PARAMS, african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3 }, shape);
  const n = d.length / 3, out = new Float32Array(n);
  let max = 0;
  for (let v = 0; v < n; v++) max = Math.max(max, (out[v] = Math.hypot(d[v * 3], d[v * 3 + 1], d[v * 3 + 2])));
  for (let v = 0; v < n; v++) out[v] /= max || 1;
  return out;
}

export function skinRoughness(lib: AssetLibrary): string {
  if (lib.hasTexture(SKIN_ROUGH)) return SKIN_ROUGH;
  const lips = moved(lib, 'mouthPucker'), nose = moved(lib, 'noseSneerLeft'), noseR = moved(lib, 'noseSneerRight'), brow = moved(lib, 'browInnerUp');
  const n = lips.length;
  const rough = new Float32Array(n);
  const B = lib.base.arrays.positions as Float32Array;
  // Base-mesh normals: the inner lips (facing into the mouth) and the corners stay matte, so they
  // don't catch bright highlights when the mouth opens.
  const fvN = lib.base.arrays.faceVerts as Uint32Array;
  const nz = new Float32Array(n * 3);
  for (let f = 0; f < fvN.length / 4; f++) {
    const c = [0, 1, 2, 3].map((k) => fvN[f * 4 + k]);
    const P = c.map((v) => [B[v * 3], B[v * 3 + 1], B[v * 3 + 2]]);
    const e1 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]], e2 = [P[3][0] - P[1][0], P[3][1] - P[1][1], P[3][2] - P[1][2]];
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of c) for (let k = 0; k < 3; k++) nz[v * 3 + k] += nn[k];
  }
  const facing = (v: number) => nz[v * 3 + 2] / (Math.hypot(nz[v * 3], nz[v * 3 + 1], nz[v * 3 + 2]) || 1);
  for (let v = 0; v < n; v++) {
    let r = BASE;
    // Scalp: matte (under hair, or shaved).
    r += (SCALP - r) * scalpMask([B[v * 3], B[v * 3 + 1], B[v * 3 + 2]]);
    r += (FOREHEAD - BASE) * smooth(0.15, 0.5, brow[v]);
    r += (NOSE - r) * smooth(0.2, 0.55, Math.max(nose[v], noseR[v]));
    const lipGloss = smooth(0.35, 0.7, lips[v]) * smooth(0.35, 0.75, facing(v)) * (1 - smooth(0.13, 0.19, Math.abs(B[v * 3])));
    r += (LIPS - r) * lipGloss;
    rough[v] = r;
  }
  // Rasterize the per-vertex values into UV space.
  const fv = lib.base.arrays.faceVerts as Uint32Array, fuv = lib.base.arrays.faceUVs as Uint32Array, uvs = lib.base.arrays.uvs as Float32Array;
  const val = new Float32Array(SIZE * SIZE).fill(-1);
  for (let f = 0; f < fv.length / 4; f++)
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      const U = tri.map((k) => [uvs[fuv[f * 4 + k] * 2] * SIZE, (1 - uvs[fuv[f * 4 + k] * 2 + 1]) * SIZE]);
      const R = tri.map((k) => rough[fv[f * 4 + k]]);
      const d = (U[1][1] - U[2][1]) * (U[0][0] - U[2][0]) + (U[2][0] - U[1][0]) * (U[0][1] - U[2][1]);
      if (Math.abs(d) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(U[0][0], U[1][0], U[2][0]))), x1 = Math.min(SIZE - 1, Math.ceil(Math.max(U[0][0], U[1][0], U[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(U[0][1], U[1][1], U[2][1]))), y1 = Math.min(SIZE - 1, Math.ceil(Math.max(U[0][1], U[1][1], U[2][1])));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5, py = y + 0.5;
          const a = ((U[1][1] - U[2][1]) * (px - U[2][0]) + (U[2][0] - U[1][0]) * (py - U[2][1])) / d;
          const b = ((U[2][1] - U[0][1]) * (px - U[2][0]) + (U[0][0] - U[2][0]) * (py - U[2][1])) / d;
          const c = 1 - a - b;
          if (a < -0.02 || b < -0.02 || c < -0.02) continue;
          val[y * SIZE + x] = a * R[0] + b * R[1] + c * R[2];
        }
    }
  // Fill the gaps between UV islands with the base value (no dark seams when mip-mapped).
  const px = new Uint8Array(SIZE * SIZE * 4);
  // Smooth variation (oilier and drier patches, +-0.03): bilinear value noise on a coarse lattice,
  // so the map compresses well.
  const G = 32, lat = new Float32Array(G * G);
  let h = 7;
  for (let k = 0; k < lat.length; k++) {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) | 0;
    lat[k] = (h >>> 0) / 4294967296 - 0.5;
  }
  const noise = (x: number, y: number) => {
    const fx = (x / SIZE) * G, fy = (y / SIZE) * G;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const at = (a: number, b: number) => lat[(b % G) * G + (a % G)];
    return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
  };
  for (let i = 0; i < SIZE * SIZE; i++) {
    const r = (val[i] < 0 ? BASE : val[i]) + noise(i % SIZE, Math.floor(i / SIZE)) * 0.06;
    px[i * 4] = 255;
    px[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, r)) * 255);
    px[i * 4 + 2] = 0;
    px[i * 4 + 3] = 255;
  }
  lib.registerTexture(SKIN_ROUGH, encodePNG(SIZE, SIZE, px, false));
  return SKIN_ROUGH;
}
