/**
 * Evaluates clips on any rig: forward kinematics in world space from an
 * "animation rest" (bind pose with relaxed arms), producing per-bone local
 * rotations and the root position. Shared by the viewer and the exporters,
 * so what you preview is exactly what gets exported.
 */
import type { Vec3 } from '../math';
import { boneFor } from '../rig/poses';
import { quatOf, type Rig } from '../rig/rig';
import { clipById, type Ch, type Clip, type HandTarget, type Sample } from './clips';
import { qaxis, qconj, qfromTo, QI, qmul, qrot, type Q, qslerp } from './quat';

export interface Frame {
  /** Local rotation per bone (relative to its parent), as exported / applied to three.js bones. */
  rot: Q[];
  /** Local position of root bones (parent = -1); other bones keep their rest offsets. */
  rootPos: Map<number, Vec3>;
  /** Facial blend-shape weights (0..1, in the character's face-shape order), when it has face shapes. */
  morph?: number[];
}

// --- Face layer ------------------------------------------------------------------------------
// Blinks and eye glances are placed at fixed times inside each clip (never across its end), so
// loops stay seamless and every export of a clip is identical.

const BLINK_LEN = 0.28;
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Closure 0..1, `u` seconds into a blink: fast close, short hold, slower open. */
const blinkCurve = (u: number) => (u < 0 || u > BLINK_LEN ? 0 : u < 0.07 ? smooth(u / 0.07) : u < 0.12 ? 1 : 1 - smooth((u - 0.12) / 0.16));
const hash1 = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Blink closure inside a clip (exports): every 3.4 s from 1.1 s, never across the clip's end. */
function blinkAt(t: number, duration: number): number {
  if (duration < 1.8) return 0;
  for (let b = 1.1; b + BLINK_LEN + 0.05 < duration; b += 3.4) {
    const w = blinkCurve(t - b);
    if (w) return w;
  }
  return 0;
}

/** Blink closure on a continuous clock (live preview): natural, slightly irregular intervals. */
function blinkLive(t: number): number {
  // Blink k happens at k * 3.6 s plus up to 1.6 s of jitter.
  const k = Math.floor(t / 3.6);
  for (const j of [k - 1, k]) {
    const w = blinkCurve(t - (j * 3.6 + hash1(j, 7) * 1.6));
    if (w) return w;
  }
  return 0;
}

