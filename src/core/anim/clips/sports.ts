/**
 * Football moves: an instep shot, a side-foot pass, a slide tackle, the goalkeeper's ready stance, catch and dives,
 * and the Siu celebration (a jump with a half turn that lands feet wide, arms flung down and out).
 * Kicks strike with the right foot while the left stays planted; dives play in place (the game moves the keeper).
 */
import { type Ch, type Clip, type HandTarget, type Sample } from './types';
import { fingers, lerp3, normV, side, track, v } from './helpers';
import { mirrorClip, mirrorSample } from './mirror';

const keys = (T: number[], t: number) => (vals: number[]) => track(T, vals)(t);

/** Weight on the planted foot that fades in after `from` and out before `to`. */
const planted = (t: number, from: number, to: number) => Math.min(1, Math.max(0, (t - from) / 0.08), Math.max(0, (to - t) / 0.08));

/** Instep shot: a long stride on to the left foot, the right knee cocks back, snaps through the ball and follows high. */
export const soccerShoot: Clip = {
  id: 'soccer_shoot', name: 'Shoot (football)', category: 'Sports', duration: 0.95, loop: false,
  sample: (t) => {
    // The foot meets the ball at 0.3 s.
    const k = keys([0, 0.16, 0.3, 0.44, 0.66, 0.95], t);
    const out: Record<string, Ch> = {
      Spine: [k([4, 14, 16, -4, 4, 2]), k([0, -14, 6, 16, 6, 0]), k([0, 4, 6, 2, 0, 0])],
      Spine1: [k([2, 6, 6, -4, 2, 0]), k([0, -8, 4, 10, 4, 0]), 0],
      Neck: [k([0, -4, -6, 2, 0, 0]), 0, 0],
      // Eyes on the ball through the strike.
      Head: [k([0, 10, 18, 8, 0, 0]), k([0, 10, -4, -12, -4, 0]), 0],
    };
    side(out, 'UpLeg', [k([0, 26, 22, 14, 6, 0]), 0, k([-3, 4, 6, 4, 0, -3])], [k([0, -38, 48, 82, 26, 0]), k([0, -6, 0, 6, 2, 0]), k([-3, 2, 0, -2, -2, -3])]);
    side(out, 'Leg', [k([-4, -32, -30, -20, -12, -4]), 0, 0], [k([-4, -112, -18, -14, -48, -4]), 0, 0]);
    // The toe points down so the laces meet the ball.
    side(out, 'Foot', [k([0, 12, 10, 4, 2, 0]), 0, 0], [k([0, -28, -38, -26, -8, 0]), 0, 0]);
    // The left arm swings out and across for balance; the right swings back against the leg.
    side(out, 'Arm', [k([2, 20, 34, 30, 12, 2]), 0, k([4, 40, 58, 46, 18, 4])], [k([2, 28, -26, -36, -6, 2]), 0, k([4, 22, 30, 22, 8, 4])]);
    side(out, 'ForeArm', [k([12, 22, 18, 20, 16, 12]), 0, 0], [k([12, 30, 20, 24, 16, 12]), 0, 0]);
    fingers(out, 10);
    return { bones: out, root: { ground: true, z: k([0, 0.08, 0.12, 0.14, 0.14, 0.14]) }, plant: { Left: planted(t, 0.12, 0.86) } };
  },
};

/** Straight pass: a short backswing and the leg swings straight through the ball, the foot square to the pass. */
export const soccerPass: Clip = {
  id: 'soccer_pass', name: 'Pass (straight)', category: 'Sports', duration: 0.7, loop: false,
  sample: (t) => {
    // The foot meets the ball at 0.22 s.
    const k = keys([0, 0.12, 0.22, 0.34, 0.5, 0.7], t);
    const out: Record<string, Ch> = {
      Spine: [k([2, 8, 10, 4, 2, 2]), 0, 0], Spine1: [k([0, 4, 4, 0, 0, 0]), 0, 0],
      Head: [k([0, 12, 16, 8, 2, 0]), 0, 0],
    };
    side(out, 'UpLeg', [k([0, 18, 16, 12, 4, 0]), 0, -3], [k([0, -24, 20, 36, 12, 0]), 0, -3]);
    side(out, 'Leg', [k([-4, -26, -26, -20, -10, -4]), 0, 0], [k([-4, -70, -22, -12, -16, -4]), 0, 0]);
    side(out, 'Foot', [k([0, 8, 8, 4, 0, 0]), 0, 0], [k([0, -10, 4, 6, 2, 0]), 0, 0]);
    side(out, 'Arm', [k([2, 10, 16, 14, 6, 2]), 0, k([4, 18, 24, 20, 8, 4])], [k([2, 16, -12, -16, -2, 2]), 0, k([4, 12, 16, 12, 6, 4])]);
    side(out, 'ForeArm', [k([12, 18, 16, 16, 14, 12]), 0, 0], [k([12, 22, 16, 18, 14, 12]), 0, 0]);
    fingers(out, 10);
    return { bones: out, root: { ground: true }, plant: { Left: planted(t, 0.06, 0.62) } };
  },
};

