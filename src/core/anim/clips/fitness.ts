/**
 * Fitness: bodyweight exercises, lifts with gym weights and a coach's encouragement. Every clip loops in place. The
 * lifts set `weights` (Carry: Dumbbells, Kettlebell or Barbell): the animator lays the weight through the fists, so
 * the hands are placed by IK on the weight's path, and the weight is only shown in these clips.
 */
import { type Ch, type Clip, type HandTarget, type Sample } from './types';
import { FISTS, fingers, fist, normV, side, track, v } from './helpers';
import { mirrorSample } from './mirror';
import type { CarryId } from '../../props/carry';

type V3 = [number, number, number];
const TAU = Math.PI * 2, rad = Math.PI / 180;
const keys = (T: number[], t: number) => (vals: number[]) => track(T, vals)(t);
/** 0 at the start of each period, 1 halfway through, smoothly. */
const wave = (t: number, period: number) => 0.5 - 0.5 * Math.cos((t / period) * TAU);
const both = (out: Record<string, Ch>, bone: string, ch: Ch) => side(out, bone, ch, ch);
const hand = (pos: V3, pole: V3, dir: V3, palm: V3, space?: 'floor'): HandTarget => ({ pos, pole, dir: normV(dir), palm: normV(palm), ...(space ? { space } : {}) });
/** The left hand's target and its mirror for the right. */
const pair = (h: HandTarget): { Left: HandTarget; Right: HandTarget } => {
  const flip = (a?: V3) => a && v(-a[0], a[1], a[2]);
  return { Left: h, Right: { ...h, pos: flip(h.pos)!, pole: flip(h.pole)!, dir: flip(h.dir), palm: flip(h.palm) } };
};
/** Hand on the hip (left; mirror for the right), fingers down and forward and the elbow out. */
const onHip = hand(v(0.2, -0.53, 0.0), v(1, 0, -0.6), v(-0.2, -1, 0.3), v(-1, 0, 0));
/** World direction (forward, up) at `deg` from straight down towards forward, in the axes of a chest leaning forward `lean` degrees. */
const inChest = (deg: number, lean: number): V3 => {
  const f = Math.sin(deg * rad), u = -Math.cos(deg * rad), l = lean * rad;
  return v(0, f * Math.sin(l) + u * Math.cos(l), f * Math.cos(l) - u * Math.sin(l));
};
/**
 * A squat's legs at depth d (0 standing, 1 thighs just past parallel): the knees track forward over the toes, the hips
 * sit back and the feet stay flat (the foot flexes by the shin's lean).
 */
function squatLegs(out: Record<string, Ch>, d: number, wide = 8) {
  const thigh = 98 * d, knee = -128 * d;
  both(out, 'UpLeg', [thigh, 0, wide + 6 * d]);
  both(out, 'Leg', [knee, 0, 0]);
  both(out, 'Foot', [-(thigh + knee), 0, 0]);
}

/** Bodyweight squat: sit back and down to just below parallel with the arms reaching forward, then drive up. */
export const squat: Clip = {
  id: 'squat', name: 'Squat', category: 'Fitness', duration: 2.2, loop: true,
  sample: (t) => {
    const d = wave(t, 2.2);
    const out: Record<string, Ch> = { Spine: [26 * d, 0, 0], Spine1: [10 * d, 0, 0], Neck: [-16 * d, 0, 0], Head: [-12 * d, 0, 0] };
    squatLegs(out, d);
    both(out, 'Arm', [8 + 78 * d, 0, 6]);
    both(out, 'ForeArm', [12 - 6 * d, 0, 0]);
    fingers(out, 10);
    return { bones: out, root: { ground: true, z: -0.24 * d }, plant: { Left: 1, Right: 1 } };
  },
};

/** One forward lunge on the left leg, hands on the hips: step out, sink until the back knee nearly touches the floor, push back. */
function lungeLeft(t: number): Sample {
  const k = keys([0, 0.18, 0.36, 0.8, 1.16, 1.42, 1.6], t);
  const out: Record<string, Ch> = { Spine: [k([0, 2, 0, -2, 0, 2, 0]), 0, 0], Head: [0, 0, 0] };
  const front = k([0, 48, 36, 86, 36, 48, 0]), frontKnee = k([0, -72, -20, -92, -20, -72, 0]);
  side(out, 'UpLeg', [front, 0, 3], [k([0, -4, -14, -6, -14, -4, 0]), 0, 3]);
  side(out, 'Leg', [frontKnee, 0, 0], [k([0, -4, -8, -100, -8, -4, 0]), 0, 0]);
  side(out, 'Foot', [-(front + frontKnee), 0, 0], [k([0, 0, 8, 40, 8, 0, 0]), 0, 0]);
  side(out, 'ToeBase', [0, 0, 0], [k([0, 0, 30, 78, 30, 0, 0]), 0, 0]);
  fingers(out, 10);
  const ik = pair(onHip);
  return { bones: out, ik, root: { ground: true, z: k([0, 0.12, 0.3, 0.34, 0.3, 0.12, 0]) }, plant: { Right: 1 } };
}
/** Alternating forward lunges: left leg, then right. */
export const lunge: Clip = {
  id: 'lunge', name: 'Lunges (alternating)', category: 'Fitness', duration: 3.2, loop: true,
  sample: (t) => (t < 1.6 ? lungeLeft(t) : mirrorSample(lungeLeft(t - 1.6))),
};

