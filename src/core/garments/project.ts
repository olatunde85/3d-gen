/**
 * Projected patches: garment pieces designed as a flat grid (front view, back view or from below)
 * and laid onto the body by casting rays along an axis. Edges follow the designed outline exactly,
 * at any resolution, instead of the base mesh's faces (see shell.ts for fitted, body-face garments).
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, type Body } from './body';
import { UVs } from './shell';

/** Axis the rays travel along: 'front' casts toward -Z (hits the front), 'back' toward +Z, 'below' toward +Y, 'above' toward -Y. */
export type CastDir = 'front' | 'back' | 'below' | 'above';

interface Tri {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  /** Body vertices of the corners (for the hidden-skin mask) and its face index. */
  face: number;
}

/** Casts rays at a set of body faces along one axis; a uniform grid over the other two axes. */
export class Caster {
  private cells = new Map<string, number[]>();
  private tris: Tri[] = [];
  private readonly u: 0 | 1 | 2;
  private readonly w: 0 | 1 | 2;
  private readonly d: 0 | 1 | 2;
  private readonly sign: number;
  private readonly cell = cm(1.5);

  constructor(body: Body, faceVerts: Uint32Array, keep: (face: number) => boolean, readonly dir: CastDir) {
    [this.u, this.w, this.d] = dir === 'below' || dir === 'above' ? [0, 2, 1] : [0, 1, 2];
    // Rays come from the far side: front rays start at +Z, back at -Z, below at -Y, above at +Y.
    this.sign = dir === 'front' || dir === 'above' ? 1 : -1;
    const P = (v: number): Vec3 => body.p(v);
    for (let f = 0; f < faceVerts.length / 4; f++) {
      if (!keep(f)) continue;
      const q = [0, 1, 2, 3].map((k) => P(faceVerts[f * 4 + k]));
      for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]]) {
        const t: Tri = { a: q[i], b: q[j], c: q[k], face: f };
        const id = this.tris.push(t) - 1;
        const lo = [0, 1].map((n) => Math.floor(Math.min(t.a[n ? this.w : this.u], t.b[n ? this.w : this.u], t.c[n ? this.w : this.u]) / this.cell));
        const hi = [0, 1].map((n) => Math.floor(Math.max(t.a[n ? this.w : this.u], t.b[n ? this.w : this.u], t.c[n ? this.w : this.u]) / this.cell));
        for (let x = lo[0]; x <= hi[0]; x++)
          for (let y = lo[1]; y <= hi[1]; y++) {
            const key = `${x},${y}`;
            const l = this.cells.get(key);
            if (l) l.push(id);
            else this.cells.set(key, [id]);
          }
      }
    }
  }

  /**
   * First surface hit for the ray through (a, b) on the two cross axes (x, y for front/back;
   * x, z for below). Returns the point, the face's normal (toward the ray's origin side) and the face.
   */
  hit(a: number, b: number): { p: Vec3; n: Vec3; face: number } | null {
    const list = this.cells.get(`${Math.floor(a / this.cell)},${Math.floor(b / this.cell)}`);
    if (!list) return null;
    let best: { p: Vec3; n: Vec3; face: number } | null = null, bestD = -Infinity;
    for (const id of list) {
      const t = this.tris[id];
      // Barycentrics in the cross plane.
      const ax = t.a[this.u], ay = t.a[this.w], bx = t.b[this.u], by = t.b[this.w], cx = t.c[this.u], cy = t.c[this.w];
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-12) continue;
      const l1 = ((by - cy) * (a - cx) + (cx - bx) * (b - cy)) / den;
      const l2 = ((cy - ay) * (a - cx) + (ax - cx) * (b - cy)) / den;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const depth = l1 * t.a[this.d] + l2 * t.b[this.d] + l3 * t.c[this.d];
      // The nearest surface to the ray's origin: largest Z for front rays, smallest otherwise.
      const score = depth * this.sign;
      if (score > bestD) {
        bestD = score;
        const p: Vec3 = [0, 0, 0];
        p[this.u] = a;
        p[this.w] = b;
        p[this.d] = depth;
        const e1 = [t.b[0] - t.a[0], t.b[1] - t.a[1], t.b[2] - t.a[2]], e2 = [t.c[0] - t.a[0], t.c[1] - t.a[1], t.c[2] - t.a[2]];
        let n: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const l = Math.hypot(...n) || 1;
        n = [n[0] / l, n[1] / l, n[2] / l];
        // Face the ray's origin.
        const toward = this.dir === 'front' ? n[2] : this.dir === 'back' ? -n[2] : this.dir === 'above' ? n[1] : -n[1];
        if (toward < 0) n = [-n[0], -n[1], -n[2]];
        best = { p, n, face: t.face };
      }
    }
    return best;
  }
}


