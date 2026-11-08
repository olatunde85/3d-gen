/**
 * Gunshot reactions: shot in the head, chest, back or stomach (falling dead), in the leg (down on one knee) and in
 * the arm (staying on the feet). Each clip lists its wounds, so a viewer can add blood where and when the bullet
 * lands (see props/blood.ts). The deaths fall through the unarmed deaths and end in exactly their poses, so the
 * matching Get up follows.
 */
import type { Ch, Clip, HandTarget, Sample, Wound } from './types';
import { fingers, side, smoother, track, v } from './helpers';
import { deathBackward, deathForward } from './reactions';

const keys = (T: number[], t: number) => (vals: number[]) => track(T, vals)(t);

/** Adds `ch` (left-handed channels; right bones are mirrored like `side()`) to a bone of `out`. */
function add(out: Record<string, Ch>, bone: string, ch: Ch) {
  const m: Ch = bone.startsWith('Right') ? [ch[0], -ch[1], -ch[2]] : ch, b = out[bone] ?? [0, 0, 0];
  out[bone] = [b[0] + m[0], b[1] + m[1], b[2] + m[2]];
}

/**
 * A death through `base` (Death fall forward or backward): `at(t)` is the time in the base clip, and `layer(t)` adds
 * the reaction on top (impact, clutching the wound, buckling) and must fade to nothing before the end, so the clip
 * ends in the base clip's final pose.
 */
function shotDeath(base: Clip, id: string, name: string, duration: number, wounds: Wound[], at: (t: number) => number,
  layer: (t: number, out: Record<string, Ch>, root: Sample['root']) => Pick<Sample, 'ik' | 'ikWeight'> | void): Clip {
  return {
    id, name, category: 'Combat', duration, loop: false, wounds,
    sample: (t) => {
      const s = base.sample(at(t)), bones = { ...s.bones }, root = { ...s.root };
      const extra = layer(t, bones, root) ?? {};
      return { ...s, bones, root, ...extra, gaze: [0, 0] };
    },
  };
}

// Hands pressed on a wound (chest space, see HandTarget), fingers spread over it.
const CHEST_R: HandTarget = { pos: v(-0.05, -0.2, 0.17), pole: v(-1, -0.6, 0), dir: v(0.9, 0.2, 0.3), palm: v(0, 0, -1) };
const STOMACH_L: HandTarget = { pos: v(0.06, -0.42, 0.16), pole: v(1, -0.5, 0), dir: v(-0.85, -0.3, 0.4), palm: v(0, 0, -1) };
const STOMACH_R: HandTarget = { pos: v(-0.08, -0.36, 0.17), pole: v(-1, -0.5, 0), dir: v(0.85, -0.3, 0.4), palm: v(0, 0, -1) };
const ARM_L: HandTarget = { pos: v(-0.14, -0.19, 0.2), pole: v(0.4, -0.5, 1), dir: v(-1, -0.1, -0.25), palm: v(-0.25, 0, -1) };

/** Shot in the head from the front: the head snaps back and the body drops straight away, falling backward. */
const shotHead = shotDeath(deathBackward, 'shot_head', 'Shot in the head', 1.5, [{ t: 0.05, bone: 'Head', dir: v(0, 0.05, -1), pool: 1.2 }],
  (t) => track([0, 0.05, 1.5], [0, 0.02, 1.8])(t),
  (t, out) => {
    const snap = keys([0, 0.05, 0.12, 0.45, 0.9], t)([0, 0, 1, 0.3, 0]);
    add(out, 'Head', [-34 * snap, 0, 0]);
    add(out, 'Neck', [-16 * snap, 0, 0]);
    add(out, 'Spine1', [-8 * snap, 0, 0]);
    fingers(out, 20);
  });

/**
 * Shot in the chest from the front: the chest is punched back, the right hand goes to the wound, a step back, then
 * the knees go and the body falls backward.
 */