/** High knees: running on the spot, each knee driven up to hip height with the arms pumping. */
export const highKnees: Clip = {
  id: 'high_knees', name: 'High knees', category: 'Fitness', duration: 0.7, loop: true,
  sample: (t) => {
    const s = Math.sin((t / 0.7) * TAU), l = Math.max(0, s), r = Math.max(0, -s);
    const out: Record<string, Ch> = { Spine: [-4, 0, 0], Head: [2, 0, 0] };
    side(out, 'UpLeg', [88 * l, 0, 4], [88 * r, 0, 4]);
    side(out, 'Leg', [-100 * l - 4, 0, 0], [-100 * r - 4, 0, 0]);
    side(out, 'Foot', [-18 * l, 0, 0], [-18 * r, 0, 0]);
    side(out, 'Arm', [-38 * s, 0, 10], [38 * s, 0, 10]);
    both(out, 'ForeArm', [88, 0, 0]);
    fist(out);
    return { bones: out, root: { ground: true, lift: 0.04 * Math.abs(s) }, thumbs: FISTS };
  },
};

/**
 * Push-ups: a straight body on the toes, the hands planted under the shoulders (floor space, so they stay put while
 * the body pivots on the toes), lowered until the chest is just off the floor and pressed back up.
 */
export const pushUp: Clip = {
  id: 'push_up', name: 'Push-ups', category: 'Fitness', duration: 1.8, loop: true,
  sample: (t) => {
    const d = wave(t, 1.8);
    const out: Record<string, Ch> = { Spine: [-2, 0, 0], Neck: [-14 - 6 * d, 0, 0], Head: [-10, 0, 0] };
    both(out, 'UpLeg', [0, 0, 3]);
    both(out, 'Leg', [-2, 0, 0]);
    both(out, 'Foot', [52, 0, 0]);
    both(out, 'ToeBase', [60, 0, 0]);
    both(out, 'Arm', [70, 0, 18]);
    fingers(out, 6);
    const ik = pair(hand(v(0.24, 0.06, PUSH_HANDS_Z), v(0.8, 0.4, -1), v(0, 0, 1), v(0, -1, 0), 'floor'));
    return { bones: out, ik, root: { drop: 0.74 + 0.18 * d, pitch: 72 + 12 * d, z: 0.42 + 0.06 * d, floor: true, reach: true } };
  },
};
/** Where push-up hands are planted (floor space, metres at 1.8 m): under the shoulders at the top of the push-up. */
const PUSH_HANDS_Z = 0.9;

/** Forearm plank: a straight body on the toes and forearms, held, breathing. */
export const plank: Clip = {
  id: 'plank', name: 'Plank', category: 'Fitness', duration: 4, loop: true,
  sample: (t) => {
    const b = Math.sin((t / 4) * TAU);
    const out: Record<string, Ch> = { Spine: [-2 + 0.8 * b, 0, 0], Spine1: [-1 + 0.8 * b, 0, 0], Neck: [-10, 0, 0], Head: [-8, 0, 0] };
    both(out, 'UpLeg', [0, 0, 3]);
    both(out, 'Leg', [-2, 0, 0]);
    both(out, 'Foot', [56, 0, 0]);
    both(out, 'ToeBase', [60, 0, 0]);
    both(out, 'Arm', [80, 0, 14]);
    fist(out);
    // Loose fists on their little-finger edges, thumbs up, the forearms angled in towards each other.
    const ik = pair(hand(v(0.09, 0.09, PLANK_HANDS_Z), v(0.4, -1, -0.6), v(-0.35, 0, 1), v(-1, 0, -0.35), 'floor'));
    return { bones: out, ik, root: { drop: 0.92, pitch: 82, z: 0.46, floor: true }, thumbs: { Left: 1, Right: 1 } };
  },
};
const PLANK_HANDS_Z = 1.25;

