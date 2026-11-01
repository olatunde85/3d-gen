/**
 * Motion-capture import: BVH files retargeted onto our skeletons.
 *
 * Retargeting copies each bone's world-space rotation relative to the source's rest pose. The
 * source rest (all channels zero) is not a clean T-pose (CMU's legs splay out), so every target
 * bone is first swung from our T-pose to the source's rest direction; the motion is applied on
 * top of that. Hips height and travel are scaled by leg length. Both use +Y up, +Z forward,
 * +X = the character's left.
 */
import type { Vec3 } from '../math';
import { fingers, fist } from './clips/helpers';
import type { Ch, Clip, ClipCategory, Sample } from './clips/types';
import { qaxis, qconj, qfromTo, qmul, qrot, qslerp, type Q } from './quat';

interface BvhJoint {
  name: string;
  parent: number;
  offset: Vec3;
  channels: string[];
  /** Offset of the first child (or end site): the bone's rest direction. */
  tip?: Vec3;
  /** Children (zero-length ones are followed to find the tip). */
  kids: number[];
}
export interface Bvh {
  joints: BvhJoint[];
  frames: Float32Array[];
  frameTime: number;
}

export function parseBvh(text: string): Bvh {
  const tok = text.split(/\s+/).filter(Boolean);
  let i = 0;
  const joints: BvhJoint[] = [];
  const stack: number[] = [];
  let endSite = false;
  while (i < tok.length && tok[i] !== 'MOTION') {
    const t = tok[i++];
    if (t === 'ROOT' || t === 'JOINT') {
      joints.push({ name: tok[i++], parent: stack.length ? stack[stack.length - 1] : -1, offset: [0, 0, 0], channels: [], kids: [] });
      if (joints.length > 1) joints[joints[joints.length - 1].parent].kids.push(joints.length - 1);
    } else if (t === 'End') {
      i++; // "Site"
      endSite = true;
    } else if (t === '{') {
      stack.push(endSite ? -2 : joints.length - 1);
    } else if (t === '}') {
      stack.pop();
      endSite = false;
    } else if (t === 'OFFSET') {
      const o: Vec3 = [+tok[i++], +tok[i++], +tok[i++]];
      const cur = stack[stack.length - 1];
      if (cur === -2) {
        // End site: the tip of the innermost joint.
        const owner = stack[stack.length - 2];
        if (owner >= 0 && !joints[owner].tip) joints[owner].tip = o;
      } else {
        joints[cur].offset = o;
      }
    } else if (t === 'CHANNELS') {
      const n = +tok[i++];
      joints[stack[stack.length - 1]].channels = tok.slice(i, i + n);
      i += n;
    }
  }
  // Tips: the first child with length, looking through zero-length joints (CMU's LHipJoint, FingerBase).
  const tipOf = (k: number): Vec3 | undefined => {
    for (const c of joints[k].kids) {
      if (Math.hypot(...joints[c].offset) > 1e-6) return joints[c].offset;
      const t = tipOf(c);
      if (t) return t;
    }
    return joints[k].tip;
  };
  for (let k = 0; k < joints.length; k++) joints[k].tip = tipOf(k);
  i++; // MOTION
  i++; // Frames:
  const nFrames = +tok[i++];
  i += 2; // Frame Time:
  const frameTime = +tok[i++];
  const nCh = joints.reduce((s, j) => s + j.channels.length, 0);
  const frames: Float32Array[] = [];
  for (let f = 0; f < nFrames && i + nCh <= tok.length; f++) {
    const row = new Float32Array(nCh);
    for (let c = 0; c < nCh; c++) row[c] = +tok[i++];
    frames.push(row);
  }
  return { joints, frames, frameTime };
}

