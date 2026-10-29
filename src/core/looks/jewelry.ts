/** Earrings: studs or hoops on both ear lobes (located on the base body, built on the morphed one). */
import type { Body } from '../garments/body';
import { REGION } from '../garments/body';
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import type { Material } from '../mesh';

export const EARRINGS = ['none', 'studs', 'small_hoops', 'big_hoops'] as const;
export type EarringId = (typeof EARRINGS)[number];
export const EARRING_LABELS: Record<EarringId, string> = { none: 'None', studs: 'Studs', small_hoops: 'Small hoops', big_hoops: 'Big hoops' };
export const METALS = { gold: '#e0b45a', silver: '#d9dbe0' } as const;
export type Metal = keyof typeof METALS;

export const metalMaterial = (m: Metal): Material => ({
  name: m === 'gold' ? 'Gold' : 'Silver', color: METALS[m], roughness: 0.22, metalness: 1, alpha: 'opaque', doubleSided: false,
});

const lobes = new WeakMap<Body, [number, number]>();
/** Base-mesh vertex at the bottom of each ear lobe (left, right). */
function lobeVerts(base: Body): [number, number] {
  let l = lobes.get(base);
  if (!l) {
    const target = (s: number): Vec3 => [s * 0.765, 6.9, 0.47];
    const best = [-1, -1], dist = [Infinity, Infinity];
    for (let v = 0; v < base.regions.length; v++) {
      if (base.regions[v] !== REGION.head) continue;
      for (const [i, s] of [[0, 1], [1, -1]] as const) {
        const t = target(s);
        const d = Math.hypot(base.coords[v * 3] - t[0], base.coords[v * 3 + 1] - t[1], base.coords[v * 3 + 2] - t[2]);
        if (d < dist[i]) [dist[i], best[i]] = [d, v];
      }
    }
    l = [best[0], best[1]];
    lobes.set(base, l);
  }
  return l;
}

const studs = new WeakMap<Body, [number, number]>();
/**
 * Base-mesh vertex where a stud goes on each lobe (left, right): on the lobe's outer face, about
 * 7 mm above its bottom edge (a stud pierces the middle of the lobe, not its rim).
 */
function studVerts(base: Body): [number, number] {
  let st = studs.get(base);
  if (!st) {
    st = lobeVerts(base).map((lv) => {
      const C = base.coords;
      const s = Math.sign(C[lv * 3]) || 1;
      const y = C[lv * 3 + 1] + 0.07, z = C[lv * 3 + 2];
      let best = lv, score = -Infinity;
      for (let v = 0; v < base.regions.length; v++) {
        if (base.regions[v] !== REGION.head) continue;
        const dy = C[v * 3 + 1] - y, dz = C[v * 3 + 2] - z;
        if (Math.hypot(dy, dz) > 0.035) continue;
        // The outermost point there: the lobe's outer face.
        const sc = s * C[v * 3] - Math.hypot(dy, dz) * 0.5;
        if (sc > score) [score, best] = [sc, v];
      }
      return best;
    }) as [number, number];
    studs.set(base, st);
  }
  return st;
}

function torus(c: Vec3, axisA: Vec3, axisB: Vec3, R: number, r: number, seg = 24, sides = 8): PolyMesh {
  // Ring in the plane (axisA, axisB); tube normal = cross for the minor circle.
  const n: Vec3 = [axisA[1] * axisB[2] - axisA[2] * axisB[1], axisA[2] * axisB[0] - axisA[0] * axisB[2], axisA[0] * axisB[1] - axisA[1] * axisB[0]];
  const pos: number[] = [], uv: number[] = [], fs: number[] = [], fv: number[] = [], fu: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const radial: Vec3 = [0, 1, 2].map((k) => axisA[k] * Math.cos(a) + axisB[k] * Math.sin(a)) as Vec3;
    for (let j = 0; j < sides; j++) {
      const b = (j / sides) * Math.PI * 2;
      for (let k = 0; k < 3; k++) pos.push(c[k] + radial[k] * (R + r * Math.cos(b)) + n[k] * r * Math.sin(b));
    }
  }
  for (let i = 0; i <= seg; i++) for (let j = 0; j <= sides; j++) uv.push(i / seg, j / sides);
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < sides; j++) {
      const i2 = (i + 1) % seg, j2 = (j + 1) % sides;
      fs.push(4);
      // (along the ring, then around the tube): outward normals.
      fv.push(i * sides + j, i2 * sides + j, i2 * sides + j2, i * sides + j2);
      fu.push(i * (sides + 1) + j, (i + 1) * (sides + 1) + j, (i + 1) * (sides + 1) + j + 1, i * (sides + 1) + j + 1);
    }
  return { positions: Float32Array.from(pos), faceSizes: Uint8Array.from(fs), faceVerts: Uint32Array.from(fv), faceUVs: Uint32Array.from(fu), uvs: Float32Array.from(uv) };
}

function sphere(c: Vec3, r: number, seg = 12, rings = 8): PolyMesh {
  const pos: number[] = [], uv: number[] = [], fs: number[] = [], fv: number[] = [], fu: number[] = [];
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j <= seg; j++) {
      const t = (i / rings) * Math.PI, p = (j / seg) * Math.PI * 2;
      pos.push(c[0] + r * Math.sin(t) * Math.cos(p), c[1] + r * Math.cos(t), c[2] + r * Math.sin(t) * Math.sin(p));
      uv.push(j / seg, 1 - i / rings);
    }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      fs.push(4);
      // Winding so normals face outward.
      fv.push(a, a + 1, a + seg + 2, a + seg + 1);
      fu.push(a, a + 1, a + seg + 2, a + seg + 1);
    }
  return { positions: Float32Array.from(pos), faceSizes: Uint8Array.from(fs), faceVerts: Uint32Array.from(fv), faceUVs: Uint32Array.from(fu), uvs: Float32Array.from(uv) };
}

/** Earring meshes (decimetres, morphed body space), or [] for none. */
export function earrings(id: EarringId, base: Body, coords: Float32Array, normals: Float32Array): PolyMesh[] {
  if (id === 'none') return [];
  if (id === 'studs')
    return studVerts(base).map((v) => {
      const p: Vec3 = [coords[v * 3], coords[v * 3 + 1], coords[v * 3 + 2]];
      const n: Vec3 = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]];
      const l = Math.hypot(...n) || 1;
      // Seated on the lobe: the ball's centre just over half its radius out from the skin.
      return sphere([p[0] + (n[0] / l) * 0.014, p[1] + (n[1] / l) * 0.014, p[2] + (n[2] / l) * 0.014], 0.022);
    });
  return lobeVerts(base).map((v) => {
    const p: Vec3 = [coords[v * 3], coords[v * 3 + 1], coords[v * 3 + 2]];
    const s = Math.sign(p[0]) || 1;
    const R = id === 'small_hoops' ? 0.075 : 0.17, r = id === 'small_hoops' ? 0.009 : 0.012;
    // Hoop hangs in a plane facing sideways (slightly turned forward), passing through the lobe.
    const A: Vec3 = [0, 1, 0];
    const Bv: Vec3 = [s * 0.25, 0, 0.97];
    const c: Vec3 = [p[0] + s * 0.015, p[1] - R + r * 1.5, p[2] - 0.005];
    return torus(c, A, Bv, R, r);
  });
}
