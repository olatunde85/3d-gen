/**
 * Fitted garments grown from the body surface: select body faces by a
 * coverage predicate, push them out along the normals, and close the open
 * hems with a rim so the cloth has visible thickness.
 */
import type { PolyMesh } from '../geometry';
import { REGION, type Body, type VInfo } from './body';

export interface ShellSpec {
  covers: (v: VInfo, p: [number, number, number]) => boolean;
  /** Offset from the skin in decimetres (may vary per vertex, e.g. looser at the hem). */
  offset: number | ((v: VInfo, p: [number, number, number]) => number);
  /** Texture tile size in metres. */
  tile?: number;
  /** Laplacian relaxation passes: cloth bridges over small skin detail. */
  relax?: number;
  /**
   * Depth of the hem's turned-in edge. By default the rim runs back down to the skin (right for
   * fitted clothes); loose clothes set a small depth so their edges read as thin fabric.
   */
  hemDepth?: number;
  /** Leave the hems open (no rim), for garments that continue the surface from a hem. */
  noRim?: boolean;
}

/** Collects face-varying UVs with value de-duplication. */
export class UVs {
  readonly data: number[] = [];
  private keys = new Map<string, number>();
  add(u: number, v: number): number {
    const k = `${Math.round(u * 1e5)},${Math.round(v * 1e5)}`;
    let i = this.keys.get(k);
    if (i === undefined) {
      i = this.data.length / 2;
      this.data.push(u, v);
      this.keys.set(k, i);
    }
    return i;
  }
}

/** Approximate circumference (metres) used to pick a whole number of texture repeats around each region. */
const CIRC: Record<number, number> = {
  [REGION.torso]: 0.95, [REGION.hips]: 0.95, [REGION.neck]: 0.4, [REGION.head]: 0.6,
  [REGION.upperarm]: 0.32, [REGION.lowerarm]: 0.26, [REGION.hand]: 0.2,
  [REGION.upperleg]: 0.55, [REGION.lowerleg]: 0.36, [REGION.foot]: 0.25,
};
const LEN: Record<number, number> = {
  [REGION.upperarm]: 0.3, [REGION.lowerarm]: 0.26, [REGION.hand]: 0.18,
  [REGION.upperleg]: 0.45, [REGION.lowerleg]: 0.42, [REGION.foot]: 0.2,
};

/** Tiling UV for a body vertex: angle around its region axis, distance along it. */
export function bodyUV(body: Body, v: number, tile: number): [number, number] {
  const i = body.info[v];
  const reps = Math.max(1, Math.round((CIRC[i.region] ?? 0.5) / tile));
  const u = ((i.theta / (2 * Math.PI) + 0.5) % 1) * reps;
  const along = i.region in LEN ? -i.t * LEN[i.region] : body.coords[v * 3 + 1] * 0.1;
  return [u, along / tile];
}

export interface ShellResult {
  mesh: PolyMesh;
  /** Body-face mask covered by this shell (for hiding skin underneath). */
  covered: Uint8Array;
}

/**
 * Pick body faces for a garment: majority of corners covered, then fill
 * pinholes and drop tiny islands so edges are clean despite region seams.
 */
function selectFaces(faceVerts: Uint32Array, vcovered: Uint8Array, nVerts: number): Uint8Array {
  const nf = faceVerts.length / 4;
  const sel = new Uint8Array(nf);
  for (let f = 0; f < nf; f++) {
    let c = 0;
    for (let k = 0; k < 4; k++) c += vcovered[faceVerts[f * 4 + k]];
    sel[f] = c >= 3 ? 1 : 0;
  }
  // Face adjacency through shared edges.
  const edgeFaces = new Map<number, number[]>();
  for (let f = 0; f < nf; f++)
    for (let k = 0; k < 4; k++) {
      const a = faceVerts[f * 4 + k], b = faceVerts[f * 4 + ((k + 1) % 4)];
      const key = a < b ? a * nVerts + b : b * nVerts + a;
      const l = edgeFaces.get(key);
      if (l) l.push(f);
      else edgeFaces.set(key, [f]);
    }
  const nbrs = (f: number) => {
    const out: number[] = [];
    for (let k = 0; k < 4; k++) {
      const a = faceVerts[f * 4 + k], b = faceVerts[f * 4 + ((k + 1) % 4)];
      for (const g of edgeFaces.get(a < b ? a * nVerts + b : b * nVerts + a)!) if (g !== f) out.push(g);
    }
    return out;
  };
  for (let pass = 0; pass < 2; pass++)
    for (let f = 0; f < nf; f++)
      if (!sel[f]) {
        const n = nbrs(f);
        if (n.length >= 3 && n.filter((g) => sel[g]).length >= n.length - 1) sel[f] = 2;
      }
  // Remove islands smaller than 20 faces.
  const seen = new Uint8Array(nf);
  for (let f = 0; f < nf; f++) {
    if (!sel[f] || seen[f]) continue;
    const comp = [f];
    seen[f] = 1;
    for (let i = 0; i < comp.length; i++)
      for (const g of nbrs(comp[i]))
        if (sel[g] && !seen[g]) {
          seen[g] = 1;
          comp.push(g);
        }
    if (comp.length < 20) for (const g of comp) sel[g] = 0;
  }
  return sel;
}