/** Outward direction (away from the body) for each cast direction. */
export const OUTWARD: Record<CastDir, Vec3> = { front: [0, 0, 1], back: [0, 0, -1], below: [0, -1, 0], above: [0, 1, 0] };

/**
 * Smooth a grid of surface points a little (cloth bridges small dips; edges stay on the outline;
 * nothing sinks below the skin) and lift it off the skin along its normals (turned to face
 * `outward`) by `offset`.
 */
export function liftGrid(grid: Vec3[][], offset: number, outward: Vec3, smooth = 2): Vec3[][] {
  const R = grid.length, C = grid[0].length;
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let g = grid.map((row) => row.map((p) => [...p] as Vec3));
  // Smooth the outline along itself (rays that stepped round the body's side leave notches).
  if (smooth) {
    const loop: [number, number][] = [];
    for (let j = 0; j < C; j++) loop.push([0, j]);
    for (let i = 1; i < R; i++) loop.push([i, C - 1]);
    for (let j = C - 2; j >= 0; j--) loop.push([R - 1, j]);
    for (let i = R - 2; i > 0; i--) loop.push([i, 0]);
    const corners = new Set(['0,0', `0,${C - 1}`, `${R - 1},${C - 1}`, `${R - 1},0`]);
    for (let it = 0; it < 6; it++) {
      const pts = loop.map(([i, j]) => [...g[i][j]] as Vec3);
      loop.forEach(([i, j], k) => {
        if (corners.has(`${i},${j}`)) return;
        const a = pts[(k - 1 + pts.length) % pts.length], b = pts[(k + 1) % pts.length];
        g[i][j] = [0, 1, 2].map((d) => pts[k][d] * 0.5 + (a[d] + b[d]) * 0.25) as Vec3;
      });
    }
  }
  for (let it = 0; it < smooth; it++) {
    const next = g.map((row) => row.map((p) => [...p] as Vec3));
    for (let i = 1; i < R - 1; i++)
      for (let j = 1; j < C - 1; j++) {
        const q = [0, 1, 2].map((k) => g[i][j][k] * 0.5 + (g[i - 1][j][k] + g[i + 1][j][k] + g[i][j - 1][k] + g[i][j + 1][k]) * 0.125) as Vec3;
        // Never below the skin: push back out along the outward axis.
        const o = grid[i][j];
        const under = dot([o[0] - q[0], o[1] - q[1], o[2] - q[2]], outward);
        next[i][j] = under > 0 ? [q[0] + outward[0] * under, q[1] + outward[1] * under, q[2] + outward[2] * under] : q;
      }
    g = next;
  }
  const at = (i: number, j: number) => g[Math.max(0, Math.min(R - 1, i))][Math.max(0, Math.min(C - 1, j))];
  return g.map((row, i) =>
    row.map((p, j) => {
      const du = at(i, j + 1).map((x, k) => x - at(i, j - 1)[k]), dv = at(i + 1, j).map((x, k) => x - at(i - 1, j)[k]);
      let n: Vec3 = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      const len = Math.hypot(...n);
      // Degenerate spots (a narrow tip, where neighbours nearly coincide) use the outward axis.
      n = len < 1e-9 ? outward : (() => {
        const u: Vec3 = [n[0] / len, n[1] / len, n[2] / len];
        const s = dot(u, outward) < 0 ? -1 : 1;
        return [u[0] * s, u[1] * s, u[2] * s] as Vec3;
      })();
      // Never lift sideways or backward by more than the surface really turns away.
      if (dot(n, outward) < 0.25) n = (([a, b, c]) => { const l = Math.hypot(a, b, c) || 1; return [a / l, b / l, c / l] as Vec3; })([n[0] + outward[0], n[1] + outward[1], n[2] + outward[2]]);
      return [p[0] + n[0] * offset, p[1] + n[1] * offset, p[2] + n[2] * offset] as Vec3;
    }),
  );
}