/** The recording mirrored left to right (x -> -x): a sidestep to the right becomes one to the left. */
export function mirrorBvh(b: Bvh): Bvh {
  const swap = (n: string) => n.replace(/^(Left|Right|L|R)(?=[A-Z])/, (s) => ({ Left: 'Right', Right: 'Left', L: 'R', R: 'L' })[s]!);
  const flip = (v?: Vec3): Vec3 | undefined => v && [-v[0], v[1], v[2]];
  const joints = b.joints.map((j) => ({ ...j, name: swap(j.name), offset: flip(j.offset)!, tip: flip(j.tip) }));
  // Reflection keeps rotations about X and reverses those about Y and Z.
  const neg = b.joints.flatMap((j) => j.channels.map((c) => c === 'Xposition' || c === 'Yrotation' || c === 'Zrotation'));
  const frames = b.frames.map((row) => row.map((v, c) => (neg[c] ? -v : v)));
  return { joints, frames, frameTime: b.frameTime };
}

/** CMU (cgspeed) joint names -> our game-rig bones. Toes are left out: CMU's toe channels are noisy and bend the shoe. */
const CMU_MAP: Record<string, string> = {
  Hips: 'Hips', LowerBack: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Neck: 'Neck', Head: 'Head',
  LeftShoulder: 'LeftShoulder', LeftArm: 'LeftArm', LeftForeArm: 'LeftForeArm', LeftHand: 'LeftHand',
  RightShoulder: 'RightShoulder', RightArm: 'RightArm', RightForeArm: 'RightForeArm', RightHand: 'RightHand',
  LeftUpLeg: 'LeftUpLeg', LeftLeg: 'LeftLeg', LeftFoot: 'LeftFoot',
  RightUpLeg: 'RightUpLeg', RightLeg: 'RightLeg', RightFoot: 'RightFoot',
};

/** World rotations (per joint) and hips position (source units) for one BVH frame. */
function poseAt(bvh: Bvh, row: Float32Array): { world: Q[]; hips: Vec3 } {
  const world: Q[] = [];
  let c = 0;
  let hips: Vec3 = [0, 0, 0];
  bvh.joints.forEach((j, k) => {
    let q: Q = [0, 0, 0, 1];
    for (const ch of j.channels) {
      const v = row[c++];
      if (ch === 'Xposition') hips = [v, hips[1], hips[2]];
      else if (ch === 'Yposition') hips = [hips[0], v, hips[2]];
      else if (ch === 'Zposition') hips = [hips[0], hips[1], v];
      else if (ch === 'Xrotation') q = qmul(q, qaxis([1, 0, 0], v));
      else if (ch === 'Yrotation') q = qmul(q, qaxis([0, 1, 0], v));
      else if (ch === 'Zrotation') q = qmul(q, qaxis([0, 0, 1], v));
    }
    world[k] = j.parent < 0 ? q : qmul(world[j.parent], q);
  });
  return { world, hips };
}

export interface MocapSample {
  /** World rotation (relative to the source rest pose) per target bone. */
  rot: Record<string, Q>;
  /** Source rest direction per target bone (world). */
  dir: Record<string, Vec3>;
  /** Calibration rotations (world, at rest) per target bone, applied before the motion. */
  bias: Record<string, Q>;
  /** Hips position in leg lengths (x/z relative to the start; y above the floor, 1 = standing). */
  hips: Vec3;
  /** Key for caching rest alignments. */
  key: string;
  /**
   * Chained cuts of one take: the pose at their shared reference (feet planted) and a key shared
   * by the group. They are grounded once from that pose, so they meet where they join.
   */
  anchor?: { rot: Record<string, Q>; hips: Vec3; key: string };
}

export interface MocapOptions {
  id: string;
  name: string;
  category: ClipCategory;
  loop: boolean;
  /** Seconds into the recording to start / end (end defaults to the recording's end). */
  start?: number;
  end?: number;
  /** Loops: search this range (seconds after start) for the frame that best matches the start. */
  loopSearch?: [number, number];
  /** Seconds in the recording where the actor holds their head neutrally (default: the whole cut),
   * for clips whose head pose is the point (a sob keeps the head bowed). */
  neutral?: [number, number];
  /**
   * Seconds in the recording of a shared reference, for clips cut from one take that chain (sit
   * down -> sit idle -> stand up): they all face the way the hips face then, place the hips
   * relative to that moment (no travel removed or centring), and share the take's floor and foot
   * calibration, so they meet where they join.
   */
  ref?: number;
  /** With `ref`: seconds in the recording whose hips position is the origin (default: `ref`). */
  origin?: number;
  /** Name of the take (groups chained cuts that share `ref`). */
  take?: string;
  /**
   * Degrees each leg is turned out at the hip and again at the knee (default 4: keeps the knees of
   * our wider bodies apart). Less closes the legs, so the feet land on one line.
   */
  legSpread?: number;
  /** Degrees the swinging leg turns out at the hip as it passes the other (closed legs' feet clear each other). */
  swing?: number;
}