/** Sit-ups: lying on the back with the knees bent and feet flat, arms crossed on the chest, curling up to the knees and back down. */
export const sitUp: Clip = {
  id: 'sit_up', name: 'Sit-ups', category: 'Fitness', duration: 2.4, loop: true,
  sample: (t) => {
    const u = wave(t, 2.4), rise = 58 * u;
    const out: Record<string, Ch> = { Spine: [12 * u, 0, 0], Spine1: [10 * u, 0, 0], Neck: [10 + 6 * u, 0, 0], Head: [6, 0, 0] };
    // The thighs hold still while the pelvis rolls up under the body.
    both(out, 'UpLeg', [50 + rise, 0, 6]);
    both(out, 'Leg', [-110, 0, 0]);
    both(out, 'Foot', [-10, 0, 0]);
    fingers(out, 12);
    const ik = pair(hand(v(-0.12, -0.14, 0.14), v(1, -1, 0.6), v(-1, 0.3, 0), v(0, 0, -1)));
    return { bones: out, ik, root: { drop: 1, pitch: -88 + rise, z: -0.46, floor: true }, plant: { Left: 1, Right: 1 } };
  },
};

/** The coach: four claps in front of the chest, then a point to the class with a nod, the other hand on the hip. */
export const coachClap: Clip = {
  id: 'coach_clap', name: 'Coach: clap and point', category: 'Fitness', duration: 2.4, loop: true,
  sample: (t) => {
    const clapping = t < 1.2, open = clapping ? Math.abs(Math.sin((t / 0.3) * Math.PI)) : 1;
    const k = keys([0, 1.2, 1.45, 2.15, 2.4], t), point = k([0, 0, 1, 1, 0]);
    const nod = t > 1.45 && t < 2.15 ? 5 * Math.sin(((t - 1.45) / 0.35) * Math.PI) : 0;
    const out: Record<string, Ch> = { Spine: [4 - 4 * point, 0, 0], Head: [nod, 0, 0] };
    both(out, 'UpLeg', [0, 0, 6]);
    // Pointing: the right arm straight out to the front, index finger extended.
    side(out, 'Arm', [20, 0, 8], [20 + 66 * point, 0, 8 - 2 * point]);
    side(out, 'ForeArm', [60, 0, 0], [60 - 54 * point, 0, 0]);
    fingers(out, 8);
    if (!clapping) { fist(out, ['Right']); for (let j = 1; j <= 3; j++) out[`RightHandIndex${j}`] = [0, 0, 0]; }
    // Palms meet in front of the chest.
    const clap = pair(hand(v(0.025 + 0.13 * open, -0.27, 0.3), v(1, -1, -0.3), v(0.05, 0.45, 1), v(-1, 0, 0.1)));
    return {
      bones: out, root: { ground: true },
      ik: clapping ? clap : { Left: onHip, Right: clap.Right },
      ikWeight: { Left: 1, Right: 1 - point },
      face: { jawOpen: clapping ? 0.15 * open : 0.35 * point, mouthSmile: 0.5 },
    };
  },
};

/** Dumbbell curls: elbows pinned at the sides, both dumbbells curled up to the shoulders, palms up, and lowered under control. */
export const dumbbellCurl: Clip = {
  id: 'dumbbell_curl', name: 'Dumbbell curls', category: 'Fitness', duration: 2.4, loop: true, weights: 'dumbbells',
  sample: (t) => {
    const a = 138 * wave(t, 2.4) * rad, f = v(0, -Math.cos(a), Math.sin(a));
    const out: Record<string, Ch> = { Spine: [-2, 0, 0] };
    both(out, 'UpLeg', [0, 0, 6]);
    fist(out);
    // The dumbbells hang beside the thighs, palms in, and turn palm-up as they rise (a full turn by 60°).
    const turn = Math.min(1, a / (60 * rad)), up = v(0, Math.sin(a), Math.cos(a));
    const palm = v(-(1 - turn), up[1] * turn, up[2] * turn);
    const ik = pair(hand(v(0.28 - 0.06 * turn + 0.26 * f[0], -0.4 + 0.26 * f[1], 0.03 + 0.26 * f[2]), v(0.2, -0.4, -1), f, palm));
    return { bones: out, ik, root: { ground: true }, plant: { Left: 1, Right: 1 }, thumbs: FISTS };
  },
};

/**
 * Kettlebell swing: hike the bell back between the legs with a hip hinge, then snap the hips through so straight arms
 * float it up to chest height.
 */