/**
 * Side pass with the inside of the right foot: the thigh turns out so the toes point outward and the instep faces the
 * ball, with a locked ankle and a short follow-through. To the left the leg swings out and back across the body; forward
 * it swings straight through; to the right the body opens to the right on the planted left foot and the instep sweeps
 * that way.
 */
function insidePass(to: 'left' | 'forward' | 'right'): Clip {
  const across = to === 'left';
  return {
    id: `soccer_side_pass_${to}`, name: `Side pass ${to} (inside foot)`, category: 'Sports', duration: 0.75, loop: false,
    sample: (t) => {
      // The foot meets the ball at 0.24 s.
      const k = keys([0, 0.13, 0.24, 0.36, 0.52, 0.75], t);
      const out: Record<string, Ch> = {
        Spine: [k([2, 8, 10, 4, 2, 2]), across ? k([0, -8, 6, 12, 4, 0]) : 0, 0], Spine1: [k([0, 4, 4, 0, 0, 0]), across ? k([0, -4, 4, 8, 2, 0]) : 0, 0],
        Head: [k([0, 12, 16, 8, 2, 0]), across ? k([0, 4, 10, 14, 6, 0]) : 0, 0],
      };
      // A twist of a downward-pointing thigh turns the knee and toes out when negative.
      side(out, 'UpLeg', [k([0, 18, 18, 12, 4, 0]), 0, -3], across
        ? [k([0, 4, 18, 24, 8, 0]), k([0, -50, -62, -54, -20, 0]), k([-3, 22, 4, -12, -4, -3])]
        : [k([0, -22, 24, 34, 10, 0]), k([0, -62, -76, -66, -22, 0]), k([-3, 6, 2, 0, -2, -3])]);
      side(out, 'Leg', [k([-4, -28, -30, -22, -10, -4]), 0, 0], [k([-4, across ? -48 : -60, -34, -30, -18, -4]), 0, 0]);
      side(out, 'Foot', [k([0, 8, 10, 6, 0, 0]), 0, 0], [k([0, 14, 18, 12, 2, 0]), 0, 0]);
      side(out, 'Arm', [k([2, 10, 16, 14, 6, 2]), 0, k([4, 22, 30, 26, 10, 4])], [k([2, 14, -10, -14, -2, 2]), 0, k([4, 14, 18, 14, 6, 4])]);
      side(out, 'ForeArm', [k([12, 18, 16, 16, 14, 12]), 0, 0], [k([12, 22, 16, 18, 14, 12]), 0, 0]);
      fingers(out, 10);
      return { bones: out, root: { ground: true, yaw: to === 'right' ? k([0, -30, -50, -50, -25, 0]) : 0 }, plant: { Left: planted(t, 0.06, 0.66) } };
    },
  };
}
export const sidePassLeft = insidePass('left');
export const sidePassForward = insidePass('forward');
export const sidePassRight = insidePass('right');