export function mocapClip(bvh: Bvh, o: MocapOptions): Clip {
  const ft = bvh.frameTime;
  const f0 = Math.min(bvh.frames.length - 1, Math.round((o.start ?? 0) / ft));
  let f1 = Math.min(bvh.frames.length - 1, Math.round((o.end ?? bvh.frames.length * ft) / ft));
  const poses = smooth(bvh.frames.map((row) => poseAt(bvh, row)), Math.round(0.025 / ft));
  // Head and neck. CMU head orientation depends on where each actor's marker cap sat (one actor
  // holds the chin ~12 degrees up throughout, another looks ~20 degrees down), so the actor's
  // average head pose relative to the chest is taken as their neutral and mapped to ours; movement
  // around it is kept. The chest-to-head bend is then shared along the neck (about 60% in the neck,
  // like the cervical spine) instead of following CMU's lower neck joint alone, which put nearly
  // all of a nod at the skull and crushed the throat.
  const [chestJ, neckJ, headJ] = ['Spine1', 'Neck', 'Head'].map((n) => bvh.joints.findIndex((j) => j.name === n));
  if (chestJ >= 0 && neckJ >= 0 && headJ >= 0) {
    const rel = poses.map((P) => qmul(qconj(P.world[chestJ]), P.world[headJ]));
    const acc = [0, 0, 0, 0];
    const [n0, n1] = o.neutral ? o.neutral.map((s) => Math.min(poses.length - 1, Math.round(s / ft))) : [f0, f1];
    for (const q of rel.slice(n0, n1 + 1)) {
      const sg = q[3] < 0 ? -1 : 1;
      for (let d = 0; d < 4; d++) acc[d] += q[d] * sg;
    }
    const l = Math.hypot(...acc);
    const neutral = qconj([acc[0] / l, acc[1] / l, acc[2] / l, acc[3] / l]);
    poses.forEach((P, f) => {
      P.world[headJ] = qmul(P.world[chestJ], qmul(rel[f], neutral));
      P.world[neckJ] = qslerp(P.world[chestJ], P.world[headJ], 0.6);
    });
  }
  const mapped = bvh.joints.map((j, k) => [CMU_MAP[j.name], k] as const).filter(([g]) => !!g) as [string, number][];
  if (o.loop && o.loopSearch) {
    // Seamless loop: the frame whose pose (and vertical hips) best matches the first frame.
    const a = poses[f0];
    let best = Infinity;
    for (let f = f0 + Math.round(o.loopSearch[0] / ft); f <= Math.min(bvh.frames.length - 1, f0 + Math.round(o.loopSearch[1] / ft)); f++) {
      const b = poses[f];
      let err = 0;
      for (const [, k] of mapped) {
        const d = Math.abs(a.world[k][0] * b.world[k][0] + a.world[k][1] * b.world[k][1] + a.world[k][2] * b.world[k][2] + a.world[k][3] * b.world[k][3]);
        err += 1 - Math.min(1, d);
      }
      if (err < best) [best, f1] = [err, f];
    }
  }
  // Leg length: rest drop from the hips to the lowest end site.
  const restPos: Vec3[] = [];
  bvh.joints.forEach((j, k) => (restPos[k] = j.parent < 0 ? [0, 0, 0] : (restPos[j.parent].map((x, d) => x + j.offset[d]) as Vec3)));
  let low = 0;
  bvh.joints.forEach((j, k) => (low = Math.min(low, restPos[k][1] + (j.tip?.[1] ?? 0))));
  const leg = -low;
  const duration = (f1 - f0) * ft;
  // Face +Z: along the travel for clips that move, else the way the hips face at the start.
  const p0 = poses[f0].hips, p1 = poses[f1].hips;
  const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) / leg / duration > 0.15;
  const fr = o.ref !== undefined ? Math.min(poses.length - 1, Math.round(o.ref / ft)) : -1;
  const fwd = fr >= 0 ? qrot(poses[fr].world[0], [0, 0, 1]) : moved ? [p1[0] - p0[0], 0, p1[2] - p0[2]] : qrot(poses[f0].world[0], [0, 0, 1]);
  let yaw = -Math.atan2(fwd[0], fwd[2]);
  if (o.loop && fr < 0) {
    // Face the average way the hips point (actors drift a few degrees off their path).
    let sx = 0, sz = 0;
    for (let f = f0; f <= f1; f++) {
      const h = qrot(poses[f].world[0], [0, 0, 1]);
      sx += h[0];
      sz += h[2];
    }
    yaw = -Math.atan2(sx, sz);
  }
  const turn = qaxis([0, 1, 0], (yaw * 180) / Math.PI);
  for (const P of poses) {
    P.world = P.world.map((q) => qmul(turn, q));
    P.hips = qrot(turn, P.hips);
  }
  // In place: remove the straight-line travel between the first and last frame.
  // (With a reference, hips are placed relative to it instead.)
  const fo = fr >= 0 && o.origin !== undefined ? Math.min(poses.length - 1, Math.round(o.origin / ft)) : fr;
  const q0 = poses[fo >= 0 ? fo : f0].hips, q1 = poses[f1].hips;
  const vel: Vec3 = fr >= 0 ? [0, 0, 0] : [(q1[0] - q0[0]) / duration, 0, (q1[2] - q0[2]) / duration];
  // One-shots stay centred on their average position (an actor who walks to a stool stays in view).
  const mid: Vec3 = [0, 0, 0];
  if (!o.loop && fr < 0) {
    for (let f = f0; f <= f1; f++) {
      const tt = (f - f0) * ft;
      mid[0] += (poses[f].hips[0] - q0[0] - vel[0] * tt) / (f1 - f0 + 1);
      mid[2] += (poses[f].hips[2] - q0[2] - vel[2] * tt) / (f1 - f0 + 1);
    }
  }
  // Feet height (Foot and ToeBase joints and the toe tips) per frame; the lowest over the clip is the floor.
  const footJ = bvh.joints.map((j, k) => (/^(Left|Right)(Foot|ToeBase)$/.test(j.name) ? k : -1)).filter((k) => k >= 0);
  const ankle = ['Left', 'Right'].map((side) => bvh.joints.findIndex((j) => j.name === `${side}Foot`));
  const ankleY: number[][] = [[], []];
  const footLow = poses.map((P, f) => {
    const pos: Vec3[] = [];
    bvh.joints.forEach((j, k) => {
      pos[k] = j.parent < 0 ? P.hips : (qrot(P.world[j.parent], j.offset).map((v, d) => v + pos[j.parent][d]) as Vec3);
    });
    ankle.forEach((k, s) => (ankleY[s][f] = k >= 0 ? pos[k][1] : 0));
    let low = Infinity;
    for (const k of footJ) {
      low = Math.min(low, pos[k][1]);
      const tip = bvh.joints[k].tip;
      if (tip) low = Math.min(low, pos[k][1] + qrot(P.world[k], tip)[1]);
    }
    return low;
  });
  // Floor and foot calibration come from the cut, or the whole take for chained cuts.
  const [c0, c1] = fr >= 0 ? [0, poses.length - 1] : [f0, f1];
  const floor = Math.min(...footLow.slice(c0, c1 + 1));
  // Closed legs: the swinging leg turns out at the hip as its foot lifts (most at its highest, as
  // it passes the other), so the feet clear each other and still land on the line.
  if (o.swing) {
    for (const [s, side] of [[0, 'Left'], [1, 'Right']] as const) {
      const chain = ['UpLeg', 'Leg', 'Foot', 'ToeBase'].map((n) => bvh.joints.findIndex((j) => j.name === `${side}${n}`)).filter((k) => k >= 0);
      const ys = ankleY[s].slice(c0, c1 + 1), lo = Math.min(...ys), hi = Math.max(...ys);
      poses.forEach((P, f) => {
        const x = Math.max(0, Math.min(1, (ankleY[s][f] - lo) / (hi - lo || 1)));
        const out = qaxis([0, 0, 1], (s ? -1 : 1) * o.swing! * x * x * (3 - 2 * x));
        for (const k of chain) P.world[k] = qmul(out, P.world[k]);
      });
    }
  }
  // Travel in m/s at 1.8 m height (hips about 0.95 m up).
  const travel: [number, number, number] = [(vel[0] / leg) * 0.95, 0, (vel[2] / leg) * 0.95];
  const dir: Record<string, Vec3> = {};
  for (const [g, k] of mapped) {
    // Only the limbs differ in rest posture (CMU: arms out, legs apart). The trunk, clavicles and
    // head keep our own rest directions, which follow this body's anatomy.
    if (!/(Arm|Hand|Leg)$/.test(g)) continue;
    const tip = bvh.joints[k].tip ?? [0, 1, 0];
    const l = Math.hypot(...tip) || 1;
    dir[g] = [tip[0] / l, tip[1] / l, tip[2] / l];
  }
  // Loops: spread the end-to-start mismatch over the cycle so the last frame meets the first.
  const seam = new Map<number, Q>();
  const seamH: Vec3 = [0, 0, 0];
  if (o.loop) {
    for (const [, k] of mapped) seam.set(k, qmul(poses[f0].world[k], qconj(poses[f1].world[k])));
    // Hips: the height, and the sideways drift when no travel is removed (chained cuts).
    seamH[1] = poses[f0].hips[1] - poses[f1].hips[1];
    if (fr >= 0) [seamH[0], seamH[2]] = [poses[f0].hips[0] - poses[f1].hips[0], poses[f0].hips[2] - poses[f1].hips[2]];
  }
  // Calibration for our wider bodies: CMU actors hold the upper arms almost vertical, the clavicles
  // a little raised and the feet close together, which presses the arms into the torso, bunches
  // the shoulders and knocks the knees.
  const bias: Record<string, Q> = {};
  const legSpread = o.legSpread ?? 4;
  for (const [side, s] of [['Left', 1], ['Right', -1]] as const) {
    bias[`${side}Arm`] = qaxis([0, 0, 1], s * 8);
    bias[`${side}Shoulder`] = qaxis([0, 0, 1], -s * 4);
    bias[`${side}UpLeg`] = qaxis([0, 0, 1], s * legSpread);
    bias[`${side}Leg`] = qaxis([0, 0, 1], s * legSpread);
    // Feet: CMU's rest foot isn't flat once its splayed rest legs come in (planted feet would roll
    // ~20 degrees onto their outer edge). Level the foot over the frames where it is planted (ankle
    // near its lowest), keeping the source's rest toe-out.
    const k = ankle[s > 0 ? 0 : 1];
    if (k < 0) continue;
    const ys = ankleY[s > 0 ? 0 : 1].slice(c0, c1 + 1);
    const lowest = Math.min(...ys);
    const up: Vec3 = [0, 0, 0];
    ys.forEach((y, n) => {
      if (y > lowest + 0.05 * leg) return;
      const u = qrot(qconj(poses[c0 + n].world[k]), [0, 1, 0]);
      for (let d = 0; d < 3; d++) up[d] += u[d];
    });
    const tip = bvh.joints[k].tip;
    const out = tip ? (Math.atan2(s * tip[0], tip[2]) * 180) / Math.PI : 0;
    bias[`${side}Foot`] = qmul(qfromTo([0, 1, 0], up), qaxis([0, 1, 0], s * out));
  }
  const idle: Record<string, Ch> = {};
  fingers(idle, 14);
  const anchor = fr >= 0
    ? {
      rot: Object.fromEntries(mapped.map(([g, k]) => [g, poses[fr].world[k]])) as Record<string, Q>,
      hips: [(poses[fr].hips[0] - q0[0]) / leg, (poses[fr].hips[1] - floor) / leg, (poses[fr].hips[2] - q0[2]) / leg] as Vec3,
      key: `${o.take ?? o.id}@${o.ref}`,
    }
    : undefined;
  return {
    id: o.id, name: o.name, category: o.category, duration, loop: o.loop,
    travel: Math.hypot(...travel) > 0.05 ? travel : undefined,
    sample: (t: number): Sample => {
      const x = f0 + Math.max(0, Math.min(duration, t)) / ft;
      const fa = Math.min(f1, Math.floor(x)), fb = Math.min(f1, fa + 1), w = x - fa;
      const A = poses[fa], B = poses[fb];
      const rot: Record<string, Q> = {};
      const tt = (fa - f0 + w) * ft;
      for (const [g, k] of mapped) {
        const q = qslerp(A.world[k], B.world[k], w);
        const c = seam.get(k);
        rot[g] = c ? qmul(qslerp([0, 0, 0, 1], c, tt / duration), q) : q;
      }
      const h = A.hips.map((v, d) => v + (B.hips[d] - v) * w);
      for (let d = 0; d < 3; d++) h[d] += (seamH[d] * tt) / duration;
      const hips: Vec3 = [(h[0] - q0[0] - vel[0] * tt - mid[0]) / leg, (h[1] - floor) / leg, (h[2] - q0[2] - vel[2] * tt - mid[2]) / leg];
      const mocap: MocapSample = { rot, dir, bias, hips, key: o.id, anchor };
      return { bones: { ...idle }, root: {}, mocap } as Sample;
    },
  };
}