/** Eye glances on a continuous clock (live preview). */
function glanceLive(t: number): [number, number] {
  const i = Math.floor(t / 1.6);
  const target = (n: number): [number, number] => [(hash1(n, 1) * 2 - 1) * 7, (hash1(n, 2) * 2 - 1) * 3];
  const f = smooth((t - i * 1.6) / 0.07);
  const a = target(i - 1), b = target(i);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** Small automatic eye glances (yaw, pitch degrees), returning to centre before the clip ends. */
function glanceAt(t: number, duration: number): [number, number] {
  if (duration < 1.8) return [0, 0];
  const hash = (i: number, k: number) => {
    const x = Math.sin(i * 127.1 + k * 311.7 + duration * 74.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const s = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const end = duration - 0.35;
  let cur: [number, number] = [0, 0], prev: [number, number] = [0, 0], start = -1;
  for (let i = 0, g = 0.6; g < end; i++, g += 1.6) {
    if (t < g) break;
    prev = cur;
    cur = [(hash(i, 1) * 2 - 1) * 7, (hash(i, 2) * 2 - 1) * 3];
    start = g;
  }
  if (t >= end) [prev, cur, start] = [cur, [0, 0], end];
  if (start < 0) return [0, 0];
  const f = s((t - start) / 0.07); // eyes move fast (saccade)
  return [prev[0] + (cur[0] - prev[0]) * f, prev[1] + (cur[1] - prev[1]) * f];
}

/** Hips height when lying on the back (metres). */
const LYING_HEIGHT = 0.12;
/** Joints checked by the `floor` option (game-rig names; fingers are left out). */
const BODY_JOINT = /^(Hips|Spine\d?|Neck|Head|(Left|Right)(Shoulder|Arm|ForeArm|Hand|UpLeg|Leg|Foot|ToeBase))$/;

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** Range of the rifle's support grip down the barrel from the pistol grip (metres; matches the rifle model). */
export const SUPPORT_MIN = 0.16, SUPPORT_MAX = 0.42;
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

export interface BakedClip {
  name: string;
  loop: boolean;
  times: number[];
  frames: Frame[];
}

export class Animator {
  readonly restLocal: Q[];
  private restOffset: Vec3[];
  /** Per finger bone: curl axis (toward the palm) in the bone's animation-rest frame. */
  private flexAxis: (Vec3 | null)[];
  /** Per side: palm normal in the hand's animation-rest frame. */
  private palmLocal = new Map<string, Vec3>();
  private idx = new Map<string, number>();
  private feet: number[];
  private restFootY: number;
  private restWorld: Q[];
  private animRest: Q[];
  private names: (string | null)[];
  private scale: number;
  /** WeaponR socket bone (-1 if the rig has none) and cached weapon fits. */
  private socket: number;
  private fits = new Map<string, { rot: Q; supportZ: number }>();

  /** `face`: the character's blend-shape names and resting (expression) weights, if it has face shapes. */
  constructor(readonly rig: Rig, readonly face?: { names: string[]; defaults: number[] }) {
    const B = rig.bones;
    this.restWorld = B.map((b) => quatOf(b.rot));
    this.restLocal = B.map((b, i) => (b.parent < 0 ? this.restWorld[i] : qmul(qconj(this.restWorld[b.parent]), this.restWorld[i])));
    // Game-rig name for each bone (so clips written against the game rig drive any skeleton).
    const gameNames = [
      'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'Jaw',
      ...['Left', 'Right'].flatMap((s) => [
        'Eye', 'Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase',
        ...['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].flatMap((f) => [1, 2, 3].map((k) => `Hand${f}${k}`)),
      ].map((n) => s + n)),
    ];
    const byBone = new Map<string, string>();
    for (const g of gameNames) {
      const b = boneFor(rig.type, g);
      if (b) byBone.set(b, g);
    }
    this.names = B.map((b) => byBone.get(b.name) ?? null);

    // Animation rest: arms lowered to a relaxed hang and elbows nearly straight
    // (MakeHuman's bind pose bends the elbows forward). Works from A- or T-pose binds.
    this.animRest = [...this.restWorld];
    const delta: (Q | null)[] = B.map(() => null);
    const dirOf = (i: number): Vec3 => {
      const b = B[i];
      return [b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]];
    };
    const armDir = new Map<string, Vec3>();
    B.forEach((b, i) => {
      const g = this.names[i];
      const inherited = b.parent >= 0 ? delta[b.parent] : null;
      if (g === 'LeftArm' || g === 'RightArm') {
        const s = g === 'LeftArm' ? 1 : -1;
        const target: Vec3 = [s * Math.sin((10 * Math.PI) / 180), -Math.cos((10 * Math.PI) / 180), 0.04];
        armDir.set(g, target);
        delta[i] = qfromTo(dirOf(i), target);
      } else if (g === 'LeftForeArm' || g === 'RightForeArm') {
        const up = armDir.get(g === 'LeftForeArm' ? 'LeftArm' : 'RightArm');
        const carried = inherited ?? QI;
        if (up) {
          // Straighten to the upper arm, keeping a natural ~10 degree forward bend.
          const now = qrot(carried, dirOf(i));
          const target: Vec3 = [up[0], up[1], up[2] + 0.18];
          delta[i] = qmul(qfromTo(now, target), carried);
        } else delta[i] = inherited;
      } else delta[i] = inherited;
      if (delta[i]) this.animRest[i] = qmul(delta[i]!, this.restWorld[i]);
    });
    let top = 0;
    for (const b of B) top = Math.max(top, b.head[1], b.tail[1]);
    this.scale = top / 1.8;
    // Bone offsets from their parent, in the parent's rest frame (for forward kinematics).
    this.restOffset = B.map((b) =>
      b.parent < 0 ? b.head : qrot(qconj(this.restWorld[b.parent]), [b.head[0] - B[b.parent].head[0], b.head[1] - B[b.parent].head[1], b.head[2] - B[b.parent].head[2]]));
    this.names.forEach((n, i) => n && this.idx.set(n, i));
    // Finger curl axes: fingers bend toward the palm. The palm side is where the thumb tip lies
    // relative to the wrist/index/pinky plane (true for A- and T-pose binds alike).
    this.flexAxis = B.map(() => null);
    for (const side of ['Left', 'Right']) {
      const hi = this.idx.get(`${side}Hand`), ii = this.idx.get(`${side}HandIndex1`), pi = this.idx.get(`${side}HandPinky1`), ti = this.idx.get(`${side}HandThumb3`);
      if (hi === undefined || ii === undefined || pi === undefined || ti === undefined) continue;
      const W = B[hi].head, I = B[ii].head, P = B[pi].head, T = B[ti].tail;
      const a: Vec3 = [I[0] - W[0], I[1] - W[1], I[2] - W[2]], b: Vec3 = [P[0] - W[0], P[1] - W[1], P[2] - W[2]];
      let n: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      if ((T[0] - W[0]) * n[0] + (T[1] - W[1]) * n[1] + (T[2] - W[2]) * n[2] < 0) n = [-n[0], -n[1], -n[2]];
      const dh = delta[hi] ?? QI;
      const nAnim = qrot(dh, n);
      this.palmLocal.set(side, norm(qrot(qconj(this.animRest[hi]), nAnim)));
      B.forEach((bone, i) => {
        if (!(this.names[i] ?? '').startsWith(`${side}Hand`) || i === hi) return;
        const d = qrot(delta[i] ?? QI, [bone.tail[0] - bone.head[0], bone.tail[1] - bone.head[1], bone.tail[2] - bone.head[2]]);
        const axis = norm([d[1] * nAnim[2] - d[2] * nAnim[1], d[2] * nAnim[0] - d[0] * nAnim[2], d[0] * nAnim[1] - d[1] * nAnim[0]]);
        this.flexAxis[i] = norm(qrot(qconj(this.animRest[i]), axis));
      });
    }
    this.feet = B.map((_, i) => i).filter((i) => /^(Left|Right)(Foot|ToeBase|Toe_End)$/.test(this.names[i] ?? '') || /^(foot|toe\d-\d)\.[LR]$/.test(B[i].name));
    this.restFootY = Math.min(...this.feet.map((i) => B[i].head[1]));
    this.socket = B.findIndex((b) => b.name === 'WeaponR');
  }

  /**
   * Fit a weapon held in the WeaponR socket to a reference frame (e.g. rifle aim):
   * returns the weapon-model -> socket rotation that makes the barrel point along the
   * chest's forward axis, and how far down the barrel the support (left) hand is.
   */
  weaponFit(f: Frame, socket: number): { rot: Q; supportZ: number } {
    const B = this.rig.bones;
    const world: Q[] = [];
    B.forEach((b, i) => (world[i] = b.parent < 0 ? f.rot[i] : qmul(world[b.parent], f.rot[i])));
    const pos = this.positions(f);
    const chest = this.idx.get('Spine2') ?? this.idx.get('Spine1') ?? 0;
    const cd = qmul(world[chest], qconj(this.animRest[chest]));
    const rot = qmul(qconj(world[socket]), cd);
    const lh = this.idx.get('LeftHand');
    const supportZ = lh !== undefined ? qrot(qconj(cd), sub3(pos[lh], pos[socket]))[2] : 0.3;
    return { rot, supportZ };
  }

  /** World-space joint positions for a frame (forward kinematics). */
  positions(f: Frame): Vec3[] {
    const B = this.rig.bones;
    const world: Q[] = [], pos: Vec3[] = [];
    B.forEach((b, i) => {
      if (b.parent < 0) {
        world[i] = f.rot[i];
        pos[i] = f.rootPos.get(i) ?? b.head;
      } else {
        world[i] = qmul(world[b.parent], f.rot[i]);
        const o = qrot(world[b.parent], this.restOffset[i]);
        pos[i] = [pos[b.parent][0] + o[0], pos[b.parent][1] + o[1], pos[b.parent][2] + o[2]];
      }
    });
    return pos;
  }

  /** Bind pose (no animation). */
  bind(): Frame {
    const rootPos = new Map<number, Vec3>();
    this.rig.bones.forEach((b, i) => b.parent < 0 && rootPos.set(i, b.head));
    return { rot: [...this.restLocal], rootPos };
  }

  /**
   * `faceTime`: blink and glance on this continuous clock (seconds) instead of at fixed times inside
   * the clip. The live preview uses it so every clip blinks, as a game layering a face would.
   */
  frame(clip: Clip, time: number, opts: { rootMotion?: boolean; noSupport?: boolean; faceTime?: number } = {}): Frame {
    const s = this.withEyes(clip.sample(time), clip, time, opts.faceTime);
    const frame = this.frameOf(s, clip, time, opts);
    if (this.face) frame.morph = this.faceWeights(s, clip, time, opts.faceTime);
    return frame;
  }

  /** The resting face (expression + live blinks) for the bind pose, on a continuous clock. */
  restFace(faceTime: number): number[] | undefined {
    if (!this.face) return undefined;
    return this.faceWeights({ bones: {}, root: {} }, { id: '', name: '', category: 'Emotes', duration: 0, loop: true, sample: () => ({ bones: {}, root: {} }) }, 0, faceTime);
  }

  /** Eye bones follow the clip's gaze, or small automatic glances. */
  private withEyes(s: Sample, clip: Clip, time: number, faceTime?: number): Sample {
    if (this.idx.get('LeftEye') === undefined) return s;
    const [yaw, pitch] = s.gaze ?? (faceTime !== undefined ? glanceLive(faceTime) : glanceAt(time, clip.duration));
    if (!yaw && !pitch) return s;
    // Eye bones point forward (+Y): +X tilts the gaze up, +Z turns it to the character's left.
    const ch: Ch = [pitch, 0, yaw];
    return { ...s, bones: { ...s.bones, LeftEye: ch, RightEye: [ch[0], -ch[1], ch[2]] as Ch } };
  }

  /** Blend-shape weights: expression + the clip's face + blinks (a blink overrides wide/squinting eyes). */
  private faceWeights(s: Sample, clip: Clip, time: number, faceTime?: number): number[] {
    const f = this.face!;
    const blink = faceTime !== undefined ? blinkLive(faceTime) : blinkAt(time, clip.duration);
    return f.names.map((n, i) => {
      let w = f.defaults[i] + (s.face?.[n] ?? 0);
      if (blink) {
        if (n === 'eyeBlinkLeft' || n === 'eyeBlinkRight') w = w + (1 - w) * blink;
        else if (/^eye(Wide|Squint)/.test(n)) w *= 1 - blink;
      }
      return Math.min(1, Math.max(0, w));
    });
  }

  private frameOf(s: Sample, clip: Clip, time: number, opts: { rootMotion?: boolean; noSupport?: boolean }): Frame {
    if (s.blend && s.blend.w > 0) {
      const w = Math.min(1, s.blend.w);
      const a = this.frameOf({ ...s, blend: undefined }, clip, time, opts), b = this.frameOf(s.blend.sample, clip, time, opts);
      const rootPos = new Map<number, Vec3>();
      for (const [i, p] of a.rootPos) {
        const q = b.rootPos.get(i) ?? p;
        rootPos.set(i, [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w, p[2] + (q[2] - p[2]) * w]);
      }
      return { ...a, rot: a.rot.map((r, i) => qslerp(r, b.rot[i], w)), rootPos };
    }
    const left = s.ik?.Left;
    if (left?.support && !opts.noSupport && this.socket >= 0) {
      // Two passes: solve without the support hand, see where the weapon ended up, then
      // put the support hand on it.
      const first = this.solve({ ...s, ik: { ...s.ik, Left: undefined } }, clip, time, opts);
      s = { ...s, ik: { ...s.ik, Left: this.supportTarget(left, first.world, first.pos) } };
    }
    return this.solve(s, clip, time, opts).frame;
  }

  /** Socket-space fit of a weapon to its reference aiming clip (cached): see weaponFit. */
  fitFor(kind: 'rifle' | 'pistol'): { rot: Q; supportZ: number } {
    let f = this.fits.get(kind);
    if (!f) {
      const ref = clipById.get(kind === 'rifle' ? 'rifle_aim' : 'pistol_aim')!;
      const raw = this.solve(ref.sample(0), ref, 0, {});
      f = this.weaponFit(raw.frame, this.socket);
      // Handguard where this body's support arm comfortably reaches it in the aim pose
      // (same clamp as the rifle model).
      f.supportZ = Math.min(SUPPORT_MAX, Math.max(SUPPORT_MIN, f.supportZ));
      if (kind === 'rifle') f.supportZ = this.reachableZ(f.rot, raw.world, raw.pos, f.supportZ, SUPPORT_MIN, 0.93);
      this.fits.set(kind, f);
    }
    return f;
  }

  /** Support-hand IK target (chest space) on the rifle's handguard, from the solved weapon pose. */
  private supportTarget(t: HandTarget, world: Q[], pos: Vec3[]): HandTarget {
    const fit = this.fitFor('rifle');
    const k = this.scale;
    const sw = qmul(world[this.socket], fit.rot); // weapon frame -> world
    const at = (p: Vec3): Vec3 => add3(pos[this.socket], qrot(sw, p));
    // Weapon frame: +Z down the barrel, +Y up. Palm under the handguard (bottom at y ~0.036),
    // fingers forward and wrapping up its far side.
    const dirW = norm(qrot(sw, [-0.35, 0.2, 0.91]));
    const palmW = norm(qrot(sw, [0, 1, 0]));
    // If this pose puts the handguard out of reach, slide the hand back along it (it is ~30 cm long).
    const z = this.reachableZ(fit.rot, world, pos, fit.supportZ, fit.supportZ - 0.12, 0.96);
    const C = at([0, 0.033, z]);
    const wrist: Vec3 = [0, 1, 2].map((d) => C[d] - dirW[d] * 0.05 * k - palmW[d] * 0.02 * k) as Vec3;
    const { cd, origin } = this.chestSpace(world, pos);
    const inv = qconj(cd);
    return { ...t, pos: qrot(inv, sub3(wrist, origin)).map((x) => x / k) as Vec3, dir: qrot(inv, dirW), palm: qrot(inv, palmW) };
  }

  /**
   * Largest distance down the barrel (<= zMax, >= zMin) at which the support hand's wrist
   * is within `margin` of the left arm's full reach.
   */
  private reachableZ(fitRot: Q, world: Q[], pos: Vec3[], zMax: number, zMin: number, margin: number): number {
    const B = this.rig.bones;
    const arm = this.idx.get('LeftArm'), fore = this.idx.get('LeftForeArm'), hand = this.idx.get('LeftHand');
    if (arm === undefined || fore === undefined || hand === undefined) return zMax;
    const reach = (dist(B[fore].head, B[arm].head) + dist(B[hand].head, B[fore].head)) * margin;
    const k = this.scale;
    const sw = qmul(world[this.socket], fitRot);
    const dirW = norm(qrot(sw, [-0.35, 0.2, 0.91])), palmW = norm(qrot(sw, [0, 1, 0]));
    for (let z = zMax; z > zMin; z -= 0.005) {
      const C = add3(pos[this.socket], qrot(sw, [0, 0.033, z]));
      const w: Vec3 = [0, 1, 2].map((d) => C[d] - dirW[d] * 0.05 * k - palmW[d] * 0.02 * k) as Vec3;
      if (dist(w, pos[arm]) <= reach) return z;
    }
    return zMin;
  }

  private mocapRests = new Map<string, Q>();
  private mocapGrounds = new Map<string, number>();
  /** Grounding key: per clip, or shared by chained cuts. */
  private groundKey = (m: NonNullable<Sample['mocap']>) => m.anchor?.key ?? m.key;
  private mocapGround(m: NonNullable<Sample['mocap']>, clip: Clip): number {
    const key = this.groundKey(m);
    let g = this.mocapGrounds.get(key);
    if (g === undefined) {
      this.mocapGrounds.set(key, 0);
      let low = Infinity;
      if (m.anchor) {
        // Chained cuts: the reference pose (feet planted) touches the floor.
        const { pos } = this.solve({ bones: {}, root: {}, mocap: { ...m, rot: m.anchor.rot, hips: m.anchor.hips } }, clip, 0, {});
        for (const i of this.feet) low = Math.min(low, pos[i][1]);
      } else
        for (let n = 0; n <= 120; n++) {
          const t = (n / 120) * clip.duration;
          const { pos } = this.solve(clip.sample(t), clip, t, {});
          for (const i of this.feet) low = Math.min(low, pos[i][1]);
        }
      g = this.feet.length ? this.restFootY - low : 0;
      this.mocapGrounds.set(key, g);
    }
    return g;
  }
  /**
   * Rest alignment for a motion-captured bone: our animation-rest bone swung onto the source's rest
   * direction, so source rotations (relative to its rest) can be applied directly.
   */
  private mocapRest(m: NonNullable<Sample['mocap']>, g: string, i: number): Q {
    const key = `${m.key}|${g}`;
    let r = this.mocapRests.get(key);
    if (!r) {
      const t = this.animRest[i];
      const d = qrot(t, [0, 1, 0]);
      r = qmul(m.bias[g] ?? QI, qmul(qfromTo(d, m.dir[g] ?? d), t));
      this.mocapRests.set(key, r);
    }
    return r;
  }

  /** Chest frame (rotation from the animation rest) and the IK origin at the base of the neck. */
  private chestSpace(world: Q[], pos: Vec3[]): { cd: Q; origin: Vec3 } {
    const B = this.rig.bones;
    const chest = this.idx.get('Spine2') ?? this.idx.get('Spine1') ?? 0;
    const cd = qmul(world[chest], qconj(this.animRest[chest]));
    const neck = this.idx.get('Neck');
    const nOff = neck !== undefined ? qrot(qconj(this.restWorld[chest]), sub3(B[neck].head, B[chest].head)) : [0, 0, 0] as Vec3;
    const no = qrot(world[chest], nOff);
    return { cd, origin: [pos[chest][0] + no[0], pos[chest][1] + no[1], pos[chest][2] + no[2]] };
  }

  private solve(s: Sample, clip: Clip, time: number, opts: { rootMotion?: boolean }): { frame: Frame; world: Q[]; pos: Vec3[] } {
    const B = this.rig.bones;
    const world: Q[] = new Array(B.length);
    const pos: Vec3[] = new Array(B.length);
    const rot: Q[] = new Array(B.length);
    const rootPos = new Map<number, Vec3>();
    const r = s.root;
    const k = this.scale;
    const rootRot = qmul(qaxis([0, 1, 0], r.yaw ?? 0), qaxis([1, 0, 0], r.pitch ?? 0));
    const ikDone: Record<string, { T: Vec3 } | undefined> = {};
    // Motion capture: its floor offset is needed while solving (toes), so it's settled first.
    const mocapShift = s.mocap ? this.mocapGround(s.mocap, clip) : 0;
    B.forEach((b, i) => {
      const g = this.names[i];
      const ch: Ch | undefined = g ? s.bones[g] : undefined;
      // Local channel rotation in the bone's own (animation-rest) frame: X flex, Y twist, Z side.
      // Fingers flex about their palm-facing curl axis instead of local X.
      let chq = QI;
      if (ch) {
        const flex = this.flexAxis[i] ? qaxis(this.flexAxis[i]!, ch[0]) : qaxis([1, 0, 0], ch[0]);
        chq = qmul(qmul(qaxis([0, 0, 1], ch[2]), qaxis([0, 1, 0], ch[1])), flex);
      }
      const base = qmul(this.animRest[i], chq);
      const mc = s.mocap && g ? s.mocap.rot[g] : undefined;
      if (mc) {
        // Motion capture: the source's world rotation applied to this bone's rest alignment.
        world[i] = qmul(mc, this.mocapRest(s.mocap!, g!, i));
        if (b.parent < 0) {
          const H = b.head[1];
          const h = s.mocap!.hips;
          const tr = opts.rootMotion && clip.travel ? clip.travel.map((v) => v * time * k) : [0, 0, 0];
          pos[i] = [b.head[0] + h[0] * H + tr[0], h[1] * H, b.head[2] + h[2] * H + tr[2]];
          rootPos.set(i, pos[i]);
        } else {
          const o = qrot(world[b.parent], this.restOffset[i]);
          const p = pos[b.parent];
          pos[i] = [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
        }
      } else if (b.parent < 0) {
        world[i] = qmul(rootRot, base);
        const drop = (r.drop ?? 0) * (LYING_HEIGHT - b.head[1]);
        const tr = opts.rootMotion && clip.travel ? clip.travel.map((v) => v * time * k) : [0, 0, 0];
        pos[i] = [b.head[0] + (r.x ?? 0) * k + tr[0], b.head[1] + (r.y ?? 0) * k + drop + tr[1], b.head[2] + (r.z ?? 0) * k + tr[2]];
        rootPos.set(i, pos[i]);
      } else {
        world[i] = qmul(qmul(world[b.parent], qconj(this.animRest[b.parent])), base);
        const o = qrot(world[b.parent], this.restOffset[i]);
        const p = pos[b.parent];
        pos[i] = [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
      }
      if (s.mocap && (g === 'LeftToeBase' || g === 'RightToeBase')) {
        // Toes bend at the ball of the foot instead of pushing their tips into the floor when the
        // heel lifts (the capture's toes are too noisy to use).
        const len = Math.hypot(b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]);
        const floor = b.tail[1] - mocapShift;
        const d = qrot(world[i], [0, 1, 0]);
        if (pos[i][1] + d[1] * len < floor) {
          const dy = Math.max(-1, Math.min(1, (floor - pos[i][1]) / len));
          const h = Math.hypot(d[0], d[2]) || 1;
          const k = Math.sqrt(1 - dy * dy) / h;
          world[i] = qmul(qfromTo(d, [d[0] * k, dy, d[2] * k]), world[i]);
        }
      }
      if (s.ik && g) this.solveIK(s, g, i, world, pos, ikDone);
      if (s.thumbs && g) this.wrapThumb(s, g, i, world, pos);
    });
    B.forEach((b, i) => (rot[i] = b.parent < 0 ? world[i] : qmul(qconj(world[b.parent]), world[i])));
    if (s.mocap) {
      // Motion capture keeps its own hips height; one offset per clip puts its lowest step on the floor.
      for (const [i, p] of rootPos) rootPos.set(i, [p[0], p[1] + mocapShift, p[2]]);
      for (const p of pos) p[1] += mocapShift;
    }
    if (r.ground || r.lift) {
      // Shift the root so the lowest foot rests on the floor.
      const low = this.feet.length ? Math.min(...this.feet.map((i) => pos[i][1])) : this.restFootY;
      const shift = (r.ground ? this.restFootY - low : 0) + (r.lift ?? 0) * k;
      for (const [i, p] of rootPos) rootPos.set(i, [p[0], p[1] + shift, p[2]]);
      for (const p of pos) p[1] += shift;
    }
    if (r.floor) {
      // Joints sit inside the body: keep hands and feet ~4 cm and the trunk, head and limbs ~7 cm
      // clear of the floor (scaled to the body), lifting the whole body only if something is lower.
      let need = 0;
      this.names.forEach((n, i) => {
        if (!n || !BODY_JOINT.test(n)) return;
        const clear = (/(Hand|Foot|ToeBase)$/.test(n) ? 0.04 : 0.07) * k;
        need = Math.max(need, clear - pos[i][1]);
      });
      if (need > 0) {
        for (const [i, p] of rootPos) rootPos.set(i, [p[0], p[1] + need, p[2]]);
        for (const p of pos) p[1] += need;
      }
    }
    return { frame: { rot, rootPos }, world, pos };
  }

  /** Fist thumb: aim the thumb across the front of the index/middle fingers. */
  private wrapThumb(s: Sample, g: string, i: number, world: Q[], pos: Vec3[]) {
    const m = /^(Left|Right)HandThumb1$/.exec(g);
    if (!m) return;
    const side = m[1] as 'Left' | 'Right';
    const amt = s.thumbs![side] ?? 0;
    const hi = this.idx.get(`${side}Hand`), ii = this.idx.get(`${side}HandIndex1`), mi = this.idx.get(`${side}HandMiddle1`);
    const t3 = this.idx.get(`${side}HandThumb3`);
    const pl = this.palmLocal.get(side);
    if (!amt || hi === undefined || ii === undefined || mi === undefined || t3 === undefined || !pl) return;
    const B = this.rig.bones;
    // Finger bases follow the hand rigidly (metacarpals don't animate).
    const at = (k: number): Vec3 => {
      const o = qrot(world[hi], qrot(qconj(this.restWorld[hi]), sub3(B[k].head, B[hi].head)));
      return [pos[hi][0] + o[0], pos[hi][1] + o[1], pos[hi][2] + o[2]];
    };
    const I = at(ii), M = at(mi);
    const n = qrot(world[hi], pl);
    const f = norm(sub3(M, pos[hi]));
    const k = this.scale;
    // Over the middle phalanges of the curled index/middle fingers, in front of the palm.
    const T: Vec3 = [0, 1, 2].map((d) => I[d] * 0.6 + M[d] * 0.4 + n[d] * 0.032 * k + f[d] * 0.012 * k) as Vec3;
    const chain = qrot(qconj(this.restWorld[i]), sub3(B[t3].tail, B[i].head));
    const q = qfromTo(qrot(world[i], chain), sub3(T, pos[i]));
    // Partial wrap: scale the rotation angle.
    const ang = 2 * Math.acos(Math.min(1, Math.abs(q[3]))) * amt;
    const sn = Math.sqrt(Math.max(1e-12, 1 - q[3] * q[3]));
    const sgn = q[3] < 0 ? -1 : 1;
    const axis: Vec3 = [(q[0] / sn) * sgn, (q[1] / sn) * sgn, (q[2] / sn) * sgn];
    world[i] = qmul(qaxis(axis, (ang * 180) / Math.PI), world[i]);
  }

  /** Two-bone arm IK + hand orientation, applied as the FK pass reaches Arm / ForeArm / Hand. */
  private solveIK(s: Sample, g: string, i: number, world: Q[], pos: Vec3[], done: Record<string, { T: Vec3 } | undefined>) {
    const m = /^(Left|Right)(Arm|ForeArm|Hand)$/.exec(g);
    if (!m) return;
    const side = m[1] as 'Left' | 'Right', part = m[2];
    const t = s.ik![side];
    if (!t) return;
    const B = this.rig.bones;
    // Origin: base of the neck (just above the shoulder line), carried by the chest bone.
    const chest = this.chestSpace(world, pos);
    const { cd, origin } = t.space === 'floor' ? { cd: QI, origin: [0, 0, 0] as Vec3 } : chest;
    const toWorld = (v: Vec3) => qrot(cd, v);
    const fore = this.idx.get(`${side}ForeArm`)!, hand = this.idx.get(`${side}Hand`)!;
    if (part === 'Arm') {
      const S = pos[i];
      const tp = toWorld(t.pos.map((x) => x * this.scale) as Vec3);
      const T: Vec3 = [origin[0] + tp[0], origin[1] + tp[1], origin[2] + tp[2]];
      const L1 = dist(B[fore].head, B[i].head), L2 = dist(B[hand].head, B[fore].head);
      let d = dist(T, S);
      const dir = norm(sub3(T, S));
      d = Math.min(Math.max(d, Math.abs(L1 - L2) + 1e-4), (L1 + L2) * 0.9999);
      const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const P = toWorld(t.pole);
      const pd = P[0] * dir[0] + P[1] * dir[1] + P[2] * dir[2];
      const perp = norm([P[0] - dir[0] * pd, P[1] - dir[1] * pd, P[2] - dir[2] * pd]);
      const E: Vec3 = [S[0] + dir[0] * a + perp[0] * h, S[1] + dir[1] * a + perp[1] * h, S[2] + dir[2] * a + perp[2] * h];
      const chain = qrot(qconj(this.restWorld[i]), sub3(B[fore].head, B[i].head)); // elbow in the arm's local frame
      const cur = qrot(world[i], chain);
      const upper = norm(sub3(E, S));
      world[i] = qmul(qfromTo(cur, upper), world[i]);
      // Twist the upper arm about its own axis so its "front" (+Z, the side the elbow flexes
      // toward) faces the wrist: the elbow then bends like a hinge instead of sideways.
      const fw = sub3(T, E);
      const fk = fw[0] * upper[0] + fw[1] * upper[1] + fw[2] * upper[2];
      const want: Vec3 = [fw[0] - upper[0] * fk, fw[1] - upper[1] * fk, fw[2] - upper[2] * fk];
      if (Math.hypot(...want) > 1e-4) {
        const z = qrot(world[i], [0, 0, 1]);
        const zk = z[0] * upper[0] + z[1] * upper[1] + z[2] * upper[2];
        world[i] = qmul(qfromTo(norm([z[0] - upper[0] * zk, z[1] - upper[1] * zk, z[2] - upper[2] * zk]), norm(want)), world[i]);
      }
      done[side] = { T: [S[0] + dir[0] * d, S[1] + dir[1] * d, S[2] + dir[2] * d] };
    } else if (part === 'ForeArm' && done[side]) {
      // pos[i] is now the elbow (its parent, the upper arm, was aimed at it).
      const chain = qrot(qconj(this.restWorld[i]), sub3(B[hand].head, B[i].head));
      const cur = qrot(world[i], chain);
      world[i] = qmul(qfromTo(cur, sub3(done[side]!.T, pos[i])), world[i]);
    } else if (part === 'Hand' && t.dir) {
      const dirW = norm(toWorld(t.dir));
      const y = qrot(world[i], [0, 1, 0]);
      let w = qmul(qfromTo(y, dirW), world[i]);
      const pl = this.palmLocal.get(side);
      if (pl && t.palm) {
        const want = toWorld(t.palm);
        const proj = (v: Vec3) => {
          const k = v[0] * dirW[0] + v[1] * dirW[1] + v[2] * dirW[2];
          return norm([v[0] - dirW[0] * k, v[1] - dirW[1] * k, v[2] - dirW[2] * k]);
        };
        w = qmul(qfromTo(proj(qrot(w, pl)), proj(want)), w);
      }
      world[i] = w;
    }
  }

  /** Frames sampled at `fps` over the clip (inclusive end), quaternion signs kept continuous. */
  bake(clip: Clip, fps = 30, opts: { rootMotion?: boolean } = {}): { times: number[]; frames: Frame[] } {
    const n = Math.max(2, Math.round(clip.duration * fps) + 1);
    const times: number[] = [], frames: Frame[] = [];
    for (let f = 0; f < n; f++) {
      const t = Math.min(clip.duration, f / fps);
      const fr = this.frame(clip, t, opts);
      if (frames.length) {
        const prev = frames[frames.length - 1];
        fr.rot = fr.rot.map((q, i) => {
          const p = prev.rot[i];
          return p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3] < 0 ? [-q[0], -q[1], -q[2], -q[3]] : q;
        });
      }
      times.push(t);
      frames.push(fr);
    }
    return { times, frames };
  }
}