/** A quad mesh over a grid of points, with arc-length UVs tiling every `tile` metres. */
export function gridMesh(g: Vec3[][], tile: number): PolyMesh {
  const R = g.length, C = g[0].length;
  const uvs = new UVs();
  const uAt: number[][] = [], vAt: number[][] = [];
  for (let i = 0; i < R; i++) {
    uAt.push([0]);
    for (let j = 1; j < C; j++) uAt[i].push(uAt[i][j - 1] + Math.hypot(...g[i][j].map((x, k) => x - g[i][j - 1][k])) * 0.1);
  }
  for (let j = 0; j < C; j++) {
    vAt.push([0]);
    for (let i = 1; i < R; i++) vAt[j].push(vAt[j][i - 1] + Math.hypot(...g[i][j].map((x, k) => x - g[i - 1][j][k])) * 0.1);
  }
  const pos: number[] = [], uvIdx: number[] = [];
  for (let i = 0; i < R; i++)
    for (let j = 0; j < C; j++) {
      pos.push(...g[i][j]);
      uvIdx.push(uvs.add(uAt[i][j] / tile, vAt[j][i] / tile));
    }
  const sizes: number[] = [], fv: number[] = [], fu: number[] = [];
  for (let i = 0; i < R - 1; i++)
    for (let j = 0; j < C - 1; j++) {
      const q = [i * C + j, i * C + j + 1, (i + 1) * C + j + 1, (i + 1) * C + j];
      sizes.push(4);
      fv.push(...q);
      fu.push(...q.map((x) => uvIdx[x]));
    }
  return { positions: Float32Array.from(pos), faceSizes: Uint8Array.from(sizes), faceVerts: Uint32Array.from(fv), faceUVs: Uint32Array.from(fu), uvs: Float32Array.from(uvs.data) };
}

/** Points along the outline of a grid (its boundary loop), for piping and strings. */
export function gridOutline(grid: Vec3[][]): Vec3[] {
  const R = grid.length, C = grid[0].length;
  const out: Vec3[] = [];
  for (let j = 0; j < C; j++) out.push(grid[0][j]);
  for (let i = 1; i < R; i++) out.push(grid[i][C - 1]);
  for (let j = C - 2; j >= 0; j--) out.push(grid[R - 1][j]);
  for (let i = R - 2; i > 0; i--) out.push(grid[i][0]);
  return out;
}

/**
 * Rays from a point inside the body outward (a radial projection): patches cast this way wrap
 * round curved parts (the side of a breast) smoothly instead of grazing them from the front.
 */
export class RadialCaster {
  private tris: [Vec3, Vec3, Vec3, number][] = [];

  constructor(body: Body, faceVerts: Uint32Array, keep: (face: number) => boolean) {
    for (let f = 0; f < faceVerts.length / 4; f++) {
      if (!keep(f)) continue;
      const q = [0, 1, 2, 3].map((k) => body.p(faceVerts[f * 4 + k]));
      this.tris.push([q[0], q[1], q[2], f], [q[0], q[2], q[3], f]);
    }
  }

  /** The farthest surface along the ray from `o` in direction `d` (the outer skin): point, normal and body face. */
  hit(o: Vec3, d: Vec3): { p: Vec3; n: Vec3; face: number } | null {
    let best: { p: Vec3; n: Vec3; face: number } | null = null, bestT = 0;
    for (const [a, b, c, face] of this.tris) {
      // Moller-Trumbore.
      const e1: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const pv: Vec3 = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
      const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
      if (Math.abs(det) < 1e-12) continue;
      const tv: Vec3 = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
      const u = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
      if (u < 0 || u > 1) continue;
      const qv: Vec3 = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
      const v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
      if (v < 0 || u + v > 1) continue;
      const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
      if (t <= bestT) continue;
      bestT = t;
      let n: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const l = Math.hypot(...n) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
      if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0) n = [-n[0], -n[1], -n[2]];
      best = { p: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], n, face };
    }
    return best;
  }
}
