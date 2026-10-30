/**
 * Automatic rigging: builds the chosen skeleton on the generated body, gives
 * every vertex of every part (body, clothes, hair, accessories) skin weights,
 * and can re-pose the bind pose from MakeHuman's A-pose into a T-pose.
 */
import type { AssetLibrary } from '../assets';
import { blendInfluences, type PolyMesh, type Skin } from '../geometry';
import type { Vec3 } from '../math';
import { fullSkeleton, gameSkeleton, type BoneDef, type RigType } from './skeletons';

/** 3x3 rotation, column-major: [x axis, y axis, z axis]. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface RigBone {
  name: string;
  parent: number; // -1 = root
  head: Vec3; // metres, world, bind pose
  tail: Vec3;
  /** World bind rotation: local Y points along the bone, Z roughly forward. */
  rot: Mat3;
}

export interface Rig {
  type: RigType;
  restPose: 'A' | 'T';
  bones: RigBone[];
  /** Hands holding something by a handle (a carried bag): their fingers stay closed in every clip. */
  holds?: ('Left' | 'Right')[];
}

export interface RigOptions {
  type: RigType;
  face: boolean;
}

// --- Small vector / matrix helpers --------------------------------------------------

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export function mulMV(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}
export function mulMM(a: Mat3, b: Mat3): Mat3 {
  const c = (j: number): Vec3 => mulMV(a, [b[j * 3], b[j * 3 + 1], b[j * 3 + 2]]);
  return [...c(0), ...c(1), ...c(2)] as Mat3;
}
export const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const IDENT: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Rotation taking unit vector a onto unit vector b. */
function fromTo(a: Vec3, b: Vec3): Mat3 {
  const v = cross(a, b), c = dot(a, b);
  if (c < -0.9999) {
    const axis = norm(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
    return axisAngle(axis, Math.PI);
  }
  const k = 1 / (1 + c);
  return [
    v[0] * v[0] * k + c, v[1] * v[0] * k + v[2], v[2] * v[0] * k - v[1],
    v[0] * v[1] * k - v[2], v[1] * v[1] * k + c, v[2] * v[1] * k + v[0],
    v[0] * v[2] * k + v[1], v[1] * v[2] * k - v[0], v[2] * v[2] * k + c,
  ];
}

export function axisAngle(axis: Vec3, ang: number): Mat3 {
  const [x, y, z] = norm(axis), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [
    t * x * x + c, t * x * y + s * z, t * x * z - s * y,
    t * x * y - s * z, t * y * y + c, t * y * z + s * x,
    t * x * z + s * y, t * y * z - s * x, t * z * z + c,
  ];
}

/** Bone frame: Y along the bone, Z toward the front (or up for forward-pointing bones). */
export function boneFrame(dir: Vec3): Mat3 {
  const y = norm(dir);
  const zRef: Vec3 = Math.abs(y[2]) > 0.85 ? [0, 1, 0] : [0, 0, 1];
  const x = norm(cross(y, zRef));
  const z = cross(x, y);
  return [...x, ...y, ...z] as Mat3;
}

/** Quaternion [x, y, z, w] from a rotation matrix. */
export function quatOf(m: Mat3): [number, number, number, number] {
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = m;
  const tr = m00 + m11 + m22;
  let q: [number, number, number, number];
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  const l = Math.hypot(...q);
  return q.map((x) => x / l) as [number, number, number, number];
}

// --- Skeleton construction ----------------------------------------------------------

export function skeletonDefs(lib: AssetLibrary, o: RigOptions): BoneDef[] {
  if (o.type === 'full') return fullSkeleton(lib.base.meta.bones);
  return gameSkeleton({ all: lib.base.meta.bones.map((b) => b.name) }, { fingers: o.type === 'game', face: o.face });
}

/** Place bones from joint positions (already in output space). */
export function placeBones(defs: BoneDef[], joint: (name: string) => Vec3): RigBone[] {
  const index = new Map(defs.map((d, i) => [d.name, i]));
  const heads = defs.map((d) => joint(d.head));
  const firstChild = new Map<string, number>();
  defs.forEach((d, i) => {
    if (d.parent && !firstChild.has(d.parent)) firstChild.set(d.parent, i);
  });
  // Prefer the "main" child where several exist (spine over legs, middle finger over others).
  for (const [parent, child] of [['Hips', 'Spine'], ['Spine2', 'Neck'], ['LeftHand', 'LeftHandMiddle1'], ['RightHand', 'RightHandMiddle1'], ['Head', 'HeadTop_End']] as const)
    if (index.has(parent) && index.has(child)) firstChild.set(parent, index.get(child)!);
  const bones: RigBone[] = [];
  defs.forEach((d, i) => {
    const parent = d.parent ? index.get(d.parent)! : -1;
    let tail: Vec3;
    if (d.tail) tail = joint(d.tail);
    else if (firstChild.has(d.name)) tail = heads[firstChild.get(d.name)!];
    else {
      // Leaf/end bone: continue the parent's direction.
      const pd = parent >= 0 ? norm(sub(heads[i], heads[parent])) : [0, 1, 0] as Vec3;
      tail = add(heads[i], pd.map((x) => x * 0.03) as Vec3);
    }
    let dir = sub(tail, heads[i]);
    if (len(dir) < 1e-5) {
      dir = parent >= 0 ? sub(bones[parent].tail, bones[parent].head) : [0, 1, 0];
      tail = add(heads[i], norm(dir).map((x) => x * 0.03) as Vec3);
    }
    bones.push({ name: d.name, parent, head: heads[i], tail, rot: boneFrame(dir) });
  });
  return bones;
}

// --- Skin weights -------------------------------------------------------------------

const skinCache = new WeakMap<AssetLibrary, Map<string, Skin>>();

/** Per base-mesh vertex: top-4 influences in the target skeleton. */
export function baseSkin(lib: AssetLibrary, defs: BoneDef[]): Skin {
  const key = defs.map((d) => `${d.name}:${d.mh.join(',')}`).join('|');
  let cache = skinCache.get(lib);
  if (!cache) skinCache.set(lib, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;

  const mhBones = lib.base.meta.bones;
  const target = new Map<string, number>();
  defs.forEach((d, i) => d.mh.forEach((m) => target.set(m, i)));
  const parentOf = new Map(mhBones.map((b) => [b.name, b.parent]));
  // MakeHuman bone index -> target bone (walk up the hierarchy for unmapped bones).
  const map = mhBones.map((b) => {
    let n: string | null = b.name;
    while (n && !target.has(n)) n = parentOf.get(n) ?? null;
    return n ? target.get(n)! : 0;
  });
  const { wOff, wBone, wVal } = lib.base.arrays as { wOff: Uint32Array; wBone: Uint8Array; wVal: Float32Array };
  const n = lib.base.meta.vertexCount;
  const skin: Skin = { j: new Uint16Array(n * 4), w: new Float32Array(n * 4) };
  const acc = new Map<number, number>();
  for (let v = 0; v < n; v++) {
    acc.clear();
    for (let k = wOff[v]; k < wOff[v + 1]; k++) {
      const t = map[wBone[k]];
      acc.set(t, (acc.get(t) ?? 0) + wVal[k]);
    }
    if (!acc.size) acc.set(0, 1);
    blendInfluences(acc, skin.j, skin.w, v * 4);
  }
  cache.set(key, skin);
  return skin;
}

/** Uniform grid over body vertices for nearest-vertex weight transfer. */
export class VertexGrid {
  private cells = new Map<string, number[]>();
  constructor(private pts: Float32Array, mask: (v: number) => boolean, private cell = 0.3) {
    for (let v = 0; v < pts.length / 3; v++) {
      if (!mask(v)) continue;
      const k = this.key(pts[v * 3], pts[v * 3 + 1], pts[v * 3 + 2]);
      const l = this.cells.get(k);
      if (l) l.push(v);
      else this.cells.set(k, [v]);
    }
  }
  private key(x: number, y: number, z: number) {
    return `${Math.floor(x / this.cell)},${Math.floor(y / this.cell)},${Math.floor(z / this.cell)}`;
  }
  /** k nearest vertices (searching outward ring by ring). */
  nearest(p: Vec3, k: number): { v: number; d: number }[] {
    const cx = Math.floor(p[0] / this.cell), cy = Math.floor(p[1] / this.cell), cz = Math.floor(p[2] / this.cell);
    const found: { v: number; d: number }[] = [];
    for (let r = 0; r < 40; r++) {
      for (let x = cx - r; x <= cx + r; x++)
        for (let y = cy - r; y <= cy + r; y++)
          for (let z = cz - r; z <= cz + r; z++) {
            if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== r) continue;
            for (const v of this.cells.get(`${x},${y},${z}`) ?? []) {
              const d = Math.hypot(this.pts[v * 3] - p[0], this.pts[v * 3 + 1] - p[1], this.pts[v * 3 + 2] - p[2]);
              found.push({ v, d });
            }
          }
      if (found.length >= k && r >= 1) break;
    }
    return found.sort((a, b) => a.d - b.d).slice(0, k);
  }
}

/** Assign skin weights to a part: from its base-mesh refs where known, else from the nearest body vertices. */
export function skinPart(m: PolyMesh, base: Skin, grid: VertexGrid, k = 6): Skin {
  const n = m.positions.length / 3;
  const j = new Uint16Array(n * 4), w = new Float32Array(n * 4);
  const acc = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const r = m.ref?.[i] ?? -1;
    acc.clear();
    const addVert = (v: number, f: number) => {
      for (let q = 0; q < 4; q++) {
        const x = base.w[v * 4 + q] * f;
        if (x) acc.set(base.j[v * 4 + q], (acc.get(base.j[v * 4 + q]) ?? 0) + x);
      }
    };
    if (r >= 0) addVert(r, 1);
    else {
      const near = grid.nearest([m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]], k);
      for (const { v, d } of near) addVert(v, 1 / (d + 0.05));
    }
    blendInfluences(acc, j, w, i * 4);
  }
  return { j, w };
}

