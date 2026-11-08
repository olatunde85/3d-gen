/**
 * Reactions: directional hit reactions, knockdown, death falling backward and getting up.
 * Clips that chain share their poses where they meet: Knockdown ends lying face up exactly where
 * Get up (face up) starts, and Get up (face down) starts from the face-down pose that
 * Death (fall forward) ends in, so a game can play them back to back without a pop.
 */
import { type Ch, type Clip } from './types';
import { fingers, side, track } from './helpers';

/** Keyframed values at fixed times (smooth, clamped at the ends). */
const keys = (T: number[], t: number) => (vals: number[]) => track(T, vals)(t);

// --- Directional hit reactions --------------------------------------------------------------

type HitDir = 'front' | 'back' | 'left' | 'right';

/**
 * A hit coming from `dir` (where the attacker is). The upper body is knocked away from the
 * hit, the character takes a recovery step the same way, then settles back to neutral.
 */
export function hitFrom(dir: HitDir): Clip {
  const names: Record<HitDir, string> = { front: 'Hit from front', back: 'Hit from back', left: 'Hit from left', right: 'Hit from right' };
  return {
    id: `hit_${dir}`, name: names[dir], category: 'Reactions', duration: 0.8, loop: false,
    sample: (t) => {
      const k = keys([0, 0.1, 0.32, 0.8], t);
      const jolt = k([0, 1, 0.4, 0]); // peaks at the impact
      const out: Record<string, Ch> = {};
      let rootX = 0, rootZ = 0;
      if (dir === 'front' || dir === 'back') {
        const s = dir === 'front' ? -1 : 1; // front: knocked back (spine extends); back: forward
        out.Spine = [16 * s * jolt, 0, 0];
        out.Spine1 = [10 * s * jolt, 0, 0];
        out.Neck = [12 * s * jolt, 0, 0];
        out.Head = [(dir === 'front' ? -18 : 22) * jolt, 8 * jolt, 0];
        side(out, 'Arm', [(dir === 'front' ? 24 : -20) * jolt, 0, 3 + 18 * jolt], [(dir === 'front' ? 20 : -18) * jolt, 0, 3 + 20 * jolt]);
        side(out, 'ForeArm', [12 + 28 * jolt, 0, 0], [12 + 24 * jolt, 0, 0]);
        // Recovery step: the right foot steps back (front hit) or forward (back hit).
        const step = k([0, 0.6, 1, 0]);
        side(out, 'UpLeg', [0, 0, 0], [(dir === 'front' ? -14 : 26) * step, 0, 0]);
        side(out, 'Leg', [-3, 0, 0], [-3 - 24 * step, 0, 0]);
        rootZ = k([0, 0.04, 0.07, 0.06]) * s;
      } else {
        const s = dir === 'left' ? 1 : -1; // +1: attacker on the character's left
        // Bent away from the hit and twisted by it; head whips away.
        out.Spine = [-4 * jolt, -10 * s * jolt, -10 * s * jolt];
        out.Spine1 = [-2 * jolt, -8 * s * jolt, -8 * s * jolt];
        out.Neck = [0, -8 * s * jolt, -10 * s * jolt];
        out.Head = [-6 * jolt, -18 * s * jolt, -12 * s * jolt];
        // The arm on the hit side flinches in, the far arm swings out for balance.
        const near: Ch = [20 * jolt, 0, 3 + 4 * jolt], far: Ch = [8 * jolt, 0, 3 + 28 * jolt];
        if (dir === 'left') side(out, 'Arm', near, far);
        else side(out, 'Arm', far, near);
        side(out, 'ForeArm', [12 + 30 * jolt, 0, 0], [12 + 30 * jolt, 0, 0]);
        // Side step away from the hit with the far leg.
        const step = k([0, 0.6, 1, 0]);
        if (dir === 'left') side(out, 'UpLeg', [0, 0, 0], [0, 0, 12 * step]);
        else side(out, 'UpLeg', [0, 0, 12 * step], [0, 0, 0]);
        rootX = -s * k([0, 0.04, 0.08, 0.07]);
      }
      fingers(out, 14 + 16 * jolt);
      return { bones: out, root: { ground: true, x: rootX, z: rootZ } };
    },
  };
}

// --- Lying poses (shared start and end frames) -------------------------------------------------

