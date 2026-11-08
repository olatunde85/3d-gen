/**
 * Everyday NPCs: conversation gestures, a phone call, texting, leaning on a wall, looking around and sweeping.
 * The phone is Carry: Mobile phone (left hand); sweeping uses Carry: Broom, laid through both hands.
 */
import type { Ch, Clip, HandTarget, Sample } from './types';
import { fingers, grip, side, v } from './helpers';
import { idle } from './basic';

const TAU = Math.PI * 2;
/** Idle legs and breathing, with the arms and head replaced by the caller. */
function standing(t: number, period: number) {
  const s = idle.sample((t / period) * 3.2), bones = { ...s.bones };
  for (const k of Object.keys(bones)) if (/^(Left|Right)(Shoulder|Arm|ForeArm|Hand)$/.test(k)) delete bones[k];
  return { ...s, bones };
}

/** Explaining with open hands: beats of emphasis, palms up, a little head and shoulder movement. */
export const talkGestures: Clip = {
  id: 'talk_gestures', name: 'Talk with gestures', category: 'Everyday', duration: 4, loop: true,
  sample: (t) => {
    const a = (t / 4) * TAU, beat = Math.max(0, Math.sin(a * 3)) ** 2, s = standing(t, 4);
    const bones: Record<string, Ch> = { ...s.bones, Spine: [2, 6 * Math.sin(a), 0], Neck: [-2 + 4 * beat, 4 * Math.sin(a + 1), 0], Head: [2 * beat, 6 * Math.sin(a), 0] };
    fingers(bones, 10);
    const hand = (sd: 1 | -1, o: number): HandTarget => ({
      pos: v(sd * (0.2 + 0.07 * Math.sin(a * 2 + o)), -0.36 + 0.08 * beat + 0.04 * Math.sin(a + o), 0.26 + 0.05 * Math.sin(a * 2 + o)),
      pole: v(sd, -1, -0.3), dir: v(sd * 0.3, 0.1, 1), palm: v(-sd * 0.4, 1, 0),
    });
    return { ...s, bones, gaze: [0, 0], ik: { Left: hand(1, 0), Right: hand(-1, 1.7) } };
  },
};

type V3 = [number, number, number];
type PhonePose = NonNullable<Sample['prop']>;
const norm3 = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return v(a[0] / l, a[1] / l, a[2] / l); };
/**
 * Wrist target for a hand cradling the phone: the palm rests on its back (facing the screen direction; the hand
 * joint runs through the middle of the hand, so it sits a hand's half-thickness behind the phone), offset
 * `across` towards one edge, with the fingers along `dir` curling round the far edge.
 */
function cradle(p: PhonePose, dir: V3, across: number, pole: V3): HandTarget {
  const x = norm3(p.x), d = norm3(dir), back = 0.0039 + 0.03, palm: V3 = v(p.pos[0] - x[0] * back - d[0] * across, p.pos[1] - x[1] * back - d[1] * across, p.pos[2] - x[2] * back - d[2] * across);
  return { pos: v(palm[0] - d[0] * 0.075, palm[1] - d[1] * 0.075, palm[2] - d[2] * 0.075), pole, dir: d, palm: x };
}

/**
 * On the phone (Carry: Mobile phone): held against the left cheek from the ear towards the mouth, the palm on its
 * back and the fingers up behind it; the elbow points down and forward. The free hand gestures now and then.
 */
const CALL: PhonePose = { pos: v(0.08, 0.1, 0.055), x: v(-1, 0, 0), z: norm3(v(0.018, 0.1, -0.13)) };
export const phoneCall: Clip = {
  id: 'phone_call', name: 'Phone call', category: 'Everyday', duration: 5, loop: true,
  sample: (t) => {
    const a = (t / 5) * TAU, talk = Math.max(0, Math.sin(a * 2)), s = standing(t, 5);
    const bones: Record<string, Ch> = { ...s.bones, Spine: [1, 4 * Math.sin(a), 0], Neck: [0, 0, 4], Head: [2, 0, 4] };
    fingers(bones, 12);
    // Fingers together along the phone's back with a gentle curl; any more would push them into it.
    const together: Record<string, number> = { Index: 7, Middle: 2, Ring: -4, Pinky: -9 };
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3]) bones[`LeftHand${f}${k}`] = [(f === 'Ring' || f === 'Pinky' ? 0.4 : 1) * (k === 1 ? 3 : 6), 0, k === 1 ? together[f] : 0];
    return { ...s, bones, gaze: [0, 0], thumbs: { Left: 0 }, prop: CALL,
      ik: {
        Left: cradle(CALL, CALL.z, 0, v(0.2, -1, 0.35)),
        Right: { pos: v(-0.2 - 0.05 * talk, -0.5 + 0.18 * talk, 0.1 + 0.15 * talk), pole: v(-1, -1, -0.2), dir: v(-0.2, -1 + talk, talk), palm: v(0.4, talk, 0) },
      } };
  },
};