/** Compact, retarget-ready motion for one clip (generated by scripts/build-mocap.ts). */
export interface MocapData {
  duration: number;
  loop: boolean;
  travel?: [number, number, number];
  /** Frames are evenly spaced from 0 to duration (inclusive). */
  frames: number;
  bones: string[];
  /** Per frame, per bone: quaternion xyzw as int16 / 32767 (base64, little-endian). */
  rot: string;
  /** Per frame: hips position in leg lengths as int16 / 10000 (base64). */
  hips: string;
  dir: Record<string, Vec3>;
  bias: Record<string, Q>;
  /** Hand pose (the capture has no fingers): relaxed (default) or closed fists. */
  hands?: 'fist';
  /** Pin the lowest foot to the floor every frame (clips whose feet stay planted, like sitting). */
  ground?: boolean;
  /** Chained cuts: the shared reference pose (bones in `bones` order, xyzw) and its group. */
  anchor?: { rot: number[]; hips: Vec3; key: string };
}

const round = (v: number[], k = 1e5) => v.map((x) => Math.round(x * k) / k);
function toBase64(a: Int16Array): string {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(s: string): Int16Array {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new Int16Array(b.buffer);
}

/** Sample a retargeted BVH clip (mocapClip) into compact data, `fps` frames per second. */
export function bakeMocap(clip: Clip, fps = 60, hands?: 'fist', ground?: boolean): MocapData {
  const n = Math.max(2, Math.round(clip.duration * fps) + 1);
  const first = clip.sample(0).mocap!;
  const bones = Object.keys(first.rot);
  const rot = new Int16Array(n * bones.length * 4), hips = new Int16Array(n * 3);
  for (let f = 0; f < n; f++) {
    const m = clip.sample((f / (n - 1)) * clip.duration).mocap!;
    bones.forEach((g, b) => {
      const q = m.rot[g], sg = q[3] < 0 ? -1 : 1;
      for (let d = 0; d < 4; d++) rot[(f * bones.length + b) * 4 + d] = Math.round(q[d] * sg * 32767);
    });
    for (let d = 0; d < 3; d++) hips[f * 3 + d] = Math.round(m.hips[d] * 10000);
  }
  return {
    duration: Math.round(clip.duration * 1e4) / 1e4, loop: clip.loop, travel: clip.travel && (round(clip.travel, 1e4) as [number, number, number]),
    frames: n, bones, rot: toBase64(rot), hips: toBase64(hips),
    dir: Object.fromEntries(Object.entries(first.dir).map(([k, v]) => [k, round(v) as Vec3])),
    bias: Object.fromEntries(Object.entries(first.bias).map(([k, v]) => [k, round(v) as Q])),
    ...(hands ? { hands } : {}),
    ...(ground ? { ground } : {}),
    ...(first.anchor ? { anchor: { rot: round(bones.flatMap((g) => first.anchor!.rot[g])), hips: round(first.anchor.hips) as Vec3, key: first.anchor.key } } : {}),
  };
}

/** A playable clip from baked data. */
export function clipFromMocap(d: MocapData, meta: { id: string; name: string; category: ClipCategory }): Clip {
  const R = fromBase64(d.rot), H = fromBase64(d.hips);
  const nb = d.bones.length, last = d.frames - 1;
  // Decoded once and renormalised (16-bit quantisation leaves them a few 1e-5 off unit length).
  const Q = new Float32Array(R.length);
  for (let i = 0; i < R.length; i += 4) {
    const l = Math.hypot(R[i], R[i + 1], R[i + 2], R[i + 3]) || 1;
    for (let k = 0; k < 4; k++) Q[i + k] = R[i + k] / l;
  }
  const q = (f: number, b: number): Q => {
    const i = (f * nb + b) * 4;
    return [Q[i], Q[i + 1], Q[i + 2], Q[i + 3]];
  };
  const unit = (v: Q): Q => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l, v[3] / l]; };
  const bias = Object.fromEntries(Object.entries(d.bias).map(([k, v]) => [k, unit(v)]));
  const anchor = d.anchor && {
    rot: Object.fromEntries(d.bones.map((g, b) => [g, unit(d.anchor!.rot.slice(b * 4, b * 4 + 4) as Q)])),
    hips: d.anchor.hips,
    key: d.anchor.key,
  };
  const idle: Record<string, Ch> = {};
  if (d.hands === 'fist') fist(idle);
  else fingers(idle, 14);
  return {
    ...meta, duration: d.duration, loop: d.loop, travel: d.travel,
    sample: (t: number): Sample => {
      const x = (Math.max(0, Math.min(d.duration, t)) / d.duration) * last;
      const fa = Math.min(last, Math.floor(x)), fb = Math.min(last, fa + 1), w = x - fa;
      const rot: Record<string, Q> = {};
      d.bones.forEach((g, b) => (rot[g] = qslerp(q(fa, b), q(fb, b), w)));
      const hips = [0, 1, 2].map((k) => (H[fa * 3 + k] + (H[fb * 3 + k] - H[fa * 3 + k]) * w) / 10000) as Vec3;
      const mocap: MocapSample = { rot, dir: d.dir, bias, hips, key: meta.id, anchor };
      return { bones: { ...idle }, root: d.ground ? { ground: true } : {}, mocap };
    },
  };
}