/** Lying on the back: the pose Knockdown and Death (fall backward) end in, and Get up (from back) starts from. */
export const ON_BACK = {
  drop: 1, pitch: -88, z: -0.46,
  spine: [-2, -1, -4, -6], // Spine, Spine1, Neck, Head flex
  upLeg: [8, 12], leg: [-10, -16], foot: [-20, -18],
  arm: [-6, -4], armOut: [24, 28], foreArm: [8, 10],
};


// --- Knockdown and death ---------------------------------------------------------------------

/** Knocked off the feet by a heavy hit from the front, landing on the back. */
const knockdown: Clip = {
  id: 'knockdown', name: 'Knockdown', category: 'Reactions', duration: 1.4, loop: false,
  sample: (t) => {
    const T = [0, 0.12, 0.4, 0.62, 0.74, 0.9, 1.4];
    const k = keys(T, t);
    const out: Record<string, Ch> = {
      Spine: [k([0, -22, -16, -6, -10, -2, -2]), 0, 0], Spine1: [k([0, -14, -10, -4, -6, -1, -1]), 0, 0],
      Neck: [k([0, -14, 10, 18, 4, -4, -4]), 0, 0], Head: [k([0, -24, 8, 16, 0, -6, -6]), k([0, 8, 6, 6, 10, 12, 12]), 0],
    };
    // Legs fly up as the body goes over, then drop on the ground.
    side(out, 'UpLeg', [k([0, -6, 30, 48, 20, 8, 8]), 0, k([0, 2, 6, 8, 8, 8, 8])], [k([0, 10, 40, 55, 26, 12, 12]), 0, k([0, 2, 6, 10, 10, 10, 10])]);
    side(out, 'Leg', [k([-3, -10, -40, -50, -20, -10, -10]), 0, 0], [k([-3, -30, -55, -55, -26, -16, -16]), 0, 0]);
    side(out, 'Foot', [k([0, 0, 10, 0, -15, -20, -20]), 0, 0], [k([0, 0, 10, 0, -15, -18, -18]), 0, 0]);
    // Arms thrown forward by the blow, then flung out to break the fall.
    side(out, 'Arm', [k([0, 50, 60, 40, 5, -6, -6]), 0, k([3, 20, 50, 55, 35, 24, 24])], [k([0, 45, 55, 38, 5, -4, -4]), 0, k([3, 22, 55, 58, 38, 28, 28])]);
    side(out, 'ForeArm', [k([12, 40, 30, 20, 12, 8, 8]), 0, 0], [k([12, 36, 28, 20, 12, 10, 10]), 0, 0]);
    fingers(out, k([14, 34, 28, 20, 18, 18, 18]));
    return {
      bones: out,
      root: {
        drop: k([0, 0.05, 0.45, 0.9, 1, 0.98, 1]), pitch: k([0, -10, -45, -80, -92, -87, -88]),
        z: k([0, -0.08, -0.3, -0.44, -0.47, -0.46, -0.46]), floor: true,
      },
    };
  },
};

/** Collapse backward and stay down, limp. */
export const deathBackward: Clip = {
  id: 'death_backward', name: 'Death (fall backward)', category: 'Reactions', duration: 1.8, loop: false,
  sample: (t) => {
    const T = [0, 0.25, 0.6, 0.85, 1.0, 1.8];
    const k = keys(T, t);
    const out: Record<string, Ch> = {
      Spine: [k([0, 10, -8, -4, -2, -2]), 0, 0], Spine1: [k([0, 6, -6, -2, -1, -1]), 0, 0],
      Neck: [k([0, 12, 12, 0, -4, -6]), 0, 0], Head: [k([0, 14, 10, -2, -6, -8]), k([0, 0, 6, 22, 30, 34]), 0],
    };
    // Knees buckle first, then the body tips over backward.
    side(out, 'UpLeg', [k([0, 30, 42, 20, 10, 6]), 0, k([0, 2, 6, 8, 10, 10])], [k([0, 26, 38, 22, 14, 12]), 0, k([0, 2, 6, 10, 12, 12])]);
    side(out, 'Leg', [k([0, -50, -60, -25, -12, -8]), 0, 0], [k([0, -45, -55, -30, -20, -18]), 0, 0]);
    side(out, 'Foot', [k([0, 12, 6, -10, -18, -22]), 0, 0], [k([0, 12, 6, -10, -16, -20]), 0, 0]);
    // Arms go limp and fall open.
    side(out, 'Arm', [k([0, 15, 20, 10, -4, -8]), 0, k([3, 10, 35, 45, 40, 38])], [k([0, 12, 18, 8, -2, -6]), 0, k([3, 10, 38, 48, 44, 42])]);
    side(out, 'ForeArm', [k([12, 30, 25, 15, 10, 8]), 0, 0], [k([12, 28, 25, 18, 14, 12]), 0, 0]);
    fingers(out, k([14, 24, 26, 22, 20, 20]));
    return {
      bones: out,
      root: { drop: k([0, 0.2, 0.62, 1, 0.97, 1]), pitch: k([0, -4, -45, -88, -86, -88]), z: k([0, -0.04, -0.24, -0.44, -0.46, -0.46]), floor: true },
    };
  },
};