/** Slide tackle: drop on to the left hip, the right leg sweeps through low and straight, then push back up. */
export const slideTackle: Clip = {
  id: 'slide_tackle', name: 'Slide tackle', category: 'Sports', duration: 1.25, loop: false, travel: [0, 0, 2.6],
  sample: (t) => {
    const k = keys([0, 0.14, 0.3, 0.62, 0.86, 1.08, 1.25], t);
    const out: Record<string, Ch> = {
      Spine: [k([10, -6, -18, -20, -4, 8, 4]), 0, k([0, 6, 10, 10, 4, 0, 0])], Spine1: [k([6, -4, -10, -12, -2, 4, 2]), 0, 0],
      Neck: [k([0, 8, 16, 16, 6, 0, 0]), 0, 0], Head: [k([-4, 6, 12, 12, 4, -2, 0]), 0, 0],
    };
    // Right (tackling) leg reaches forward nearly straight at ground level; the left folds under the hip.
    side(out, 'UpLeg', [k([-8, 16, 24, 24, 34, 18, 0]), 0, k([-4, 8, 14, 14, 6, 0, -3])], [k([28, 72, 84, 82, 52, 12, 0]), 0, k([-4, -4, -6, -6, -4, -3, -3])]);
    side(out, 'Leg', [k([-60, -105, -118, -118, -110, -40, -4]), 0, 0], [k([-20, -12, -4, -6, -50, -30, -4]), 0, 0]);
    side(out, 'Foot', [k([10, 6, 0, 0, 10, 8, 0]), 0, 0], [k([6, 24, 30, 30, 14, 6, 0]), 0, 0]);
    // The left hand trails to the sand to steady the slide; the right arm lifts away from the opponent.
    side(out, 'Arm', [k([-20, -30, -36, -34, -10, 4, 2]), 0, k([6, 30, 40, 40, 24, 8, 4])], [k([20, 30, 40, 38, 18, 6, 2]), 0, k([6, 26, 34, 34, 18, 6, 4])]);
    side(out, 'ForeArm', [k([60, 18, 10, 10, 30, 20, 12]), 0, 0], [k([60, 40, 34, 34, 30, 20, 12]), 0, 0]);
    fingers(out, k([20, 8, 6, 6, 14, 14, 12]));
    return { bones: out, root: { drop: k([0, 0.5, 0.82, 0.82, 0.55, 0.12, 0]), pitch: k([0, -8, -14, -14, -6, 0, 0]), roll: k([0, 10, 18, 18, 10, 0, 0]), floor: true } };
  },
};

/** The goalkeeper's set position, hands ready (`f` 0..1 is a small bounce on the balls of the feet). */
function keeperStance(out: Record<string, Ch>, f = 0) {
  out.Spine = [20 + 2 * f, 0, 0];
  out.Spine1 = [8, 0, 0];
  out.Neck = [-8, 0, 0];
  out.Head = [-14 - 2 * f, 0, 0];
  side(out, 'UpLeg', [36 + 6 * f, 0, 10], [36 + 6 * f, 0, 10]);
  side(out, 'Leg', [-58 - 10 * f, 0, 0], [-58 - 10 * f, 0, 0]);
  side(out, 'Foot', [16 + 4 * f, 0, 0], [16 + 4 * f, 0, 0]);
  side(out, 'Arm', [34, 0, 26], [34, 0, 26]);
  side(out, 'ForeArm', [56, 0, 0], [56, 0, 0]);
  fingers(out, 8);
}

export const keeperReady: Clip = {
  id: 'keeper_ready', name: 'Goalkeeper ready', category: 'Sports', duration: 0.9, loop: true,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    keeperStance(out, 0.5 - 0.5 * Math.cos((t / 0.9) * Math.PI * 2));
    return { bones: out, root: { ground: true } };
  },
};

/** Catch a ball at the chest: open hands come forward to meet it, then gather it in to the body, the hands either side of it. */
export const keeperCatch: Clip = {
  id: 'keeper_catch', name: 'Goalkeeper catch', category: 'Sports', duration: 0.9, loop: false,
  sample: (t) => {
    const k = keys([0, 0.18, 0.3, 0.55, 0.9], t), out: Record<string, Ch> = {};
    keeperStance(out, k([0, 0.4, 0.6, 0.2, 0]));
    out.Spine = [k([20, 16, 22, 14, 10]), 0, 0];
    out.Head = [k([-14, -12, -2, 10, 4]), 0, 0];
    fingers(out, k([8, 4, 6, 20, 22]));
    // The hands stay a ball's width apart: palms forward to meet it, then wrapped round its sides at the chest.
    const g = k([0, 0, 0.2, 1, 1]), on = k([0, 1, 1, 1, 1]);
    const hand = (x: 1 | -1): HandTarget => ({
      pos: v(x * (0.12 + 0.02 * g), -0.12 - 0.2 * g, 0.42 - 0.14 * g), pole: v(x, -0.6, -0.3),
      dir: normV(lerp3(v(x * 0.15, 1, 0.15), v(x * 0.2, 0.25, 1), g)), palm: normV(lerp3(v(0, 0, 1), v(-x, 0.25, 0), g)),
    });
    return { bones: out, root: { ground: true }, ik: { Left: hand(1), Right: hand(-1) }, ikWeight: { Left: on, Right: on } };
  },
};

/**
 * Dive to the keeper's left: load, spring sideways with both arms stretched past the head toward the ball, land on the
 * side with the hands still reaching, then roll back up to the feet. A low dive stays near the sand and lies flatter,
 * hands sweeping along the ground for shots at the foot of the post. The hands stay apart, palms toward the ball.
 */