/** Light low-pass over +-r frames (capture noise), rotations and hips. */
function smooth(poses: { world: Q[]; hips: Vec3 }[], r: number): { world: Q[]; hips: Vec3 }[] {
  if (r < 1) return poses;
  return poses.map((P, f) => {
    const world = P.world.map((q0, k) => {
      const acc = [0, 0, 0, 0];
      for (let o = -r; o <= r; o++) {
        const q = poses[Math.max(0, Math.min(poses.length - 1, f + o))].world[k];
        const w = (r + 1 - Math.abs(o)) * (q[0] * q0[0] + q[1] * q0[1] + q[2] * q0[2] + q[3] * q0[3] < 0 ? -1 : 1);
        for (let d = 0; d < 4; d++) acc[d] += q[d] * w;
      }
      const l = Math.hypot(...acc);
      return [acc[0] / l, acc[1] / l, acc[2] / l, acc[3] / l] as Q;
    });
    const hips: Vec3 = [0, 0, 0];
    let n = 0;
    for (let o = -r; o <= r; o++) {
      const h = poses[Math.max(0, Math.min(poses.length - 1, f + o))].hips, w = r + 1 - Math.abs(o);
      for (let d = 0; d < 3; d++) hips[d] += h[d] * w;
      n += w;
    }
    return { world, hips: hips.map((v) => v / n) as Vec3 };
  });
}


