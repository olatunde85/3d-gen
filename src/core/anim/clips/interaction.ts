/** Everyday interactions. Targets are metres at 1.8 m; games supply the object and door. */
import type { Ch, Clip, HandTarget, Sample } from './types';
import { fingers, grip, lerp3, side, smoother, track, v } from './helpers';
import { idle } from './basic';
import { MOCAP_DATA } from './mocap-data';
import { clipFromMocap } from '../mocap';

/** Blend the reach in/out from the same relaxed pose, rather than snapping the arms into IK. */
function fromRest(s: Sample, t: number, duration: number, out = true): Sample {
  const w = Math.min(smoother(t / 0.45), out ? smoother((duration - t) / 0.5) : 1);
  return w < 1 ? { ...s, blend: { sample: idle.sample(0), w: 1 - w } } : s;
}

/** Wrists at the sides of a roughly 40 cm box; fingers forward, palms inward. */
function carryHands(): NonNullable<Sample['ik']> {
  const hand = (s: 1 | -1): HandTarget => ({
    pos: v(0.23 * s, -0.43, 0.34), pole: v(s, -0.65, -0.4),
    dir: v(0, 0, 1), palm: v(-s, 0, 0),
  });
  return { Left: hand(1), Right: hand(-1) };
}
function boxGrip(out: Record<string, Ch>, amount = 1) {
  grip(out, 'Left', false, 0.45 * amount);
  grip(out, 'Right', false, 0.45 * amount);
}

export const carryIdle: Clip = {
  id: 'carry_idle', name: 'Carry idle', category: 'Interaction', duration: 3.6, loop: true,
  sample: (t) => {
    const a = (t / 3.6) * Math.PI * 2, breath = Math.sin(a);
    const bones: Record<string, Ch> = {
      Spine: [3 + 0.4 * breath, 0, 0], Spine1: [1 + 0.3 * breath, 0, 0],
      Head: [-3 - 0.4 * breath, 0, 0],
    };
    side(bones, 'UpLeg', [2, 0, -2], [2, 0, -2]);
    side(bones, 'Leg', [-5, 0, 0], [-5, 0, 0]);
    side(bones, 'Foot', [3, 0, 0], [3, 0, 0]);
    boxGrip(bones);
    return { bones, root: { ground: true }, ik: carryHands(), thumbs: { Left: 0.25, Right: 0.25 } };
  },
};

const recordedWalk = clipFromMocap(MOCAP_DATA.walk, { id: 'walk', name: 'Walk', category: 'Locomotion' });
const CARRY_PACE = 1.18;
/** Keep the recorded footfalls, hip weight shifts and root travel; replace only the arm layer. */
export const carryWalk: Clip = {
  id: 'carry_walk', name: 'Carry walk', category: 'Interaction', loop: true,
  duration: recordedWalk.duration * CARRY_PACE,
  travel: recordedWalk.travel?.map((x) => x / CARRY_PACE) as Clip['travel'],
  sample: (t) => {
    const s = recordedWalk.sample(t / CARRY_PACE), m = s.mocap!;
    const rot = { ...m.rot };
    for (const name of Object.keys(rot)) if (/^(Left|Right)(Shoulder|Arm|ForeArm|Hand)$/.test(name)) delete rot[name];
    boxGrip(s.bones);
    return { ...s, mocap: { ...m, key: 'carry_walk', rot }, ik: carryHands(), thumbs: { Left: 0.25, Right: 0.25 } };
  },
};