/**
 * Texting: the phone lies in the left palm in front of the chest, screen towards the eyes, the fingers flat under
 * it and the thumb alongside its edge; the right index finger taps the screen from above, the other fingers
 * closed into the palm so only the fingertip meets the glass.
 */
const TEXT: PhonePose = { pos: v(0.01, -0.32, 0.3), x: norm3(v(0, 0.93, -0.37)), z: norm3(v(0, 0.37, 0.93)) };
export const texting: Clip = {
  id: 'texting', name: 'Texting', category: 'Everyday', duration: 3, loop: true,
  sample: (t) => {
    const a = (t / 3) * TAU, s = standing(t, 3);
    const bones: Record<string, Ch> = { ...s.bones, Spine: [4, 0, 0], Spine1: [3, 0, 0], Neck: [20, 0, 0], Head: [14, 2 * Math.sin(a), 0] };
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3]) bones[`LeftHand${f}${k}`] = [f === 'Pinky' ? -10 : -5, 0, 0];
    grip(bones, 'Right');
    for (const k of [1, 2, 3]) bones[`RightHandIndex${k}`] = [0, 0, 0];
    const x = norm3(TEXT.x), z = norm3(TEXT.z), y: V3 = v(z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]);
    // Fingertip on the screen, hopping between keys and lifting between taps.
    const key = 0.018 * Math.sin(t * 3.1), lift = 0.012 * Math.max(0, Math.sin(t * 9)), h = 0.012 + lift, tip: V3 = v(
      TEXT.pos[0] + x[0] * h + y[0] * key - z[0] * 0.02, TEXT.pos[1] + x[1] * h + y[1] * key - z[1] * 0.02, TEXT.pos[2] + x[2] * h + y[2] * key - z[2] * 0.02);
    const dir = norm3(v(0.55 * -y[0] + 0.75 * z[0] - 0.12 * x[0], 0.55 * -y[1] + 0.75 * z[1] - 0.12 * x[1], 0.55 * -y[2] + 0.75 * z[2] - 0.12 * x[2]));
    // Palm towards the screen, square to the finger direction.
    const down = -(x[0] * dir[0] + x[1] * dir[1] + x[2] * dir[2]), palm = norm3(v(-x[0] - dir[0] * down, -x[1] - dir[1] * down, -x[2] - dir[2] * down));
    return { ...s, bones, gaze: [0, 0], thumbs: { Left: 0, Right: 0.3 }, prop: TEXT,
      ik: {
        Left: cradle(TEXT, v(-1, 0, 0), 0.04, v(1, -1, -0.3)),
        Right: { pos: tip, tip: true, pole: v(-1, -1, -0.3), dir, palm },
      } };
  },
};

/** Leaning back against a wall, arms crossed, one foot flat against it. The wall is about 18 cm behind the heels. */
export const leanWall: Clip = {
  id: 'lean_wall', name: 'Lean on wall', category: 'Everyday', duration: 4, loop: true,
  sample: (t) => {
    const a = (t / 4) * TAU, breath = Math.sin(a);
    const bones: Record<string, Ch> = { Spine: [-3 + 0.6 * breath, 0, 0], Spine1: [-2, 0, 0], Neck: [6, 0, 0], Head: [2, 8 * Math.sin(a / 2), 3] };
    side(bones, 'UpLeg', [4, 0, -2], [55, 0, 4]);
    side(bones, 'Leg', [-4, 0, 0], [-100, 0, 0]);
    side(bones, 'Foot', [0, 0, 0], [-25, 0, 0]);
    // Arms folded: each hand rests on the opposite upper arm, palm against it and the fingers wrapped round the
    // outside; the left forearm lies in front of and above the right so they stack instead of crossing through, both
    // under the bust and clear of the chest on fuller figures.
    grip(bones, 'Left', false, 0.35); grip(bones, 'Right', false, 0.35);
    return { bones, gaze: [0, 0], root: { ground: true, pitch: -7, z: -0.08 }, thumbs: { Left: 0.3, Right: 0.3 },
      ik: {
        Left: { pos: v(-0.14, -0.24, 0.25), pole: v(1, -1, 0.5), dir: v(-0.66, 0, -0.75), palm: v(0.75, 0, -0.66) },
        Right: { pos: v(0.14, -0.33, 0.21), pole: v(-1, -1, 0.5), dir: v(0.66, 0, -0.75), palm: v(-0.75, 0, -0.66) },
      } };
  },
};