function dive(left: boolean, low: boolean): Clip {
  const name = `Goalkeeper ${low ? 'low ' : ''}dive ${left ? 'left' : 'right'}`;
  return {
    id: `keeper_${low ? 'low_' : ''}dive_${left ? 'left' : 'right'}`, name, category: 'Sports',
    duration: 1.7, loop: false, travel: [left ? 1.1 : -1.1, 0, 0],
    sample: (t) => {
      const k = keys([0, 0.12, 0.3, 0.48, 0.68, 1.05, 1.4, 1.7], t), out: Record<string, Ch> = {};
      keeperStance(out, k([0, 1, 0, 0, 0, 0, 0.6, 0]));
      out.Spine = [k([20, 24, 4, 0, 4, 8, 22, 20]), 0, k([0, 6, 16, 18, 14, 12, 4, 0])];
      out.Spine1 = [k([8, 8, 0, 0, 2, 4, 8, 8]), 0, k([0, 2, 8, 8, 6, 6, 2, 0])];
      out.Head = [k([-14, -16, -8, -6, -10, -12, -14, -14]), 0, k([0, 0, -10, -12, -10, -8, 0, 0])];
      // Left leg drives (pushes off); the right swings up and across with the body.
      side(out, 'UpLeg', [k([36, 52, 8, 6, 18, 30, 46, 36]), 0, k([10, 6, 22, 26, 20, 16, 12, 10])], [k([36, 50, 22, 20, 32, 44, 50, 36]), 0, k([10, 4, -4, -6, 0, 4, 8, 10])]);
      side(out, 'Leg', [k([-58, -80, -6, -6, -24, -50, -80, -58]), 0, 0], [k([-58, -80, -30, -28, -44, -70, -84, -58]), 0, 0]);
      side(out, 'Foot', [k([16, 26, -24, -20, -4, 6, 20, 16]), 0, 0], [k([16, 26, -10, -10, 0, 10, 20, 16]), 0, 0]);
      fingers(out, k([8, 8, 2, 2, 6, 14, 10, 8]));
      if (low) {
        // Flat along the sand: the torso stays straight and the trailing leg lines up with the body.
        out.Spine[2] *= 0.3;out.Spine1[2] *= 0.3;
        out.RightUpLeg = [out.RightUpLeg[0] * 0.6, 0, -out.RightUpLeg[2] + 12 * k([0, 0, 1, 1, 1, 1, 0, 0])];
        out.RightLeg = [out.RightLeg[0] * 0.6, 0, 0];
      }
      // Both hands reach past the head toward the ball, a hand's width apart and a little in front of the face, palms
      // toward the shot. The collarbones lift with the arms so the shoulders keep their shape.
      const reach = k([0, 0, 1, 1, 1, 0.9, 0.2, 0]);
      side(out, 'Shoulder', [0, 0, 26 * reach], [0, 0, 22 * reach]);
      out.Head = [out.Head[0], 0, out.Head[2] + 8 * reach];
      const hand = (x: 1 | -1): HandTarget => ({
        pos: v(x > 0 ? 0.2 : -0.03, x > 0 ? 0.44 : 0.4, low ? 0.36 : 0.3), pole: v(x, 0.1, -0.5),
        dir: normV(v(x * 0.2, 1, 0.35)), palm: normV(v(0, -0.2, 1)),
      });
      const s: Sample = {
        bones: out,
        ik: { Left: hand(1), Right: hand(-1) }, ikWeight: { Left: reach, Right: reach },
        root: low
          ? { roll: k([0, -4, 90, 100, 100, 96, 30, 0]), drop: k([0, 0.35, 0.85, 0.92, 0.92, 0.9, 0.35, 0]), floor: true }
          : { roll: k([0, -6, 62, 80, 84, 82, 30, 0]), drop: k([0, 0.12, 0.25, 0.42, 0.72, 0.72, 0.3, 0]), lift: 0.5 * k([0, 0, 1, 1, 0, 0, 0, 0]), floor: true },
      };
      return left ? s : mirrorSample(s);
    },
  };
}
export const keeperDiveLeft = dive(true, false);
export const keeperDiveRight = dive(false, false);
export const keeperLowDiveLeft = dive(true, true);
export const keeperLowDiveRight = dive(false, true);

/**
 * The Siu: Ara's original keyframed Jump (from before the motion-captured one) with a half turn in the air, landing
 * feet wide with both arms flung down and out, chest up, held for the crowd.
 */