export const pickUp: Clip = {
  id: 'pick_up', name: 'Pick up (ground)', category: 'Interaction', duration: 3.4, loop: false,
  sample: (t) => {
    // Reach forward before lowering, keeping the wrists ahead of the knees throughout the squat.
    const T = [0, 0.45, 1.15, 1.5, 1.85, 2.7, 3.4];
    const k = (vals: number[]) => track(T, vals)(t);
    const bones: Record<string, Ch> = {
      Spine: [k([0, 10, 36, 36, 36, 5, 3]), 0, 0],
      Spine1: [k([0, 4, 28, 28, 28, 2, 1]), 0, 0],
      Spine2: [k([0, 0, 12, 12, 12, 0, 0]), 0, 0],
      Neck: [k([0, 0, -10, -10, -10, 0, 0]), 0, 0],
      Head: [k([0, 8, -18, -18, -18, -3, -3]), 0, 0],
    };
    side(bones, 'UpLeg', [k([0, 18, 88, 88, 88, 6, 2]), 0, k([0, 2, 4, 4, 4, 0, -2])], [k([0, 18, 88, 88, 88, 6, 2]), 0, k([0, 2, 4, 4, 4, 0, -2])]);
    side(bones, 'Leg', [k([-3, -28, -132, -132, -132, -12, -5]), 0, 0], [k([-3, -28, -132, -132, -132, -12, -5]), 0, 0]);
    side(bones, 'Foot', [k([0, 12, 44, 44, 44, 6, 3]), 0, 0], [k([0, 12, 44, 44, 44, 6, 3]), 0, 0]);
    const close = smoother((t - 1.15) / 0.35);
    fingers(bones, 5 + 10 * close); boxGrip(bones, close);
    const lift = smoother((t - 1.8) / 0.95);
    // Lift the object in front of the knees; draw it back only after standing.
    const handY = track([0, 0.45, 0.8, 1.15, 1.85, 2.7, 3.4], [0.85, 1.0, 0.7, 0.27, 0.27, 1.03, 1.03])(t);
    const handZ = track([0, 0.45, 0.8, 1.15, 2.3, 2.9, 3.4], [0.08, 0.43, 0.58, 0.54, 0.54, 0.4, 0.34])(t);
    const hand = (s: 1 | -1): HandTarget => ({
      space: 'floor', pos: v(s * k([0.25, 0.28, 0.26, 0.26, 0.26, 0.23, 0.23]), handY, handZ),
      pole: v(s, -0.4, -0.2), dir: v(0, -0.8 * (1 - lift), 0.6 + 0.4 * lift), palm: v(-s, 0, 0),
    });
    const sample = fromRest({ bones, root: { ground: true, z: k([0, -0.01, -0.04, -0.04, -0.04, 0, 0]) }, ik: { Left: hand(1), Right: hand(-1) }, thumbs: { Left: close * 0.25, Right: close * 0.25 } }, t, 3.4, false);
    // The final support pose is exactly Carry idle, so a game can chain the lift and carry.
    const settle = smoother((t - 2.8) / 0.6);
    return settle > 0 ? { ...sample, blend: { sample: carryIdle.sample(0), w: settle } } : sample;
  },
};

export const usePress: Clip = {
  id: 'use_press', name: 'Use / press', category: 'Interaction', duration: 1.65, loop: false,
  sample: (t) => {
    const reach = track([0, 0.4, 0.75, 0.88, 1.05, 1.65], [0, 0.65, 1, 1, 0.85, 0])(t);
    const press = track([0, 0.75, 0.88, 1.0, 1.2, 1.65], [0, 0, 1, 1, 0, 0])(t);
    const bones: Record<string, Ch> = { Spine: [2 * reach, -3 * reach, 0], Spine1: [reach, -2 * reach, 0], Head: [-reach, 5 * reach, 0] };
    side(bones, 'Leg', [-3, 0, 0], [-3, 0, 0]);
    fingers(bones, 14);
    grip(bones, 'Right', true, reach * 0.8);
    // Extended index, other fingers curled: the fingertip presses past the wrist's reach.
    for (let i = 1; i <= 3; i++) bones[`RightHandIndex${i}`] = [4, 0, 0];
    return fromRest({ bones, root: { ground: true }, ik: {
      Right: { pos: lerp3(v(-0.25, -0.65, 0.08), v(-0.2, -0.16, 0.46 + 0.025 * press), reach), pole: v(-1, -0.7, -0.2), dir: v(0, 0, 1), palm: v(0, -1, 0) },
    } }, t, 1.65);
  },
};