/** Looking around: head and upper body turn to scan left and right, a pause at each side. */
export const lookAround: Clip = {
  id: 'look_around', name: 'Look around', category: 'Everyday', duration: 6, loop: true,
  sample: (t) => {
    const u = t / 6, turn = Math.sin(u * TAU) * Math.min(1, Math.abs(Math.sin(u * TAU)) * 1.6), s = idle.sample((t / 6) * 3.2);
    const bones: Record<string, Ch> = { ...s.bones, Spine: [0, 12 * turn, 0], Spine1: [0, 10 * turn, 0], Neck: [0, 18 * turn, 0], Head: [-3 * Math.abs(turn), 28 * turn, 0] };
    return { ...s, bones, gaze: [0, 0] };
  },
};

/**
 * Sweeping (Carry: Broom). The broom is posed first, as a rigid 1.42 m broom whose bristles sweep across the floor
 * in front and to the right; both hands then take hold of its handle (targets in floor space), the top hand near
 * the end and the lower hand partway down, thumbs pointing up it. The handle therefore never runs past the top
 * hand into the body. The animator lays the broom through both grips.
 */
const BROOM = 1.42;
const cross = (a: V3, b: V3): V3 => v(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
function handleGrip(grip: V3, up: V3, side: 'Left' | 'Right', pole: V3): HandTarget {
  // Palm faces back towards the body, square to the handle; fingers wrap across it.
  const toward: V3 = v(0, 0, -1), k = toward[0] * up[0] + toward[1] * up[1] + toward[2] * up[2];
  const palm = norm3(v(toward[0] - up[0] * k, toward[1] - up[1] * k, toward[2] - up[2] * k));
  const dir = side === 'Left' ? cross(up, palm) : cross(palm, up);
  return { space: 'floor', pos: v(grip[0] - dir[0] * 0.085 - palm[0] * 0.02, grip[1] - dir[1] * 0.085 - palm[1] * 0.02, grip[2] - dir[2] * 0.085 - palm[2] * 0.02), pole, dir, palm };
}
export const sweep: Clip = {
  id: 'sweep', name: 'Sweep', category: 'Everyday', duration: 1.6, loop: true,
  sample: (t) => {
    const a = (t / 1.6) * TAU, stroke = Math.sin(a), turn = 10 * stroke;
    const bones: Record<string, Ch> = { Spine: [7, turn * 0.5, 0], Spine1: [3, turn * 0.4, 0], Neck: [14, -turn * 0.3, 0], Head: [10, 0, 0] };
    side(bones, 'UpLeg', [14, 0, 10], [14, 0, 10]);
    side(bones, 'Leg', [-24, 0, 0], [-24, 0, 0]);
    side(bones, 'Foot', [10, 0, 0], [10, 0, 0]);
    grip(bones, 'Left'); grip(bones, 'Right');
    // Bristles on the floor, sweeping across; the handle leans back to the top hand in front of the chest.
    const bristles: V3 = v(-0.3 + 0.22 * stroke, 0.02, 0.72), chest: V3 = v(0.05 + 0.05 * stroke, 1.08, 0.38);
    const up = norm3(v(chest[0] - bristles[0], chest[1] - bristles[1], chest[2] - bristles[2]));
    const at = (d: number): V3 => v(bristles[0] + up[0] * d, bristles[1] + up[1] * d, bristles[2] + up[2] * d);
    return { bones, gaze: [0, 0], root: { ground: true }, thumbs: { Left: 0.7, Right: 0.7 },
      ik: { Left: handleGrip(at(BROOM - 0.08), up, 'Left', v(1, -0.8, -0.3)), Right: handleGrip(at(BROOM * 0.58), up, 'Right', v(-1, -0.8, -0.3)) } };
  },
};

export const EVERYDAY: Clip[] = [talkGestures, phoneCall, texting, leanWall, lookAround, sweep];