/** Skin for a fitted proxy: blend of its three reference vertices. */
export function skinFromRefs(refs: Uint32Array, weights: Float32Array, base: Skin): Skin {
  const n = refs.length / 3;
  const j = new Uint16Array(n * 4), w = new Float32Array(n * 4);
  const acc = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    acc.clear();
    for (let r = 0; r < 3; r++) {
      const v = refs[i * 3 + r], f = Math.abs(weights[i * 3 + r]);
      if (!f) continue;
      for (let q = 0; q < 4; q++) {
        const x = base.w[v * 4 + q] * f;
        if (x) acc.set(base.j[v * 4 + q], (acc.get(base.j[v * 4 + q]) ?? 0) + x);
      }
    }
    blendInfluences(acc, j, w, i * 4);
  }
  return { j, w };
}

// --- Re-posing (A-pose -> T-pose) -------------------------------------------------

interface Xform {
  R: Mat3;
  t: Vec3;
}

/** Bones that get straightened horizontally for a T-pose, with their side (+1 left). */
function tposeSide(name: string): number {
  if (/^Left(Arm|ForeArm|Hand)$/.test(name) || /^(upperarm0[12]|lowerarm0[12]|wrist)\.L$/.test(name)) return 1;
  if (/^Right(Arm|ForeArm|Hand)$/.test(name) || /^(upperarm0[12]|lowerarm0[12]|wrist)\.R$/.test(name)) return -1;
  return 0;
}