export const siuCelebration: Clip = {
  id: 'siu_celebration', name: 'Siu celebration', category: 'Sports', duration: 2.4, loop: false,
  sample: (t) => {
    const T = [0, 0.25, 0.4, 0.55, 0.75, 0.95, 1.1, 1.3, 2.05, 2.4];
    const k = (vals: number[]) => track(T, vals)(t);
    const out: Record<string, Ch> = {
      Spine: [k([0, 22, -5, 8, 10, 6, -8, -12, -12, -4]), 0, 0],
      Spine1: [k([0, 8, -4, 4, 4, 2, -6, -8, -8, -2]), 0, 0],
      Spine2: [0, 0, 0],
      Neck: [k([0, 0, 0, 0, 0, 0, -4, -8, -8, -2]), 0, 0],
      Head: [k([0, -14, 4, -4, -6, -2, -10, -14, -14, -4]), 0, 0],
    };
    // The jump's legs, landing wide with soft knees.
    side(out, 'UpLeg', [k([0, 55, -5, 40, 35, 20, 30, 14, 14, 4]), 0, k([4, 4, 4, 6, 10, 14, 18, 18, 18, 6])], [k([0, 55, -5, 40, 35, 20, 30, 14, 14, 4]), 0, k([4, 4, 4, 6, 10, 14, 18, 18, 18, 6])]);
    side(out, 'Leg', [k([-3, -85, 0, -60, -50, -20, -52, -26, -26, -6]), 0, 0], [k([-3, -85, 0, -60, -50, -20, -52, -26, -26, -6]), 0, 0]);
    side(out, 'Foot', [k([0, 28, -35, -10, -10, 0, 22, 10, 10, 2]), 0, 0], [k([0, 28, -35, -10, -10, 0, 22, 10, 10, 2]), 0, 0]);
    // Arms drive up through the jump, then fling down and out, straight, palms down.
    side(out, 'Arm', [k([0, -40, 130, 90, 70, 30, -14, -18, -18, 0]), k([0, 0, 0, 0, 0, 0, -30, -36, -36, 0]), k([4, 8, 10, 20, 20, 36, 48, 50, 50, 8])], [k([0, -40, 130, 90, 70, 30, -14, -18, -18, 0]), k([0, 0, 0, 0, 0, 0, -30, -36, -36, 0]), k([4, 8, 10, 20, 20, 36, 48, 50, 50, 8])]);
    side(out, 'ForeArm', [k([12, 15, 10, 30, 30, 20, 4, 2, 2, 12]), 0, 0], [k([12, 15, 10, 30, 30, 20, 4, 2, 2, 12]), 0, 0]);
    side(out, 'Hand', [0, 0, k([0, 0, 0, 0, 0, 0, -10, -14, -14, 0])], [0, 0, k([0, 0, 0, 0, 0, 0, -10, -14, -14, 0])]);
    fingers(out, k([16, 16, 16, 16, 16, 8, 2, 2, 2, 12]));
    return { bones: out, root: { ground: true, lift: k([0, 0, 0.06, 0.38, 0.3, 0, 0, 0, 0, 0]), yaw: k([0, 0, 0, 90, 170, 180, 180, 180, 180, 180]) } };
  },
};

// --- Handling the ball ---------------------------------------------------------------------------------------------
// Hands holding the ball are placed in floor space (metres at 1.8 m from the floor under the character, +X left, +Z
// forward), so the ball's path is the hands' path. Throws are right-handed; the left-hand throws are their mirrors.

type V3 = [number, number, number];
/** A smooth path through timed points. */
const path = (T: number[], pts: V3[]) => (t: number): V3 => [0, 1, 2].map((d) => track(T, pts.map((q) => q[d]))(t)) as V3;
const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const floorHand = (pos: V3, palm: V3, dir: V3, pole: V3): HandTarget => ({ pos, palm: normV(palm), dir: normV(dir), pole, space: 'floor' });
const R = 0.11;
/** A ball flying from `from` with velocity `vel` (m/s), falling and staying on the floor. */
const fly = (from: V3, vel: V3, dt: number): V3 => [from[0] + vel[0] * dt, Math.max(R, from[1] + vel[1] * dt - 4.9 * dt * dt), from[2] + vel[2] * dt];
/** Ball paths for the handling clips (character floor space, metres at 1.8 m). */
export const BALL_PATHS: Record<string, (t: number) => V3> = {};
/** When the ball leaves the hand in each throw (seconds into the clip). */
export const THROW_RELEASE = { throw_side_right: 0.5, throw_side_left: 0.5, throw_two_hands: 0.62, throw_low_right: 0.72, throw_low_left: 0.72 } as const;

/**
 * Bend at the hips and knees over a ball in front of the feet, take it in both hands, one either side of it, and stand
 * with it at the chest. The ball sits beyond the knees, so the arms reach past them rather than between them.
 */
