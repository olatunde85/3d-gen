/**
 * Facial animation layered onto the body clips: effort, pain, smiles and aiming. Weights are
 * added to the character's expression (and clamped); blinking and eye glances come from the
 * evaluator. Faces that chain (Knockdown -> Get up, Death (fall forward) -> Get up) match
 * where the clips meet, like the body poses.
 */
import { type Clip } from './types';
import { track } from './helpers';
import { speechFace, speechStress } from './speech';

type Face = Partial<Record<string, number>>;
type FaceFn = (t: number, duration: number) => Face;

/** Keyed weights at fractions of the clip (0..1). */
function keyed(fracs: number[], shapes: Record<string, number[]>): FaceFn {
  return (t, d) => {
    const out: Face = {};
    for (const [name, vals] of Object.entries(shapes)) out[name] = track(fracs.map((f) => f * d), vals)(t);
    return out;
  };
}
const both = (left: string, right: string, vals: number[]) => ({ [left]: vals, [right]: vals });
const constant = (face: Face): FaceFn => () => face;

/** Aiming down the sights with the right eye: the left eye squints. */
const AIM: FaceFn = constant({ eyeSquintLeft: 0.55, browDownLeft: 0.3, mouthPress: 0.15 });

/** Sharp pain on impact (hit reactions). */
const hitFace = keyed([0, 0.12, 0.4, 1], {
  ...both('eyeSquintLeft', 'eyeSquintRight', [0, 0.9, 0.4, 0]),
  ...both('browDownLeft', 'browDownRight', [0, 0.5, 0.2, 0]),
  mouthStretch: [0, 0.6, 0.25, 0],
});

const PUNCH: FaceFn = keyed([0, 0.22, 0.45, 0.65, 1], {
  ...both('browDownLeft', 'browDownRight', [0, 0.6, 0.8, 0.5, 0]),
  ...both('eyeSquintLeft', 'eyeSquintRight', [0, 0.3, 0.45, 0.3, 0]),
  ...both('noseSneerLeft', 'noseSneerRight', [0, 0.2, 0.35, 0.2, 0]),
  mouthPress: [0, 0.6, 0.8, 0.5, 0],
});

