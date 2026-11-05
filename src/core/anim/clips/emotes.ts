/** Emotes: wave, cheer, laugh and talk (cry is motion capture: see mocap-data.ts). */
import { type Ch, type Clip } from './types';
import { fingers, fist, FISTS, side, v } from './helpers';
import { idle } from './basic';
import { speechStress, TALK_LEN } from './speech';

export const wave: Clip = {
  id: 'wave', name: 'Wave', category: 'Emotes', duration: 1.6, loop: true,
  sample: (t) => {
    const a = (t / 1.6) * Math.PI * 2;
    const sw = Math.sin(a * 2); // two waves per loop
    const out: Record<string, Ch> = { Head: [0, 0, 0], Neck: [0, 0, 0], Spine1: [0, 0, 0], Spine2: [0, 0, 0] };
    side(out, 'Shoulder', [0, 0, 0], [0, 0, 12]);
    side(out, 'Arm', [2, 0, 3], [0, 0, 0]);
    side(out, 'ForeArm', [12, 0, 0], [0, 0, 0]);
    side(out, 'Hand', [0, 0, 0], [0, 0, 0]);
    fingers(out, 4);
    side(out, 'HandThumb2', [0, 0, 0], [0, 0, 0]);
    return {
      bones: out,
      root: { ground: true },
      gaze: [0, 0],
      ik: {
        // Hand beside the head, forearm upright; the wave comes from the shoulder and wrist.
        Right: { pos: v(-0.36 - 0.05 * sw, 0.16, 0.06), pole: v(-0.6, -1, -0.2), dir: v(-0.25 * sw, 1, 0.05), palm: v(0, 0, 1) },
      },
    };
  },
};

export const cheer: Clip = {
  id: 'cheer', name: 'Cheer', category: 'Emotes', duration: 1.2, loop: true,
  sample: (t) => {
    const ph = (t / 1.2) * 2; // two fist pumps (and hops) per loop
    const u = ph % 1;
    const pump = Math.sin(Math.min(1, u / 0.35) * Math.PI * 0.5) * (u < 0.35 ? 1 : 1 - (u - 0.35) / 0.65); // fast up, slow down
    const hop = Math.max(0, Math.sin(u * Math.PI * 2 - 0.3));
    const out: Record<string, Ch> = {
      Spine: [-5 - 3 * pump, 0, 0], Spine1: [-4 - 3 * pump, 0, 0], Spine2: [-3, 0, 0],
      Neck: [-8, 0, 0], Head: [-14 - 6 * pump, 0, 0],
    };
    side(out, 'Shoulder', [0, 0, 14 + 8 * pump], [0, 0, 14 + 8 * pump]);
    side(out, 'UpLeg', [10 * (1 - hop), 0, -2], [10 * (1 - hop), 0, -2]);
    side(out, 'Leg', [-18 * (1 - hop) - 4, 0, 0], [-18 * (1 - hop) - 4, 0, 0]);
    side(out, 'Foot', [8 * (1 - hop) - 12 * hop, 0, 0], [8 * (1 - hop) - 12 * hop, 0, 0]);
    fist(out);
    // Double fist pump: elbows bent out, fists driving up from head height to just above it.
    const up = 0.06 + 0.24 * pump;
    const wide = 0.36 - 0.04 * pump;
    return {
      bones: out,
      root: { ground: true, lift: 0.06 * hop },
      thumbs: FISTS,
      ik: {
        Left: { pos: v(wide, up, 0.12), pole: v(1, -0.5, -0.4), dir: v(0.1, 1, 0.15), palm: v(-0.3, 0, 1) },
        Right: { pos: v(-wide, up, 0.12), pole: v(-1, -0.5, -0.4), dir: v(-0.1, 1, 0.15), palm: v(0.3, 0, 1) },
      },
    };
  },
};

/** Laughing: the body bounces with each "ha", the head tips back, a hand on the belly. */
export const laugh: Clip = {
  id: 'laugh', name: 'Laugh', category: 'Emotes', duration: 4.8, loop: true,
  sample: (t) => {
    const a = (t / 4.8) * Math.PI * 2;
    const ha = Math.abs(Math.sin(a * 6)); // six laughs per loop
    const out: Record<string, Ch> = {
      Spine: [-4 + 4 * ha, 0, 0], Spine1: [-3 + 3 * ha, 0, 0], Spine2: [-2, 0, 0],
      Neck: [-6, 0, 0], Head: [-12 + 5 * ha, 4 * Math.sin(a), 3 * Math.sin(a)],
    };
    side(out, 'Shoulder', [0, 0, 4 + 5 * ha], [0, 0, 4 + 5 * ha]);
    side(out, 'Arm', [8, 0, 6], [0, 0, 0]);
    side(out, 'ForeArm', [18, 0, 0], [0, 0, 0]);
    side(out, 'UpLeg', [4 * ha, 0, -2], [4 * ha, 0, -2]);
    side(out, 'Leg', [-6 * ha - 3, 0, 0], [-6 * ha - 3, 0, 0]);
    fingers(out, 16);
    return {
      bones: out,
      root: { ground: true },
      // Right hand resting on the belly.
      ik: { Right: { pos: v(-0.06, -0.5 + 0.01 * ha, 0.2), pole: v(-1, -0.6, -0.4), dir: v(1, -0.2, 0.2), palm: v(0, 0, -1) } },
    };
  },
};

/** Talking: the idle stance with the head nodding and tilting on stressed syllables (the mouth is in faces.ts). */
export const talk: Clip = {
  id: 'talk', name: 'Talk', category: 'Emotes', duration: TALK_LEN, loop: true,
  sample: (t) => {
    const s = idle.sample((t / TALK_LEN) * idle.duration * 2);
    const st = speechStress(t), a = (t / TALK_LEN) * Math.PI * 2;
    const head = s.bones.Head ?? [0, 0, 0], neck = s.bones.Neck ?? [0, 0, 0];
    return {
      ...s,
      bones: {
        ...s.bones,
        Neck: [neck[0] + 2 * st, neck[1], neck[2]],
        Head: [head[0] + 4 * st - 1.5 * Math.sin(a * 3), head[1] + 4 * Math.sin(a * 2 + 0.6), head[2] + 3 * Math.sin(a + 1.3) * (0.4 + st)],
      },
    };
  },
};