const pickT = [0, 0.35, 0.6, 0.75, 1.1, 1.5], pickMid = path(pickT, [[0, 0.9, 0.3], [0, 0.4, 0.52], [0, 0.14, 0.52], [0, 0.26, 0.5], [0, 1.05, 0.34], [0, 1.1, 0.3]]);
export const ballPickUp: Clip = {
  id: 'ball_pick_up', name: 'Pick up ball', category: 'Sports', duration: 1.5, loop: false,
  sample: (t) => {
    const k = keys(pickT, t), out: Record<string, Ch> = {
      Spine: [k([0, 46, 54, 50, 14, 2]), 0, 0], Spine1: [k([0, 14, 18, 14, 4, 0]), 0, 0], Neck: [k([0, -6, -10, -8, 0, 0]), 0, 0], Head: [k([0, -4, -2, -4, 2, 0]), 0, 0],
    };
    side(out, 'UpLeg', [k([0, 62, 74, 70, 18, 0]), 0, -3], [k([0, 62, 74, 70, 18, 0]), 0, -3]);
    side(out, 'Leg', [k([-3, -84, -100, -94, -26, -3]), 0, 0], [k([-3, -84, -100, -94, -26, -3]), 0, 0]);
    side(out, 'Foot', [k([0, 22, 28, 26, 8, 0]), 0, 0], [k([0, 22, 28, 26, 8, 0]), 0, 0]);
    fingers(out, k([12, 8, 14, 18, 18, 18]));
    const m = pickMid(t), on = k([0, 0.7, 1, 1, 1, 1]);
    const hand = (x: 1 | -1) => floorHand([x * 0.13, m[1], m[2]], [-x, 0.1, 0], [x * 0.1, 0.1, 1], [x, -0.3, -0.4]);
    return { bones: out, root: { ground: true }, ik: { Left: hand(1), Right: hand(-1) }, ikWeight: { Left: on, Right: on } };
  },
};
BALL_PATHS.ball_pick_up = (t) => t < 0.6 ? [0, R, 0.54] : add(pickMid(t), [0, 0, 0.03]);

/** Bounce the ball in place with the right hand: push it down, let it come back up to the palm (loops). */
const bounceY = (u: number) => 0.74 - 0.63 * Math.sin(Math.PI * u);
export const ballBounce: Clip = {
  id: 'ball_bounce', name: 'Bounce ball', category: 'Sports', duration: 0.7, loop: true,
  sample: (t) => {
    const u = (t % 0.7) / 0.7, c = Math.cos(Math.PI * u) ** 2, out: Record<string, Ch> = {
      Spine: [16, 0, 0], Spine1: [4, 0, 0], Head: [10, 0, 0],
    };
    side(out, 'UpLeg', [26 + 4 * c, 0, 6], [26 + 4 * c, 0, 6]);
    side(out, 'Leg', [-46 - 8 * c, 0, 0], [-46 - 8 * c, 0, 0]);
    side(out, 'Foot', [14 + 4 * c, 0, 0], [14 + 4 * c, 0, 0]);
    side(out, 'Arm', [30, 0, 28], [0, 0, 0]);
    side(out, 'ForeArm', [70, 0, 0], [0, 0, 0]);
    fingers(out, 6);
    // The palm rides down with the ball's top and lifts a little while it is on the floor.
    const hand = floorHand([-0.2, 0.99 - 0.12 * c, 0.35], [0, -1, 0.1], [0, -0.25, 1], [-1, 0, -0.3]);
    return { bones: out, root: { ground: true }, ik: { Right: hand } };
  },
};
BALL_PATHS.ball_bounce = (t) => { const u = (t % 0.7) / 0.7;return [-0.2, bounceY(u), 0.41]; };