export const openDoor: Clip = {
  id: 'open_door', name: 'Open door', category: 'Interaction', duration: 2.8, loop: false,
  sample: (t) => {
    const reach = smoother(t / 0.75) * (1 - smoother((t - 2.05) / 0.75));
    const latch = track([0, 0.8, 1.0, 1.3, 1.6, 2.8], [0, 0, 1, 1, 0, 0])(t);
    const pull = smoother((t - 1.1) / 0.9);
    // A compact pull in front of the right hip; keep the wrist aligned with the forearm.
    const a = pull * 32 * Math.PI / 180;
    const handle = v(-0.26 + 0.42 * (Math.cos(a) - 1), -0.36 - 0.015 * latch, 0.39 - 0.42 * Math.sin(a));
    const bones: Record<string, Ch> = {
      Hips: [0, 3 * pull * reach, 0], Spine: [2 * reach, -4 * reach, 0],
      Spine1: [0, -3 * pull * reach, 0], Head: [0, 7 * reach, 0],
      RightHand: [0, -18 * latch, 0],
    };
    side(bones, 'UpLeg', [2 * reach, 0, -2], [-4 * reach, 0, -2]);
    side(bones, 'Leg', [-6 * reach - 3, 0, 0], [-4 * reach - 3, 0, 0]);
    fingers(bones, 14); grip(bones, 'Right', false, reach * 0.65);
    return fromRest({ bones, root: { ground: true }, thumbs: { Right: reach * 0.4 }, ik: {
      Right: { pos: lerp3(v(-0.25, -0.65, 0.08), handle, reach), pole: v(-0.5, -1, 0) },
    } }, t, 2.8);
  },
};

export const push: Clip = {
  id: 'push', name: 'Push', category: 'Interaction', duration: 2.6, loop: false,
  sample: (t) => {
    const T = [0, 0.45, 0.9, 1.15, 1.65, 2.05, 2.6];
    const k = (vals: number[]) => track(T, vals)(t);
    const effort = k([0, 0.1, 0.4, 1, 1, 0.2, 0]);
    const bones: Record<string, Ch> = {
      Spine: [k([0, 4, 8, 14, 14, 4, 0]), 0, 0], Spine1: [4 * effort, 0, 0], Head: [-8 * effort, 0, 0],
    };
    // Staggered stance and rear-leg drive, with the trunk following the force through the palms.
    side(bones, 'UpLeg', [k([0, 6, 18, 22, 22, 8, 0]), 0, 4], [k([0, -4, -12, -15, -15, -4, 0]), 0, 4]);
    side(bones, 'Leg', [k([-3, -12, -28, -34, -34, -14, -3]), 0, 0], [k([-3, -8, -14, -6, -6, -8, -3]), 0, 0]);
    side(bones, 'Foot', [k([0, 6, 10, 12, 12, 6, 0]), 0, 0], [k([0, 4, 8, 0, 0, 4, 0]), 0, 0]);
    fingers(bones, 4);
    const extend = k([0, 0.55, 0.72, 0.9, 1, 0.65, 0]);
    const hand = (s: 1 | -1): HandTarget => ({
      pos: lerp3(v(0.25 * s, -0.65, 0.08), v(0.24 * s, -0.16, 0.43), extend),
      pole: v(s, -0.6, -0.25), dir: v(0, 1, 0.12), palm: v(0, -0.12, 1),
    });
    return fromRest({ bones, root: { ground: true }, ik: { Left: hand(1), Right: hand(-1) },
      face: { mouthPress: 0.4 * effort, browDownLeft: 0.25 * effort, browDownRight: 0.25 * effort },
    }, t, 2.6);
  },
};

export const INTERACTIONS: Clip[] = [pickUp, usePress, openDoor, push, carryIdle, carryWalk];