/** Collapse forward, face down, and stay down. */
export const deathForward: Clip = {
  id: 'death_forward', name: 'Death (fall forward)', category: 'Reactions', duration: 1.7, loop: false,
  sample: (t) => {
    const T = [0, 0.2, 0.55, 0.8, 0.95, 1.7];
    const k = (vals: number[]) => track(T, vals)(t);
    const out: Record<string, Ch> = {
      Spine: [k([0, 15, 20, 5, 0, 0]), 0, 0], Spine1: [k([0, 10, 12, 4, 0, 0]), 0, 0],
      Neck: [k([0, 15, 10, -10, -15, -20]), 0, 0], Head: [k([0, 10, 5, -10, -15, -10]), k([0, 0, 0, 20, 30, 35]), 0],
    };
    side(out, 'UpLeg', [k([0, 40, 60, 10, 0, -2]), 0, k([0, 2, 4, 6, 6, 6])], [k([0, 35, 55, 15, 4, 2]), 0, k([0, 2, 4, 8, 8, 8])]);
    side(out, 'Leg', [k([0, -60, -90, -30, -10, -6]), 0, 0], [k([0, -55, -80, -35, -15, -10]), 0, 0]);
    side(out, 'Foot', [k([0, 10, 20, -10, -30, -40]), 0, 0], [k([0, 10, 20, -10, -30, -35]), 0, 0]);
    // Arms thrown forward to break the fall, ending stretched out on the floor above the head.
    side(out, 'Arm', [k([0, 30, 90, 150, 160, 160]), 0, k([3, 10, 25, 24, 22, 20])], [k([0, 25, 85, 145, 155, 155]), 0, k([3, 10, 25, 26, 25, 24])]);
    side(out, 'ForeArm', [k([12, 30, 40, 30, 20, 20]), 0, 0], [k([12, 25, 35, 30, 25, 20]), 0, 0]);
    fingers(out, k([14, 30, 20, 15, 15, 15]));
    return { bones: out, root: { drop: k([0, 0.2, 0.6, 1, 0.97, 1]), pitch: k([0, 10, 45, 88, 86, 88]), z: k([0, 0.05, 0.2, 0.42, 0.44, 0.44]), floor: true } };
  },
};

// --- Getting up --------------------------------------------------------------------------------