const shotChest = shotDeath(deathBackward, 'shot_chest', 'Shot in the chest', 2.6, [{ t: 0.06, bone: 'Spine2', dir: v(0, 0, -1), pool: 2.2 }],
  (t) => Math.max(0, Math.min(1.8, t - 0.8)),
  (t, out, root) => {
    const k = keys([0, 0.06, 0.16, 0.45, 0.8, 1.2, 1.6], t);
    const jolt = k([0, 0, 1, 0.35, 0.3, 0.1, 0]), step = k([0, 0, 0.5, 1, 0.8, 0.3, 0]);
    add(out, 'Spine', [-14 * jolt + 6 * step, 0, 0]);
    add(out, 'Spine1', [-10 * jolt + 6 * step, 0, 0]);
    add(out, 'Head', [-14 * jolt + 10 * step, 0, 0]);
    add(out, 'RightUpLeg', [-16 * step, 0, 0]);
    add(out, 'RightLeg', [-14 * step, 0, 0]);
    add(out, 'LeftArm', [20 * jolt, 0, 18 * jolt]);
    root.z = (root.z ?? 0) - 0.12 * k([0, 0, 0.4, 1, 1, 1, 1]) * (1 - smoother((t - 1.2) / 0.8));
    fingers(out, 18);
    return { ik: { Right: CHEST_R }, ikWeight: { Right: smoother((t - 0.12) / 0.25) * (1 - smoother((t - 1.25) / 0.45)) } };
  });

/** Shot in the back: the back arches, the arms fly back, a stumble forward and a fall face down. */
const shotBack = shotDeath(deathForward, 'shot_back', 'Shot in the back', 1.9, [{ t: 0.05, bone: 'Spine2', dir: v(0, 0, 1), pool: 1.6 }],
  (t) => track([0, 0.25, 1.9], [0, 0, 1.7])(t),
  (t, out) => {
    const arch = keys([0, 0.05, 0.14, 0.4, 0.8], t)([0, 0, 1, 0.5, 0]);
    add(out, 'Spine', [-16 * arch, 0, 0]);
    add(out, 'Spine1', [-12 * arch, 0, 0]);
    add(out, 'Neck', [-10 * arch, 0, 0]);
    add(out, 'Head', [-16 * arch, 0, 0]);
    add(out, 'LeftArm', [-30 * arch, 0, 20 * arch]);
    add(out, 'RightArm', [-30 * arch, 0, 20 * arch]);
    add(out, 'LeftForeArm', [-8 * arch, 0, 0]);
    add(out, 'RightForeArm', [-8 * arch, 0, 0]);
    fingers(out, 20);
  });

/**
 * Shot in the stomach from the front: doubled over with both hands on the wound, sinking slowly to the knees, then
 * falling forward.
 */
const shotStomach = shotDeath(deathForward, 'shot_stomach', 'Shot in the stomach', 2.8, [{ t: 0.06, bone: 'Spine', dir: v(0, 0, -1), pool: 2.4 }],
  (t) => track([0, 0.3, 1.5, 2.8], [0, 0.08, 0.5, 1.7])(t),
  (t, out) => {
    const k = keys([0, 0.06, 0.18, 0.5, 1.4, 1.8, 2.2], t);
    const fold = k([0, 0, 1, 0.9, 1, 0.4, 0]), jolt = k([0, 0, 1, 0.2, 0, 0, 0]);
    add(out, 'Spine', [16 * fold - 8 * jolt, 0, 0]);
    add(out, 'Spine1', [14 * fold, 0, 0]);
    add(out, 'Neck', [8 * fold, 0, 0]);
    add(out, 'Head', [10 * fold, 0, 0]);
    fingers(out, 16);
    const w = smoother((t - 0.12) / 0.3) * (1 - smoother((t - 1.5) / 0.4));
    return { ik: { Left: STOMACH_L, Right: STOMACH_R }, ikWeight: { Left: w, Right: w } };
  });