/**
 * Re-pose the bind pose into a T-pose with linear blend skinning. Mutates the
 * parts' positions and returns the re-posed bones.
 */
export function applyTPose(bones: RigBone[], parts: PolyMesh[]): { bones: RigBone[]; move: (bone: number, p: Vec3) => Vec3 } {
  const X: Xform[] = [];
  bones.forEach((b, i) => {
    let x: Xform = b.parent >= 0 ? X[b.parent] : { R: IDENT, t: [0, 0, 0] };
    const side = tposeSide(b.name);
    if (side) {
      const h = add(mulMV(x.R, b.head), x.t);
      const d = norm(mulMV(x.R, sub(b.tail, b.head)));
      const q = fromTo(d, [side, 0, 0]);
      // p' = q (R p + t - h) + h
      x = { R: mulMM(q, x.R), t: add(mulMV(q, sub(x.t, h)), h) };
    }
    X[i] = x;
  });
  for (const m of parts) {
    if (!m.skin) continue;
    const P = m.positions;
    for (let v = 0; v < P.length / 3; v++) {
      const p: Vec3 = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
      let o: Vec3 = [0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const w = m.skin.w[v * 4 + k];
        if (!w) continue;
        const x = X[m.skin.j[v * 4 + k]];
        const q = add(mulMV(x.R, p), x.t);
        o = [o[0] + q[0] * w, o[1] + q[1] * w, o[2] + q[2] * w];
      }
      P[v * 3] = o[0];
      P[v * 3 + 1] = o[1];
      P[v * 3 + 2] = o[2];
    }
  }
  return {
    bones: bones.map((b, i) => {
      const head = add(mulMV(X[i].R, b.head), X[i].t);
      const tail = add(mulMV(X[i].R, b.tail), X[i].t);
      return { ...b, head, tail, rot: boneFrame(sub(tail, head)) };
    }),
    /** Move a point rigidly with a bone (e.g. joints the skeleton doesn't have bones for). */
    move: (bone, p) => add(mulMV(X[bone].R, p), X[bone].t),
  };
}

/** Local transform of a bone relative to its parent (for exporters / three.js). */
export function localTransform(bones: RigBone[], i: number): { t: Vec3; R: Mat3 } {
  const b = bones[i];
  if (b.parent < 0) return { t: b.head, R: b.rot };
  const p = bones[b.parent];
  const inv = transpose(p.rot);
  return { t: mulMV(inv, sub(b.head, p.head)), R: mulMM(inv, b.rot) };
}
