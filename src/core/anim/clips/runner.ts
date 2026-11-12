/**
 * Runner moves: a running slide under low bars, a run leaning into a turn, and a stumble that trips forward and
 * recovers into the run. The lean is the procedural run with the body banked toward the turn.
 */
import type { Ch, Clip } from './types';
import { fingers, side, track } from './helpers';
import { gait, RUN } from './gait';

const STRIDE = 0.66;

/** Run banked into a turn: hips and spine lean in, the head stays level and the outside arm swings wider. */
function lean(dir: 1 | -1): Clip {
  return {
    id: dir > 0 ? 'run_lean_left' : 'run_lean_right', name: dir > 0 ? 'Run leaning left' : 'Run leaning right', category: 'Locomotion',
    duration: STRIDE, loop: true, travel: [0, 0, 5.6],
    sample: (t) => {
      const s = gait(RUN, (t % STRIDE) / STRIDE), b = s.bones as Record<string, Ch>;
      const add = (bone: string, z: number) => { const c = b[bone] ?? [0, 0, 0];b[bone] = [c[0], c[1], c[2] + z]; };
      add('Hips', -10 * dir);add('Spine', -9 * dir);add('Spine1', -6 * dir);add('Head', 12 * dir);
      // The outside arm swings out for balance; the inside arm tucks in.
      add(dir > 0 ? 'RightArm' : 'LeftArm', 10);add(dir > 0 ? 'LeftArm' : 'RightArm', -3);
      return s;
    },
  };
}

/** Drop onto the hip with the lead leg straight, lean back under the bar, then push up into the run. */
export const runSlide: Clip = {
  id: 'run_slide', name: 'Running slide', category: 'Actions', duration: 0.9, loop: false, travel: [0, 0, 4.2],
  sample: (t) => {
    const T = [0, 0.14, 0.3, 0.62, 0.9], k = (v: number[]) => track(T, v)(t);
    const out: Record<string, Ch> = {
      Spine: [k([10, -10, -22, -20, 8]), 0, 0], Spine1: [k([6, -6, -14, -12, 6]), 0, 0], Spine2: [k([2, -2, -6, -6, 2]), 0, 0],
      Neck: [k([0, 8, 18, 16, 0]), 0, 0], Head: [k([-6, 6, 12, 10, -6]), 0, 0],
    };
    // Lead (left) leg reaches forward nearly straight; the trailing leg folds under the body.
    side(out, 'UpLeg', [k([30, 70, 80, 78, 35]), 0, k([-4, -6, -8, -8, -4])], [k([-10, 15, 20, 22, 10]), 0, k([-4, 8, 14, 14, -4])]);
    side(out, 'Leg', [k([-20, -18, -8, -10, -40]), 0, 0], [k([-85, -110, -125, -125, -95]), 0, 0]);
    side(out, 'Foot', [k([10, 20, 25, 25, 10]), 0, 0], [k([15, 10, 0, 0, 10]), 0, 0]);
    // Arms out for balance: the right hand trails toward the ground, the left reaches forward.
    side(out, 'Arm', [k([-20, 30, 45, 40, -10]), 0, k([6, 25, 30, 30, 8])], [k([20, -25, -30, -28, 15]), 0, k([6, 35, 45, 42, 8])]);
    side(out, 'ForeArm', [k([75, 30, 20, 25, 70]), 0, 0], [k([75, 15, 10, 12, 70]), 0, 0]);
    fingers(out, k([25, 12, 8, 8, 25]));
    return { bones: out, root: { drop: k([0, 0.55, 0.8, 0.78, 0.05]), pitch: k([0, -6, -10, -9, 0]), floor: true } };
  },
};

/** Catch a foot, pitch forward with the arms thrown out, take a long catching step and settle back into the run. */
export const stumbleRecover: Clip = {
  id: 'stumble_recover', name: 'Stumble and recover', category: 'Actions', duration: 1, loop: false, travel: [0, 0, 4.5],
  sample: (t) => {
    const T = [0, 0.12, 0.3, 0.52, 0.76, 1], k = (v: number[]) => track(T, v)(t);
    const out: Record<string, Ch> = {
      Spine: [k([8, 22, 36, 26, 14, 8]), 0, k([0, 4, 6, 2, 0, 0])], Spine1: [k([4, 14, 22, 16, 8, 4]), 0, 0], Spine2: [k([2, 6, 10, 6, 3, 2]), 0, 0],
      Neck: [k([0, -8, -16, -10, -4, 0]), 0, 0], Head: [k([-6, -14, -20, -12, -8, -6]), 0, 0],
    };
    // The right foot catches and trails; the left leg swings through for a long catching step.
    side(out, 'UpLeg', [k([25, 35, 65, 50, 20, 30]), 0, -4], [k([-15, -35, -20, 10, 35, -10]), 0, -4]);
    side(out, 'Leg', [k([-30, -70, -40, -25, -60, -30]), 0, 0], [k([-60, -40, -95, -70, -30, -60]), 0, 0]);
    side(out, 'Foot', [k([10, 10, 20, 0, 10, 10]), 0, 0], [k([5, -25, -10, 10, 5, 5]), 0, 0]);
    // Arms fling forward and out to catch the balance, then return to the running swing.
    side(out, 'Arm', [k([-25, 45, 70, 35, 5, -25]), 0, k([6, 30, 40, 20, 8, 6])], [k([25, 55, 75, 40, -10, 25]), 0, k([6, 35, 45, 25, 8, 6])]);
    side(out, 'ForeArm', [k([75, 35, 25, 45, 70, 75]), 0, 0], [k([75, 30, 20, 40, 70, 75]), 0, 0]);
    fingers(out, k([25, 5, 0, 10, 20, 25]));
    return { bones: out, root: { ground: true, lift: k([0.03, 0.05, 0, 0, 0.04, 0.03]) } };
  },
};

export const RUNNER_MOVES: Clip[] = [runSlide, lean(1), lean(-1), stumbleRecover];