/** Shot in the left thigh: the leg gives way onto the left knee, a hand on the wound, and the character stays down. */
const shotLeg: Clip = {
  id: 'shot_leg', name: 'Shot in the leg', category: 'Combat', duration: 1.8, loop: false, wounds: [{ t: 0.05, bone: 'LeftUpLeg', dir: v(0, 0, -1) }],
  sample: (t) => {
    const k = keys([0, 0.05, 0.16, 0.5, 0.75, 1.1, 1.8], t);
    const kneel = k([0, 0, 0.15, 0.85, 1, 1, 1]), jolt = k([0, 0, 1, 0.4, 0.2, 0, 0]);
    const out: Record<string, Ch> = {};
    // Left knee down on the floor under the hip, right foot forward and planted.
    side(out, 'UpLeg', [-6 * kneel + 10 * jolt, 0, 4 * kneel], [72 * kneel, 0, 6 * kneel]);
    side(out, 'Leg', [-104 * kneel, 0, 0], [-84 * kneel, 0, 0]);
    side(out, 'Foot', [-30 * kneel, 0, 0], [14 * kneel, 0, 0]);
    out.Spine = [26 * kneel + 8 * jolt, 0, 0];
    out.Spine1 = [12 * kneel, 0, 0];
    out.Neck = [10 * kneel, 0, 0];
    out.Head = [12 * kneel - 8 * jolt, 0, 0];
    fingers(out, 18);
    // The left hand presses the wound; the right forearm rests across the raised right knee with the hand hanging in
    // front of it, clear of every body's knee, so neither arm crosses the body.
    const w = smoother((t - 0.15) / 0.4);
    const wound: HandTarget = { space: 'floor', pos: v(0.14, 0.44, 0.17), pole: v(1, 0, -0.2), dir: v(-0.1, -1, 0.15), palm: v(0, 0, -1) };
    const knee: HandTarget = { space: 'floor', pos: v(-0.13, 0.55, 0.58), pole: v(-0.6, 0.3, -1), dir: v(0, -1, 0.15), palm: v(0, 0.15, -1) };
    return { bones: out, root: { ground: true, floor: true, drop: 0.36 * kneel }, ik: { Left: wound, Right: knee }, ikWeight: { Left: w, Right: w }, gaze: [0, -10] };
  },
};

/** Shot in the right arm: spun back by the impact, a step back, the left hand clamped on the wound, still standing. */
const shotArm: Clip = {
  id: 'shot_arm', name: 'Shot in the arm', category: 'Combat', duration: 1.4, loop: false, wounds: [{ t: 0.05, bone: 'RightArm', dir: v(0, 0, -1) }],
  sample: (t) => {
    const k = keys([0, 0.05, 0.14, 0.4, 0.8, 1.4], t);
    const jolt = k([0, 0, 1, 0.5, 0.25, 0.2]), hunch = k([0, 0, 0.2, 0.7, 1, 1]), step = k([0, 0, 0.6, 1, 0.3, 0]);
    const out: Record<string, Ch> = {};
    out.Spine = [6 * hunch, -12 * jolt, 0];
    out.Spine1 = [6 * hunch - 6 * jolt, -16 * jolt, -6 * jolt];
    out.Neck = [4 * hunch, 6 * jolt, 0];
    out.Head = [8 * hunch, 10 * jolt, 8 * hunch];
    side(out, 'Shoulder', [0, 0, 0], [0, 0, -10 * jolt + 8 * hunch]);
    side(out, 'Arm', [0, 0, 3], [-20 * jolt + 30 * hunch, 0, 4 + 10 * jolt - 2 * hunch]);
    side(out, 'ForeArm', [12, 0, 0], [12 + 30 * hunch, 0, 0]);
    side(out, 'UpLeg', [0, 0, 0], [-12 * step, 0, 2 * step]);
    side(out, 'Leg', [-3, 0, 0], [-3 - 18 * step, 0, 0]);
    fingers(out, 16);
    return { bones: out, root: { ground: true, z: -0.05 * k([0, 0, 0.6, 1, 1, 1]) }, ik: { Left: ARM_L }, ikWeight: { Left: smoother((t - 0.15) / 0.3) }, gaze: [-12, -6] };
  },
};

export const GUNSHOT: Clip[] = [shotHead, shotChest, shotBack, shotStomach, shotLeg, shotArm];