/** Right-hand sidearm throw: step on to the left foot, sling the ball round from behind at shoulder height and let go in front. */
const sideT = [0, 0.22, 0.42, 0.5, 0.62, 0.85, 1.1];
const sideHand = path(sideT, [[-0.25, 1, 0.25], [-0.62, 1.15, -0.3], [-0.52, 1.2, 0.22], [-0.28, 1.25, 0.52], [0.22, 1.1, 0.5], [0.02, 1, 0.3], [-0.25, 1, 0.25]]);
const sidePalm: V3 = normV([0.1, 0.25, 1]), sideDir: V3 = normV([-1, 0.15, 0.1]);
const throwSideRight: Clip = {
  id: 'throw_side_right', name: 'Side throw (right hand)', category: 'Sports', duration: 1.1, loop: false,
  sample: (t) => {
    const k = keys(sideT, t), out: Record<string, Ch> = {
      Spine: [k([0, 2, 6, 8, 10, 4, 0]), k([0, -30, -10, 16, 26, 10, 0]), 0], Spine1: [k([0, 0, 2, 4, 4, 2, 0]), k([0, -12, -4, 8, 12, 4, 0]), 0],
      Head: [k([0, 0, 0, 0, 0, 0, 0]), k([0, 24, 10, -12, -20, -8, 0]), 0],
    };
    side(out, 'UpLeg', [k([0, 10, 30, 34, 30, 14, 0]), 0, -3], [k([0, -6, -14, -18, -14, -6, 0]), 0, -3]);
    side(out, 'Leg', [k([-4, -12, -30, -34, -30, -14, -4]), 0, 0], [k([-4, -10, -16, -22, -18, -8, -4]), 0, 0]);
    side(out, 'Foot', [k([0, 4, 10, 10, 8, 4, 0]), 0, 0], [k([0, -4, -10, -12, -8, -2, 0]), 0, 0]);
    side(out, 'Arm', [k([2, 34, 40, 26, 6, 10, 2]), 0, k([4, 30, 34, 28, 18, 10, 4])], [0, 0, 0]);
    side(out, 'ForeArm', [k([12, 40, 40, 30, 30, 20, 12]), 0, 0], [0, 0, 0]);
    fingers(out, 10);
    const on = k([1, 1, 1, 1, 0.6, 0.2, 0]);
    return { bones: out, root: { ground: true }, ik: { Right: floorHand(sideHand(t), sidePalm, sideDir, [-0.5, -1, -0.4]) }, ikWeight: { Right: on } };
  },
};
const sideBall = (t: number) => add(add(sideHand(t), sidePalm, 0.12), sideDir, 0.05);
BALL_PATHS.throw_side_right = (t) => t < 0.5 ? sideBall(t) : fly(sideBall(0.5), [0.6, 2.4, 13], t - 0.5);
export { throwSideRight };
export const throwSideLeft = mirrorClip(throwSideRight, 'throw_side_left', 'Side throw (left hand)');
BALL_PATHS.throw_side_left = (t) => { const q = BALL_PATHS.throw_side_right(t);return [-q[0], q[1], q[2]]; };

/** Two-hand throw forward: the ball goes back over the head with the back arched, then both arms whip it forward. */
const twoT = [0, 0.25, 0.45, 0.62, 0.8, 1.05, 1.3];
const twoMid = path(twoT, [[0, 1.15, 0.32], [0, 1.5, 0.16], [0, 1.66, 0.02], [0, 1.72, 0.3], [0, 1.45, 0.52], [0, 1.25, 0.4], [0, 1.15, 0.32]]);

export const throwTwoHands: Clip = {
  id: 'throw_two_hands', name: 'Two-hand throw forward', category: 'Sports', duration: 1.3, loop: false,
  sample: (t) => {
    const k = keys(twoT, t), out: Record<string, Ch> = {
      Spine: [k([0, -4, -16, 6, 14, 6, 0]), 0, 0], Spine1: [k([0, -2, -8, 4, 8, 2, 0]), 0, 0], Head: [k([0, -6, -4, 0, 4, 2, 0]), 0, 0],
    };
    side(out, 'UpLeg', [k([0, 14, 14, 16, 20, 10, 0]), 0, -3], [k([0, -2, -6, 0, 6, 2, 0]), 0, -3]);
    side(out, 'Leg', [k([-4, -16, -20, -14, -18, -10, -4]), 0, 0], [k([-4, -12, -18, -10, -14, -8, -4]), 0, 0]);
    side(out, 'Foot', [k([0, 4, 6, 4, 6, 2, 0]), 0, 0], [k([0, -2, -4, 0, 2, 0, 0]), 0, 0]);
    fingers(out, 8);
    // The collarbones lift with the arms so the shoulders and neck keep their shape overhead.
    const up = k([0, 0.5, 1, 1, 0.5, 0.15, 0]);
    side(out, 'Shoulder', [0, 0, 18 * up], [0, 0, 18 * up]);
    // Hands on the back and sides of the ball, fingers spread up and out, palms toward each other and forward.
    const m = twoMid(t), on = k([1, 1, 1, 1, 0.5, 0.15, 0]);
    const hand = (x: 1 | -1) => floorHand([m[0] + x * 0.11, m[1] - 0.02, m[2] - 0.05], [-x * 0.75, 0, 0.65], [x * 0.3, 1, 0.1], [x, -0.5, -0.4]);
    return { bones: out, root: { ground: true }, ik: { Left: hand(1), Right: hand(-1) }, ikWeight: { Left: on, Right: on } };
  },
};
const twoBall = (t: number) => twoMid(t);
BALL_PATHS.throw_two_hands = (t) => t < 0.62 ? twoBall(t) : fly(twoBall(0.62), [0, 3, 11], t - 0.62);