/** From lying on the back: sit up, tuck the feet in, push off the ground and stand. */
export const getUpFaceUp: Clip = {
  id: 'get_up_face_up', name: 'Get up (from back)', category: 'Reactions', duration: 2.2, loop: false,
  sample: (t) => {
    const T = [0, 0.55, 1.0, 1.45, 1.85, 2.2];
    const k = keys(T, t);
    const p = ON_BACK;
    const out: Record<string, Ch> = {
      Spine: [k([p.spine[0], 18, 30, 34, 10, 0]), 0, 0], Spine1: [k([p.spine[1], 10, 12, 10, 4, 0]), 0, 0],
      Neck: [k([p.spine[2], 0, -10, -16, -4, 0]), 0, 0], Head: [k([p.spine[3], 4, -10, -16, -4, 0]), k([12, 4, 0, 0, 0, 0]), 0],
    };
    // Sit up with the legs out straight, then draw the knees up, rise through a squat to standing.
    side(out, 'UpLeg', [k([p.upLeg[0], 80, 120, 100, 30, 0]), 0, k([8, 8, 10, 8, 4, 0])], [k([p.upLeg[1], 82, 118, 98, 30, 0]), 0, k([10, 8, 10, 8, 4, 0])]);
    side(out, 'Leg', [k([p.leg[0], -6, -135, -120, -45, -3]), 0, 0], [k([p.leg[1], -8, -135, -120, -45, -3]), 0, 0]);
    side(out, 'Foot', [k([p.foot[0], -10, 30, 30, 14, 0]), 0, 0], [k([p.foot[1], -10, 30, 30, 14, 0]), 0, 0]);
    // Hands push off the floor behind the hips while sitting up, then forward for balance.
    side(out, 'Arm', [k([p.arm[0], -40, 20, 45, 20, 0]), 0, k([p.armOut[0], 20, 16, 14, 8, 3])], [k([p.arm[1], -40, 20, 45, 20, 0]), 0, k([p.armOut[1], 20, 16, 14, 8, 3])]);
    side(out, 'ForeArm', [k([p.foreArm[0], 6, 25, 35, 20, 12]), 0, 0], [k([p.foreArm[1], 6, 25, 35, 20, 12]), 0, 0]);
    fingers(out, k([18, 10, 16, 18, 16, 14]));
    return {
      bones: out,
      root: {
        drop: k([p.drop, 1, 0.92, 0.6, 0.15, 0]), pitch: k([p.pitch, -12, 8, 6, 2, 0]),
        z: k([p.z, -0.36, -0.12, 0, 0, 0]), floor: true,
      },
    };
  },
};

/** From lying face down: push up, come to the knees, step one foot forward and stand. */
const getUpFaceDown: Clip = {
  id: 'get_up_face_down', name: 'Get up (from front)', category: 'Reactions', duration: 2.2, loop: false,
  sample: (t) => {
    const T = [0, 0.5, 0.95, 1.45, 1.9, 2.2];
    const k = keys(T, t);
    // Starts from the end pose of Death (fall forward).
    const out: Record<string, Ch> = {
      Spine: [k([0, -14, -6, 6, 4, 0]), 0, 0], Spine1: [k([0, -8, -2, 4, 2, 0]), 0, 0],
      Neck: [k([-20, -24, -16, -6, -2, 0]), 0, 0], Head: [k([-10, -16, -10, -4, 0, 0]), k([35, 6, 0, 0, 0, 0]), 0],
    };
    // Push-up on straight arms, then onto hands and knees, left foot forward, stand.
    side(out, 'UpLeg', [k([-2, -4, 50, 100, 25, 0]), 0, k([6, 6, 8, 6, 3, 0])], [k([2, -2, 50, 30, 15, 0]), 0, k([8, 8, 8, 6, 3, 0])]);
    side(out, 'Leg', [k([-6, -8, -95, -100, -30, -3]), 0, 0], [k([-10, -10, -95, -105, -40, -3]), 0, 0]);
    side(out, 'Foot', [k([-40, -40, -30, 20, 8, 0]), 0, 0], [k([-35, -35, -30, -30, 6, 0]), 0, 0]);
    // Hands slide back under the shoulders and push the body up.
    side(out, 'Arm', [k([160, 82, 64, 30, 8, 0]), 0, k([20, 14, 10, 8, 4, 3])], [k([155, 82, 64, 34, 10, 0]), 0, k([24, 14, 10, 8, 4, 3])]);
    side(out, 'ForeArm', [k([20, 6, 6, 25, 20, 12]), 0, 0], [k([20, 6, 6, 25, 20, 12]), 0, 0]);
    fingers(out, k([15, 6, 6, 14, 14, 14]));
    return {
      bones: out,
      root: {
        drop: k([1, 0.86, 0.62, 0.45, 0.12, 0]), pitch: k([88, 66, 52, 18, 6, 0]),
        z: k([0.44, 0.36, 0.2, 0.06, 0, 0]), floor: true,
      },
    };
  },
};

export const REACTIONS: Clip[] = [
  hitFrom('front'), hitFrom('back'), hitFrom('left'), hitFrom('right'),
  knockdown, deathForward, deathBackward, getUpFaceUp, getUpFaceDown,
];
