/** Emotes: wave, cheer, laugh, talk and social emotes (cry is motion capture: see mocap-data.ts). */
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

// --- Social emotes -----------------------------------------------------------------------------

/** Smoothstep easing for raising into a held emote. */
const easeW = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };

/** Applause: palms meet in front of the chest twice a second. */
export const clap: Clip = {
  id: 'clap', name: 'Clap', category: 'Emotes', duration: 1, loop: true,
  sample: (t) => {
    const u = (t * 2) % 1, open = u < 0.15 ? 0 : Math.sin(((u - 0.15) / 0.85) * Math.PI);
    const out: Record<string, Ch> = { Spine: [3, 0, 0], Neck: [2, 0, 0], Head: [2, 0, 0] };
    fingers(out, 6);
    const hand = (s: 1 | -1) => ({ pos: v(s * (0.025 + 0.11 * open), -0.2, 0.32), pole: v(s, -1, -0.3), dir: v(s * -0.1, 0.55, 1), palm: v(-s, 0, 0) });
    return { bones: out, root: { ground: true }, gaze: [0, 0], ik: { Left: hand(1), Right: hand(-1) } };
  },
};

/** Point straight ahead with the right index finger, then hold. */
export const point: Clip = {
  id: 'point', name: 'Point', category: 'Emotes', duration: 1.4, loop: false,
  sample: (t) => {
    const w = easeW(t / 0.5), out: Record<string, Ch> = { Spine: [0, -6 * w, 0], Neck: [0, 4 * w, 0] };
    fingers(out, 14);
    fist(out, ['Right']);
    for (const k of [1, 2, 3]) out[`RightHandIndex${k}`] = [0, 0, 0];
    const s = idle.sample(0);
    return { ...s, bones: { ...s.bones, ...out }, gaze: [0, 0], thumbs: { Right: 1 },
      ik: { Right: { pos: v(-0.2 - 0.05 * w, -0.5 + 0.48 * w, 0.06 + 0.5 * w), pole: v(-1, -0.6, -0.2), dir: v(0, 0.05 * w - (1 - w), w), palm: v(1, 0, 0) } } };
  },
};

/** Thumbs up in front of the chest, then hold. */
export const thumbsUp: Clip = {
  id: 'thumbs_up', name: 'Thumbs up', category: 'Emotes', duration: 1.2, loop: false,
  sample: (t) => {
    const w = easeW(t / 0.45), out: Record<string, Ch> = { Head: [-2 * w, 0, 0] };
    fingers(out, 14);
    fist(out, ['Right']);
    out.RightHandThumb2 = [-10, 0, 0]; out.RightHandThumb3 = [-5, 0, 0];
    const s = idle.sample(0);
    return { ...s, bones: { ...s.bones, ...out }, gaze: [0, 0],
      ik: { Right: { pos: v(-0.2 + 0.02 * w, -0.5 + 0.32 * w, 0.06 + 0.3 * w), pole: v(-1, -0.8, -0.2), dir: v(0, -(1 - w), w), palm: v(w, 0, 1 - w) } } };
  },
};

/** A respectful bow from the hips, hands at the sides, and back up. */
export const bow: Clip = {
  id: 'bow', name: 'Bow', category: 'Emotes', duration: 2.4, loop: false,
  sample: (t) => {
    const w = easeW(t / 0.8) * (1 - easeW((t - 1.5) / 0.8));
    const s = idle.sample(0), out: Record<string, Ch> = { ...s.bones, Spine: [22 * w, 0, 0], Spine1: [14 * w, 0, 0], Spine2: [6 * w, 0, 0], Neck: [6 * w, 0, 0], Head: [4 * w, 0, 0] };
    side(out, 'UpLeg', [6 * w, 0, 0], [6 * w, 0, 0]);
    side(out, 'Arm', [8 * w, 0, 2], [8 * w, 0, 2]);
    return { ...s, bones: out, gaze: [0, 0] };
  },
};

/** Groove: step-touch side to side on the beat (120 bpm), knees bouncing, arms swinging, head nodding. */
export const danceGroove: Clip = {
  id: 'dance_groove', name: 'Dance (groove)', category: 'Emotes', duration: 2, loop: true,
  sample: (t) => {
    const a = (t / 2) * Math.PI * 2, beat = Math.abs(Math.sin(a * 2)), sway = Math.sin(a);
    const out: Record<string, Ch> = { Hips: [0, 8 * sway, 6 * sway], Spine: [4, -6 * sway, -4 * sway], Spine1: [2, -4 * sway, 0], Neck: [-6 + 8 * beat, 0, 0], Head: [4 * beat, 6 * sway, 0] };
    side(out, 'UpLeg', [10 + 12 * Math.max(0, -sway), 0, 6 + 10 * Math.max(0, sway)], [10 + 12 * Math.max(0, sway), 0, 6 + 10 * Math.max(0, -sway)]);
    side(out, 'Leg', [-20 - 18 * beat, 0, 0], [-20 - 18 * beat, 0, 0]);
    side(out, 'Foot', [8 + 6 * beat, 0, 0], [8 + 6 * beat, 0, 0]);
    side(out, 'Arm', [30 + 25 * sway, 0, 20], [30 - 25 * sway, 0, 20]);
    side(out, 'ForeArm', [80 + 10 * beat, 0, 0], [80 + 10 * beat, 0, 0]);
    fist(out);
    return { bones: out, root: { ground: true, x: 0.12 * sway, lift: -0.04 * beat }, thumbs: FISTS, gaze: [0, 0] };
  },
};

/** Party bounce: quick knee bounce, shoulders shimmying and alternating hands raised. */
export const danceBounce: Clip = {
  id: 'dance_bounce', name: 'Dance (party bounce)', category: 'Emotes', duration: 1, loop: true,
  sample: (t) => {
    const a = t * Math.PI * 2, beat = Math.abs(Math.sin(a * 2)), alt = Math.sin(a), shimmy = Math.sin(a * 4);
    const out: Record<string, Ch> = { Spine: [2, 0, 0], Spine2: [0, 8 * shimmy, 0], Neck: [-4 + 6 * beat, 0, 0], Head: [0, 0, 4 * alt] };
    side(out, 'UpLeg', [14 + 10 * beat, 0, 8], [14 + 10 * beat, 0, 8]);
    side(out, 'Leg', [-28 - 20 * beat, 0, 0], [-28 - 20 * beat, 0, 0]);
    side(out, 'Foot', [12 + 8 * beat, 0, 0], [12 + 8 * beat, 0, 0]);
    side(out, 'Shoulder', [0, 0, 6 + 6 * shimmy], [0, 0, 6 - 6 * shimmy]);
    fist(out);
    const up = (k: number) => 0.1 + 0.32 * Math.max(0, k);
    return {
      bones: out, root: { ground: true, lift: -0.05 * beat }, thumbs: FISTS, gaze: [0, 0],
      ik: { Left: { pos: v(0.32, up(alt) - 0.25 * Math.max(0, -alt), 0.18), pole: v(1, -0.6, -0.3), dir: v(0.1, 1, 0.2), palm: v(-0.3, 0, 1) },
        Right: { pos: v(-0.32, up(-alt) - 0.25 * Math.max(0, alt), 0.18), pole: v(-1, -0.6, -0.3), dir: v(-0.1, 1, 0.2), palm: v(0.3, 0, 1) } },
    };
  },
};

export const SOCIAL_EMOTES: Clip[] = [clap, point, thumbsUp, bow, danceGroove, danceBounce];