export function buildShell(body: Body, faceVerts: Uint32Array, spec: ShellSpec): ShellResult | null {
  const n = body.regions.length;
  const vcov = new Uint8Array(n);
  for (let v = 0; v < n; v++)
    if (body.regions[v] !== 255 && spec.covers(body.info[v], body.p(v))) vcov[v] = 1;
  const covered = selectFaces(faceVerts, vcov, n);
  const faces: number[] = [];
  for (let f = 0; f < covered.length; f++) if (covered[f]) faces.push(f * 4);
  if (!faces.length) return null;

  const tile = spec.tile ?? 0.25;
  const remap = new Map<number, number>();
  const pos: number[] = [];
  const ref: number[] = [];
  const N = body.normals, C = body.coords;
  const offsetOf = (v: number) => (typeof spec.offset === 'number' ? spec.offset : spec.offset(body.info[v], body.p(v)));
  const shellVert = (v: number) => {
    let i = remap.get(v);
    if (i === undefined) {
      i = pos.length / 3;
      remap.set(v, i);
      ref.push(v);
      const o = offsetOf(v);
      pos.push(C[v * 3] + N[v * 3] * o, C[v * 3 + 1] + N[v * 3 + 1] * o, C[v * 3 + 2] + N[v * 3 + 2] * o);
    }
    return i;
  };

  const uvs = new UVs();
  const sizes: number[] = [], fv: number[] = [], fu: number[] = [];
  const edgeCount = new Map<number, number>();
  const ekey = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  for (const f of faces) {
    const q = [faceVerts[f], faceVerts[f + 1], faceVerts[f + 2], faceVerts[f + 3]];
    const uv = q.map((v) => bodyUV(body, v, tile));
    // Fix the wrap-around seam in u.
    const reps = Math.max(...uv.map((x) => Math.ceil(x[0])));
    if (Math.max(...uv.map((x) => x[0])) - Math.min(...uv.map((x) => x[0])) > reps / 2)
      for (const x of uv) if (x[0] < reps / 2) x[0] += reps;
    sizes.push(4);
    for (let k = 0; k < 4; k++) {
      fv.push(shellVert(q[k]));
      fu.push(uvs.add(uv[k][0], uv[k][1]));
      const e = ekey(q[k], q[(k + 1) % 4]);
      edgeCount.set(e, (edgeCount.get(e) ?? 0) + 1);
    }
  }

  if (spec.relax) {
    const nb = new Map<number, Set<number>>();
    for (const f of faces)
      for (let k = 0; k < 4; k++) {
        const a = remap.get(faceVerts[f + k])!, b = remap.get(faceVerts[f + ((k + 1) % 4)])!;
        if (!nb.has(a)) nb.set(a, new Set());
        if (!nb.has(b)) nb.set(b, new Set());
        nb.get(a)!.add(b);
        nb.get(b)!.add(a);
      }
    const boundary = new Set<number>();
    for (const f of faces)
      for (let k = 0; k < 4; k++) {
        const a = faceVerts[f + k], b = faceVerts[f + ((k + 1) % 4)];
        if (edgeCount.get(ekey(a, b)) === 1) {
          boundary.add(remap.get(a)!);
          boundary.add(remap.get(b)!);
        }
      }
    for (let it = 0; it < spec.relax; it++) {
      const next = pos.slice();
      for (const [i, set] of nb) {
        if (boundary.has(i)) continue;
        let x = 0, y = 0, z = 0;
        for (const j of set) {
          x += pos[j * 3];
          y += pos[j * 3 + 1];
          z += pos[j * 3 + 2];
        }
        const k = set.size;
        next[i * 3] = pos[i * 3] * 0.5 + (x / k) * 0.5;
        next[i * 3 + 1] = pos[i * 3 + 1] * 0.5 + (y / k) * 0.5;
        next[i * 3 + 2] = pos[i * 3 + 2] * 0.5 + (z / k) * 0.5;
      }
      for (let i = 0; i < pos.length; i++) pos[i] = next[i];
    }
  }

  // Smooth the hem: relax boundary vertices along their boundary loop so the
  // edge follows a clean curve instead of the base mesh's quad stair-steps.
  const bnbr = new Map<number, number[]>();
  for (const f of faces)
    for (let k = 0; k < 4; k++) {
      const a = faceVerts[f + k], b = faceVerts[f + ((k + 1) % 4)];
      if (edgeCount.get(ekey(a, b)) !== 1) continue;
      for (const [x, y] of [[a, b], [b, a]]) {
        const l = bnbr.get(x);
        if (l) l.push(y);
        else bnbr.set(x, [y]);
      }
    }
  const bp = new Map<number, [number, number, number]>();
  for (const v of bnbr.keys()) {
    const i = remap.get(v)!;
    bp.set(v, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
  }
  for (let it = 0; it < 24; it++) {
    const next = new Map<number, [number, number, number]>();
    for (const [v, nb] of bnbr) {
      const p = bp.get(v)!;
      if (nb.length !== 2) {
        next.set(v, p);
        continue;
      }
      const a = bp.get(nb[0])!, c = bp.get(nb[1])!;
      next.set(v, [p[0] * 0.5 + (a[0] + c[0]) * 0.25, p[1] * 0.5 + (a[1] + c[1]) * 0.25, p[2] * 0.5 + (a[2] + c[2]) * 0.25]);
    }
    for (const [v, p] of next) bp.set(v, p);
  }
  const shift = new Map<number, [number, number, number]>();
  for (const [v, p] of bp) {
    const i = remap.get(v)!;
    shift.set(v, [p[0] - pos[i * 3], p[1] - pos[i * 3 + 1], p[2] - pos[i * 3 + 2]]);
    pos[i * 3] = p[0];
    pos[i * 3 + 1] = p[1];
    pos[i * 3 + 2] = p[2];
  }

  // Rims: boundary edges get a strip back down to the skin.
  const inner = new Map<number, number>();
  const innerVert = (v: number) => {
    let i = inner.get(v);
    if (i === undefined) {
      i = pos.length / 3;
      inner.set(v, i);
      ref.push(v);
      const o = spec.hemDepth !== undefined ? Math.max(offsetOf(v) - spec.hemDepth, 0) : Math.min(offsetOf(v) * 0.15, 0.01);
      const s = shift.get(v) ?? [0, 0, 0];
      pos.push(C[v * 3] + N[v * 3] * o + s[0], C[v * 3 + 1] + N[v * 3 + 1] * o + s[1], C[v * 3 + 2] + N[v * 3 + 2] * o + s[2]);
    }
    return i;
  };
  for (const f of spec.noRim ? [] : faces) {
    for (let k = 0; k < 4; k++) {
      const a = faceVerts[f + k], b = faceVerts[f + ((k + 1) % 4)];
      if (edgeCount.get(ekey(a, b)) !== 1) continue;
      const [ua, va] = bodyUV(body, a, tile);
      const [ub, vb] = bodyUV(body, b, tile);
      sizes.push(4);
      fv.push(shellVert(b), shellVert(a), innerVert(a), innerVert(b));
      fu.push(uvs.add(ub, vb), uvs.add(ua, va), uvs.add(ua, va + 0.02), uvs.add(ub, vb + 0.02));
    }
  }

  return {
    mesh: {
      positions: Float32Array.from(pos),
      faceSizes: Uint8Array.from(sizes),
      faceVerts: Uint32Array.from(fv),
      faceUVs: Uint32Array.from(fu),
      uvs: Float32Array.from(uvs.data),
      ref: Int32Array.from(ref),
    },
    covered,
  };
}

export interface CutSpec {
  /**
   * Where the cloth goes, as a smooth value per body vertex: positive inside, negative outside. The edge runs where it
   * crosses zero, through the faces, so it is a clean line whatever the size of the faces.
   */
  field: (v: VInfo, p: [number, number, number]) => number;
  /** Offset from the skin in decimetres (may vary per vertex). */
  offset: number | ((v: VInfo, p: [number, number, number]) => number);
  /** Texture tile size in metres. */
  tile?: number;
  /** Laplacian relaxation passes: cloth bridges over small skin detail. */
  relax?: number;
}

/**
 * A fitted garment cut along a line rather than along the body's faces: faces wholly inside become cloth, faces the
 * line crosses are clipped where it crosses, and the edge gets a rim back down to the skin. Only skin wholly inside
 * the line is hidden, so the skin meets the cloth's edge exactly.
 */
export function cutShell(body: Body, faceVerts: Uint32Array, spec: CutSpec): ShellResult | null {
  const n = body.regions.length, N = body.normals, C = body.coords, tile = spec.tile ?? 0.25;
  const offsetOf = (v: number) => (typeof spec.offset === 'number' ? spec.offset : spec.offset(body.info[v], body.p(v)));
  const value = new Float32Array(n).fill(-1);
  for (let v = 0; v < n; v++) if (body.regions[v] !== 255) value[v] = spec.field(body.info[v], body.p(v));
  const nf = faceVerts.length / 4, covered = new Uint8Array(nf), faces: number[] = [];
  for (let f = 0; f < nf; f++) {
    const q = [0, 1, 2, 3].map((k) => faceVerts[f * 4 + k]);
    if (q.some((v) => body.regions[v] === 255)) continue;
    if (q.some((v) => value[v] > 0)) faces.push(f);
    if (q.every((v) => value[v] > 0)) covered[f] = 1;
  }
  if (!faces.length) return null;

  // The cloth surface over every vertex the faces use, relaxed so it bridges small skin detail.
  const at = new Map<number, number>(), ref: number[] = [], pos: number[] = [];
  const cloth = (v: number) => {
    let i = at.get(v);
    if (i === undefined) {
      at.set(v, (i = ref.length));ref.push(v);
      const o = offsetOf(v);
      pos.push(C[v * 3] + N[v * 3] * o, C[v * 3 + 1] + N[v * 3 + 1] * o, C[v * 3 + 2] + N[v * 3 + 2] * o);
    }
    return i;
  };
  for (const f of faces) for (let k = 0; k < 4; k++) cloth(faceVerts[f * 4 + k]);
  if (spec.relax) {
    const nb = ref.map(() => new Set<number>()), edges = new Map<number, number>();
    for (const f of faces)
      for (let k = 0; k < 4; k++) {
        const a = at.get(faceVerts[f * 4 + k])!, b = at.get(faceVerts[f * 4 + ((k + 1) % 4)])!;
        nb[a].add(b);nb[b].add(a);
        const e = a < b ? a * ref.length + b : b * ref.length + a;
        edges.set(e, (edges.get(e) ?? 0) + 1);
      }
    // The outer ring stays put, so the cloth keeps its place at the edge.
    const fixed = new Set<number>();
    for (const [e, count] of edges) if (count === 1) { fixed.add(Math.floor(e / ref.length));fixed.add(e % ref.length); }
    for (let it = 0; it < spec.relax; it++) {
      const next = pos.slice();
      nb.forEach((set, i) => {
        if (fixed.has(i) || !set.size) return;
        for (let d = 0; d < 3; d++) {
          let sum = 0;
          for (const j of set) sum += pos[j * 3 + d];
          next[i * 3 + d] = pos[i * 3 + d] * 0.5 + (sum / set.size) * 0.5;
        }
      });
      for (let i = 0; i < pos.length; i++) pos[i] = next[i];
    }
  }

  // Clip each face to the inside of the line. A point on an edge is shared by the faces either side.
  const uvs = new UVs(), sizes: number[] = [], fv: number[] = [], fu: number[] = [];
  const onEdge = new Map<string, number>(), onCut = new Set<number>(), normal: [number, number, number][] = ref.map((v) => [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]]);
  const cut = (a: number, b: number, t: number) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    let i = onEdge.get(key);
    if (i === undefined) {
      const ia = at.get(a)!, ib = at.get(b)!;
      i = ref.length;onEdge.set(key, i);ref.push(value[a] > 0 ? a : b);onCut.add(i);
      for (let d = 0; d < 3; d++) pos.push(pos[ia * 3 + d] + (pos[ib * 3 + d] - pos[ia * 3 + d]) * t);
      const m: [number, number, number] = [0, 1, 2].map((d) => normal[ia][d] + (normal[ib][d] - normal[ia][d]) * t) as [number, number, number];
      const l = Math.hypot(...m) || 1;normal.push([m[0] / l, m[1] / l, m[2] / l]);
    }
    return i;
  };
  for (const f of faces) {
    const q = [0, 1, 2, 3].map((k) => faceVerts[f * 4 + k]);
    const uv = q.map((v) => bodyUV(body, v, tile));
    const reps = Math.max(...uv.map((x) => Math.ceil(x[0])));
    if (Math.max(...uv.map((x) => x[0])) - Math.min(...uv.map((x) => x[0])) > reps / 2) for (const x of uv) if (x[0] < reps / 2) x[0] += reps;
    const poly: { i: number; uv: [number, number] }[] = [];
    for (let k = 0; k < 4; k++) {
      const a = q[k], b = q[(k + 1) % 4], va = value[a], vb = value[b];
      if (va > 0) poly.push({ i: at.get(a)!, uv: uv[k] });
      if ((va > 0) !== (vb > 0)) {
        const t = va / (va - vb), u2 = uv[(k + 1) % 4];
        poly.push({ i: cut(a, b, t), uv: [uv[k][0] + (u2[0] - uv[k][0]) * t, uv[k][1] + (u2[1] - uv[k][1]) * t] });
      }
    }
    if (poly.length < 3) continue;
    sizes.push(poly.length);
    for (const c of poly) { fv.push(c.i);fu.push(uvs.add(c.uv[0], c.uv[1])); }
  }

  // Rims: each edge of the cloth that only one face uses gets a strip back toward the skin.
  const count = new Map<string, number>();
  const corners = (face: number, start: number) => Array.from({ length: sizes[face] }, (_, k) => fv[start + k]);
  for (let face = 0, s = 0; face < sizes.length; s += sizes[face++]) {
    const c = corners(face, s);
    c.forEach((a, k) => { const b = c[(k + 1) % c.length], key = a < b ? `${a},${b}` : `${b},${a}`;count.set(key, (count.get(key) ?? 0) + 1); });
  }
  const inner = new Map<number, number>();
  const innerVert = (i: number) => {
    let j = inner.get(i);
    if (j === undefined) {
      j = ref.length;inner.set(i, j);ref.push(ref[i]);if (onCut.has(i)) onCut.add(j);
      const o = offsetOf(ref[i]);
      for (let d = 0; d < 3; d++) pos.push(pos[i * 3 + d] - normal[i][d] * o * 0.85);
    }
    return j;
  };
  const faceCount = sizes.length;
  for (let face = 0, s = 0; face < faceCount; s += sizes[face++]) {
    const c = corners(face, s);
    for (let k = 0; k < c.length; k++) {
      const a = c[k], b = c[(k + 1) % c.length];
      if (count.get(a < b ? `${a},${b}` : `${b},${a}`) !== 1) continue;
      const ua = uvs.data.slice(fu[s + k] * 2, fu[s + k] * 2 + 2), ub = uvs.data.slice(fu[s + (k + 1) % c.length] * 2, fu[s + (k + 1) % c.length] * 2 + 2);
      sizes.push(4);
      fv.push(b, a, innerVert(a), innerVert(b));
      fu.push(uvs.add(ub[0], ub[1]), uvs.add(ua[0], ua[1]), uvs.add(ua[0], ua[1] + 0.02), uvs.add(ub[0], ub[1] + 0.02));
    }
  }

  return {
    mesh: {
      positions: Float32Array.from(pos), faceSizes: Uint8Array.from(sizes), faceVerts: Uint32Array.from(fv),
      faceUVs: Uint32Array.from(fu), uvs: Float32Array.from(uvs.data),
      // Points on the cut have no single body vertex: their skin weights blend those of the body round them, so the
      // edge bends smoothly with the body.
      ref: Int32Array.from(ref, (v, i) => (onCut.has(i) ? -1 : v)),
    },
    covered,
  };
}