export const kettlebellSwing: Clip = {
  id: 'kettlebell_swing', name: 'Kettlebell swing', category: 'Fitness', duration: 1.6, loop: true, weights: 'kettlebell',
  sample: (t) => {
    const c = Math.cos((t / 1.6) * TAU), h = 0.5 - 0.5 * c, arm = 38 + 50 * c, lean = 52 * h - 4;
    const out: Record<string, Ch> = { Spine: [lean * 0.55, 0, 0], Spine1: [lean * 0.3, 0, 0], Spine2: [lean * 0.15, 0, 0], Neck: [-lean * 0.4, 0, 0], Head: [-lean * 0.3, 0, 0] };
    const thigh = 40 * h, knee = -48 * h;
    both(out, 'UpLeg', [thigh, 0, 18]);
    both(out, 'Leg', [knee, 0, 0]);
    both(out, 'Foot', [-(thigh + knee), 0, -12]);
    fist(out);
    const dir = inChest(arm, lean), palm = inChest(arm + 90, lean), reach = 0.52;
    const ik = pair(hand(v(0.05, -0.12 + reach * dir[1], reach * dir[2]), v(0.3, -0.2, -1), dir, v(-palm[0], -palm[1], -palm[2])));
    return { bones: out, ik, root: { ground: true, z: -0.2 * h }, plant: { Left: 1, Right: 1 }, thumbs: FISTS };
  },
};

/** Barbell back squat: the bar across the upper back, hands wide on it, squatting to depth and standing up. */
export const barbellSquat: Clip = {
  id: 'barbell_squat', name: 'Barbell back squat', category: 'Fitness', duration: 2.8, loop: true, weights: 'barbell',
  sample: (t) => {
    const d = wave(t, 2.8);
    const out: Record<string, Ch> = { Spine: [30 * d, 0, 0], Spine1: [12 * d, 0, 0], Neck: [-20 * d, 0, 0], Head: [-14 * d, 0, 0] };
    squatLegs(out, d, 12);
    fist(out);
    const ik = pair(hand(v(0.4, -0.08, -0.13), v(0.6, -1, -0.5), v(0, 1, 0.1), v(0, 0.1, 1)));
    return { bones: out, ik, root: { ground: true, z: -0.26 * d }, plant: { Left: 1, Right: 1 }, thumbs: FISTS };
  },
};

/** Deadlift: hinge down to the barbell on the floor, a beat on the floor, pull it up the legs to lockout, and hold. */
export const deadlift: Clip = {
  id: 'deadlift', name: 'Deadlift', category: 'Fitness', duration: 3.2, loop: true, weights: 'barbell',
  sample: (t) => {
    const k = keys([0, 0.4, 1.25, 1.6, 2.45, 3.2], t), d = k([0, 0, 1, 1, 0, 0]);
    const out: Record<string, Ch> = { Spine: [40 * d, 0, 0], Spine1: [20 * d, 0, 0], Spine2: [8 * d, 0, 0], Neck: [-30 * d, 0, 0], Head: [-16 * d, 0, 0] };
    const thigh = 84 * d, knee = -82 * d;
    both(out, 'UpLeg', [thigh, 0, 6]);
    both(out, 'Leg', [knee, 0, 0]);
    both(out, 'Foot', [-(thigh + knee), 0, 0]);
    fist(out);
    // Overhand grip just outside the legs; the bar (at the fists) runs up over the middle of the feet and finishes
    // against the front of the thighs, never through them.
    const ik = pair(hand(v(0.25, 0.86 - 0.56 * d, 0.21 - 0.12 * d), v(0.4, 0, -1), v(0, -1, 0), v(0, 0, -1), 'floor'));
    return { bones: out, ik, root: { ground: true, z: -0.34 * d }, plant: { Left: 1, Right: 1 }, thumbs: FISTS };
  },
};

export const FITNESS: Clip[] = [squat, lunge, highKnees, pushUp, plank, sitUp, coachClap, dumbbellCurl, kettlebellSwing, barbellSquat, deadlift];

/** The carried prop a Fitness clip needs (Dumbbells, Kettlebell or Barbell), or undefined. */
export const gymCarryFor = (clipId: string): CarryId | undefined => FITNESS.find((c) => c.id === clipId)?.weights;
/** The lifts each gym carry is used in (Gym weights (all): every lift). */
export const GYM_CLIPS: Partial<Record<CarryId, string[]>> = {};
for (const c of FITNESS) if (c.weights) { (GYM_CLIPS[c.weights] ??= []).push(c.id);(GYM_CLIPS.gym_weights ??= []).push(c.id); }