/** Low one-hand throw: a long step on to the left foot, the right arm swings back and bowls the ball along the ground. */
const lowT = [0, 0.25, 0.45, 0.62, 0.72, 0.9, 1.15, 1.4];
const lowHand = path(lowT, [[-0.22, 1, 0.3], [-0.25, 0.9, 0.1], [-0.3, 0.72, -0.45], [-0.25, 0.32, 0.18], [-0.18, 0.22, 0.52], [-0.12, 0.5, 0.85], [-0.2, 0.85, 0.5], [-0.22, 1, 0.3]]);
// The palm faces forward and in, so the forearm turns only a little from the relaxed arm.
const lowPalm: V3 = normV([0.55, 0.3, 0.8]), lowDir: V3 = normV([0, -1, 0.25]);
const throwLowRight: Clip = {
  id: 'throw_low_right', name: 'Low throw (right hand)', category: 'Sports', duration: 1.4, loop: false,
  sample: (t) => {
    const k = keys(lowT, t), out: Record<string, Ch> = {
      Spine: [k([0, 8, 20, 38, 44, 34, 12, 0]), k([0, -6, -14, -4, 4, 6, 2, 0]), 0], Spine1: [k([0, 2, 6, 10, 12, 8, 2, 0]), 0, 0],
      Neck: [k([0, 0, -6, -10, -12, -8, -2, 0]), 0, 0], Head: [k([0, 0, -10, -18, -22, -14, -4, 0]), 0, 0],
    };
    side(out, 'UpLeg', [k([0, 10, 40, 62, 66, 56, 24, 0]), 0, -3], [k([0, -4, -10, -4, 0, -4, -4, 0]), 0, -3]);
    side(out, 'Leg', [k([-4, -20, -60, -92, -98, -82, -30, -4]), 0, 0], [k([-4, -20, -60, -96, -106, -92, -40, -4]), 0, 0]);
    side(out, 'Foot', [k([0, 6, 18, 26, 28, 22, 8, 0]), 0, 0], [k([0, 0, -10, -20, -24, -18, -6, 0]), 0, 0]);
    side(out, 'Arm', [k([2, 10, 30, 40, 40, 30, 10, 2]), 0, k([4, 16, 30, 36, 36, 26, 10, 4])], [0, 0, 0]);
    side(out, 'ForeArm', [k([12, 20, 40, 50, 50, 40, 20, 12]), 0, 0], [0, 0, 0]);
    fingers(out, 10);
    const on = k([1, 1, 1, 1, 1, 0.5, 0.15, 0]);
    return { bones: out, root: { ground: true }, ik: { Right: floorHand(lowHand(t), lowPalm, lowDir, [-0.6, 0.2, -1]) }, ikWeight: { Right: on } };
  },
};
const lowBall = (t: number) => { const q = add(add(lowHand(t), lowPalm, 0.12), lowDir, 0.04);return [q[0], Math.max(R, q[1]), q[2]] as V3; };
BALL_PATHS.throw_low_right = (t) => t < 0.72 ? lowBall(t) : fly(lowBall(0.72), [0, 0, 9], t - 0.72);
export { throwLowRight };
export const throwLowLeft = mirrorClip(throwLowRight, 'throw_low_left', 'Low throw (left hand)');
BALL_PATHS.throw_low_left = (t) => { const q = BALL_PATHS.throw_low_right(t);return [-q[0], q[1], q[2]]; };

export const SPORTS: Clip[] = [soccerShoot, soccerPass, sidePassLeft, sidePassForward, sidePassRight, slideTackle, keeperReady, keeperCatch, keeperDiveLeft, keeperDiveRight, keeperLowDiveLeft, keeperLowDiveRight, ballPickUp, ballBounce, throwSideRight, throwSideLeft, throwTwoHands, throwLowRight, throwLowLeft, siuCelebration];

/** When a kick's foot meets the ball (seconds into the clip), for games that release the ball on contact. */
export const KICK_CONTACT = { soccer_shoot: 0.3, soccer_pass: 0.22, soccer_side_pass_left: 0.24, soccer_side_pass_forward: 0.24, soccer_side_pass_right: 0.24 } as const;