const FACES: Record<string, FaceFn> = {
  punch: PUNCH,
  punch_low: PUNCH,
  hit: hitFace,
  hit_front: hitFace,
  hit_back: hitFace,
  hit_left: hitFace,
  hit_right: hitFace,
  wave: constant({ mouthSmile: 0.7, eyeSquintLeft: 0.25, eyeSquintRight: 0.25, browOuterUpLeft: 0.2, browOuterUpRight: 0.2 }),
  cheer: constant({ mouthSmile: 0.9, jawOpen: 0.4, eyeSquintLeft: 0.3, eyeSquintRight: 0.3 }),
  // Asleep: eyes closed, face relaxed. Lying down settles into it.
  sleep: constant({ eyeBlinkLeft: 1, eyeBlinkRight: 1 }),
  lie_down: keyed([0, 0.7, 1], { ...both('eyeBlinkLeft', 'eyeBlinkRight', [0, 0, 0.6]) }),
  talk: (t) => {
    const st = speechStress(t);
    return { ...speechFace(t), browInnerUp: 0.25 * st, browOuterUpLeft: 0.3 * st, browOuterUpRight: 0.3 * st };
  },
  laugh: (t, d) => {
    const ha = Math.abs(Math.sin((t / d) * Math.PI * 12));
    return { mouthSmile: 1, jawOpen: 0.2 + 0.35 * ha, mouthUpperUp: 0.3 + 0.2 * ha, eyeSquintLeft: 0.6, eyeSquintRight: 0.6, browOuterUpLeft: 0.25, browOuterUpRight: 0.25 };
  },
  cry: (t, d) => {
    const a = (t / d) * Math.PI * 2;
    const sob = Math.max(0, Math.sin(a * 2)) ** 2 * 0.7 + Math.max(0, Math.sin(a * 4 + 1)) ** 3 * 0.3;
    return { browInnerUp: 1, mouthFrown: 0.8, mouthStretch: 0.25 + 0.3 * sob, jawOpen: 0.1 + 0.2 * sob, eyeSquintLeft: 0.6, eyeSquintRight: 0.6 };
  },
  jump_start: keyed([0, 0.45, 0.8, 1], { mouthPress: [0, 0.6, 0.3, 0.1], ...both('browDownLeft', 'browDownRight', [0, 0.4, 0.2, 0]) }),
  jump_running: keyed([0, 0.2, 0.8, 1], { mouthPress: [0.1, 0.5, 0.4, 0.1] }),
  fall: keyed([0, 0.13, 0.32, 0.53, 1], {
    ...both('eyeWideLeft', 'eyeWideRight', [0, 0.8, 0.6, 0, 0]),
    ...both('eyeSquintLeft', 'eyeSquintRight', [0, 0, 0, 0.8, 0.2]),
    jawOpen: [0, 0.4, 0.5, 0.1, 0],
  }),

  // Knockdown ends in the face Get up (from back) starts with.
  knockdown: keyed([0, 0.09, 0.29, 0.53, 1], {
    ...both('eyeSquintLeft', 'eyeSquintRight', [0, 0.9, 0.6, 0.8, 0.3]),
    mouthStretch: [0, 0.6, 0.4, 0.5, 0.2],
    jawOpen: [0, 0.3, 0.2, 0.2, 0],
  }),
  get_up_face_up: keyed([0, 0.25, 0.45, 0.66, 0.84, 1], {
    ...both('eyeSquintLeft', 'eyeSquintRight', [0.3, 0.4, 0.5, 0.4, 0.1, 0]),
    ...both('browDownLeft', 'browDownRight', [0, 0.3, 0.5, 0.4, 0.1, 0]),
    mouthStretch: [0.2, 0, 0, 0, 0, 0],
    mouthPress: [0, 0.4, 0.6, 0.5, 0.2, 0],
  }),

  // Deaths end with the eyes almost closed and the jaw slack; Get up (from front) starts there.
  death_forward: keyed([0, 0.12, 0.32, 0.47, 0.56, 1], {
    ...both('eyeSquintLeft', 'eyeSquintRight', [0, 0.9, 0.6, 0.2, 0, 0]),
    ...both('eyeBlinkLeft', 'eyeBlinkRight', [0, 0, 0.2, 0.6, 0.8, 0.8]),
    jawOpen: [0, 0.3, 0.3, 0.25, 0.25, 0.25],
  }),
  death_backward: keyed([0, 0.14, 0.33, 0.47, 0.56, 1], {
    ...both('eyeSquintLeft', 'eyeSquintRight', [0, 0.9, 0.6, 0.2, 0, 0]),
    ...both('eyeBlinkLeft', 'eyeBlinkRight', [0, 0, 0.2, 0.6, 0.8, 0.8]),
    jawOpen: [0, 0.3, 0.3, 0.25, 0.25, 0.25],
  }),
  get_up_face_down: keyed([0, 0.23, 0.43, 0.66, 0.86, 1], {
    ...both('eyeBlinkLeft', 'eyeBlinkRight', [0.8, 0.1, 0, 0, 0, 0]),
    ...both('browDownLeft', 'browDownRight', [0, 0.3, 0.4, 0.3, 0.1, 0]),
    jawOpen: [0.25, 0, 0, 0, 0, 0],
    mouthPress: [0, 0.5, 0.6, 0.4, 0.1, 0],
  }),

  rifle_aim: AIM,
  rifle_fire: AIM,
  rifle_fire_auto: constant({ eyeSquintLeft: 0.65, eyeSquintRight: 0.25, browDownLeft: 0.4, browDownRight: 0.3, mouthPress: 0.35 }),
  rifle_walk: AIM,
  rifle_walk_back: AIM,
  rifle_strafe_left: AIM,
  rifle_strafe_right: AIM,
  rifle_crouch_aim: AIM,
  rifle_crouch_walk: AIM,
  pistol_aim: AIM,
  pistol_aim_one_hand: AIM,
  pistol_walk: AIM,
  pistol_run: AIM,
  pistol_sprint: AIM,
  pistol_strafe_left: AIM,
  pistol_strafe_right: AIM,
  pistol_fire: AIM,
  throw_grenade: keyed([0, 0.4, 0.6, 1], { mouthPress: [0, 0.6, 0.6, 0], ...both('browDownLeft', 'browDownRight', [0, 0.4, 0.4, 0]) }),

  sword_idle: constant({ browDownLeft: 0.35, browDownRight: 0.35, mouthPress: 0.3 }),
  sword_slash: keyed([0, 0.3, 0.5, 1], {
    ...both('browDownLeft', 'browDownRight', [0.2, 0.7, 0.7, 0.2]),
    mouthPress: [0.2, 0.7, 0.6, 0.2],
    ...both('noseSneerLeft', 'noseSneerRight', [0, 0.3, 0.3, 0]),
  }),
  sword_block: keyed([0, 0.3, 1], {
    ...both('browDownLeft', 'browDownRight', [0.2, 0.6, 0.3]),
    ...both('eyeSquintLeft', 'eyeSquintRight', [0, 0.45, 0.2]),
    mouthPress: [0.2, 0.5, 0.3],
  }),
};

/** Clips with their facial animation added (clips without an entry keep a resting face). */
export function withFaces(clips: Clip[]): Clip[] {
  return clips.map((c) => {
    const face = FACES[c.id];
    if (!face) return c;
    return { ...c, sample: (t: number) => ({ ...c.sample(t), face: face(t, c.duration) }) };
  });
}

/** Clip ids that have facial animation (for docs and tests). */
export const CLIPS_WITH_FACES = Object.keys(FACES);
