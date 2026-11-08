/** One-shot actions: jump phases, running jump, fall, punch, hit reaction (Jump and Low punch are motion capture). */
import { type Ch, type Clip } from './types';
import { fingers, fist, FISTS, side, track } from './helpers';

export const fall: Clip = {
  id: 'fall', name: 'Fall', category: 'Actions', duration: 1.9, loop: false,
  sample: (t) => {
    const T = [0, 0.25, 0.6, 0.85, 1.0, 1.9];
    const k = (v: number[]) => track(T, v)(t);
    const out: Record<string, Ch> = {
      Spine: [k([0, -5, -10, -4, -2, 0]), 0, 0],
      Spine1: [k([0, -3, -8, -3, -1, 0]), 0, 0],
      Neck: [k([0, 8, 18, 10, 4, -4]), 0, 0],
      Head: [k([0, 5, 12, 6, 0, -6]), k([0, 0, 0, 10, 12, 15]), 0],
    };
    side(out, 'UpLeg', [k([0, 25, 45, 22, 14, 8]), 0, k([0, 2, 6, 8, 8, 8])], [k([0, 22, 40, 26, 18, 12]), 0, k([0, 2, 5, 10, 10, 10])]);
    side(out, 'Leg', [k([0, -45, -60, -25, -15, -10]), 0, 0], [k([0, -40, -55, -30, -22, -18]), 0, 0]);
    side(out, 'Foot', [k([0, 10, 5, -10, -15, -20]), 0, 0], [k([0, 10, 5, -10, -15, -18]), 0, 0]);
    side(out, 'Arm', [k([0, 40, 60, 25, 0, -8]), 0, k([0, 15, 55, 45, 30, 22])], [k([0, 35, 55, 20, 0, -6]), 0, k([0, 15, 60, 50, 32, 25])]);
    side(out, 'ForeArm', [k([0, 20, 35, 20, 10, 6]), 0, 0], [k([0, 20, 30, 22, 12, 8]), 0, 0]);
    fingers(out, k([12, 20, 30, 20, 18, 18]));
    return {
      bones: out,
      root: { drop: k([0, 0.15, 0.55, 1, 0.96, 1]), pitch: k([0, -5, -50, -88, -84, -88]), z: k([0, -0.05, -0.25, -0.45, -0.46, -0.46]), floor: true },
    };
  },
};

/** Airborne pose (also the end of Jump start and the start of Jump land). */
function airPose(out: Record<string, Ch>, f = 0) {
  out.Spine = [6 + 2 * f, 0, 0];
  out.Spine1 = [2, 0, 0];
  out.Head = [-4 - 2 * f, 0, 0];
  side(out, 'UpLeg', [32 + 6 * f, 0, 5], [26 - 4 * f, 0, 5]);
  side(out, 'Leg', [-52 - 8 * f, 0, 0], [-40 + 6 * f, 0, 0]);
  side(out, 'Foot', [-14, 0, 0], [-10, 0, 0]);
  side(out, 'Arm', [70 + 10 * f, 0, 22 + 6 * f], [64 - 8 * f, 0, 24 - 4 * f]);
  side(out, 'ForeArm', [32, 0, 0], [28, 0, 0]);
  fingers(out, 14);
}

export const jumpStart: Clip = {
  id: 'jump_start', name: 'Jump start', category: 'Actions', duration: 0.45, loop: false,
  sample: (t) => {
    const T = [0, 0.22, 0.36, 0.45];
    const k = (v: number[]) => track(T, v)(t);
    const out: Record<string, Ch> = {
      Spine: [k([0, 24, -4, 6]), 0, 0], Spine1: [k([0, 8, -4, 2]), 0, 0], Head: [k([0, -14, 4, -4]), 0, 0],
    };
    side(out, 'UpLeg', [k([0, 58, -6, 32]), 0, 4], [k([0, 58, -6, 26]), 0, 4]);
    side(out, 'Leg', [k([-3, -90, 0, -52]), 0, 0], [k([-3, -90, 0, -40]), 0, 0]);
    side(out, 'Foot', [k([0, 30, -36, -14]), 0, 0], [k([0, 30, -36, -10]), 0, 0]);
    // Arms swing back in the crouch, then drive up through takeoff.
    side(out, 'Arm', [k([0, -42, 120, 70]), 0, k([4, 8, 14, 22])], [k([0, -42, 120, 64]), 0, k([4, 8, 14, 24])]);
    side(out, 'ForeArm', [k([12, 15, 12, 32]), 0, 0], [k([12, 15, 12, 28]), 0, 0]);
    fingers(out, 16);
    // Feet stay down until takeoff; the last frames rise into the in-air pose.
    return { bones: out, root: { ground: true, lift: k([0, 0, 0.04, 0.1]) } };
  },
};

export const jumpAir: Clip = {
  id: 'jump_air', name: 'Jump (in air)', category: 'Actions', duration: 0.8, loop: true,
  sample: (t) => {
    const f = Math.sin((t / 0.8) * Math.PI * 2); // gentle float: legs and arms drift for balance
    const out: Record<string, Ch> = {};
    airPose(out, f * 0.5);
    // Hips at standing height so the tucked feet clear the floor (the engine moves the body).
    return { bones: out, root: { y: 0.1 } };
  },
};

export const jumpLand: Clip = {
  id: 'jump_land', name: 'Jump land', category: 'Actions', duration: 0.6, loop: false,
  sample: (t) => {
    const T = [0, 0.12, 0.3, 0.6];
    const k = (v: number[]) => track(T, v)(t);
    const out: Record<string, Ch> = {
      Spine: [k([6, 26, 12, 0]), 0, 0], Spine1: [k([2, 9, 4, 0]), 0, 0], Head: [k([-4, -14, -6, 0]), 0, 0],
    };
    side(out, 'UpLeg', [k([32, 60, 30, 0]), 0, k([5, 6, 4, 0])], [k([26, 60, 30, 0]), 0, k([5, 6, 4, 0])]);
    side(out, 'Leg', [k([-52, -92, -45, -3]), 0, 0], [k([-40, -92, -45, -3]), 0, 0]);
    side(out, 'Foot', [k([-14, 32, 14, 0]), 0, 0], [k([-10, 32, 14, 0]), 0, 0]);
    side(out, 'Arm', [k([70, 34, 14, 0]), 0, k([22, 18, 8, 4])], [k([64, 34, 14, 0]), 0, k([24, 18, 8, 4])]);
    side(out, 'ForeArm', [k([32, 30, 20, 12]), 0, 0], [k([28, 30, 20, 12]), 0, 0]);
    fingers(out, 16);
    // Touchdown on the first frame, then the knees absorb the impact.
    return { bones: out, root: { ground: true, lift: k([0.04, 0, 0, 0]) } };
  },
};

export const jumpRunning: Clip = {
  id: 'jump_running', name: 'Running jump', category: 'Actions', duration: 0.9, loop: false, travel: [0, 0, 3.6],
  sample: (t) => {
    // Take off from the left foot, stride through the air, land on the right and run on.
    const T = [0, 0.12, 0.42, 0.68, 0.9];
    const k = (v: number[]) => track(T, v)(t);
    const out: Record<string, Ch> = {
      Spine: [k([10, 14, 4, 16, 10]), 0, 0], Spine1: [k([4, 6, 0, 6, 4]), k([0, 4, 0, -3, 0]), 0], Head: [k([-8, -10, -2, -10, -8]), 0, 0],
    };
    // Left: push-off leg, extends behind. Right: drive knee up, reaches forward to land.
    side(out, 'UpLeg', [k([10, -18, -24, -6, 10]), 0, 3], [k([10, 70, 52, 24, 10]), 0, 3]);
    side(out, 'Leg', [k([-30, -8, -40, -70, -30]), 0, 0], [k([-30, -95, -30, -22, -30]), 0, 0]);
    // Flat at the starting stance and touchdown; toe-down belongs to the airborne leg,
    // otherwise the original crouched start drove the toe tips below the floor.
    side(out, 'Foot', [k([20, 20, -10, 10, 20]), 0, 0], [k([20, 10, 0, -2, 20]), 0, 0]);
    // Arms opposite the legs: right arm back with the left leg pushing, left arm drives forward.
    side(out, 'Arm', [k([10, 55, 70, 30, 10]), 0, k([6, 12, 20, 10, 6])], [k([10, -35, -20, 20, 10]), 0, k([6, 10, 18, 8, 6])]);
    side(out, 'ForeArm', [k([60, 70, 45, 60, 60]), 0, 0], [k([60, 40, 30, 70, 60]), 0, 0]);
    fingers(out, 20);
    return { bones: out, root: { ground: true, lift: k([0, 0.06, 0.34, 0.02, 0]) } };
  },
};

export const punch: Clip = {
  id: 'punch', name: 'Punch', category: 'Combat', duration: 0.9, loop: false,
  sample: (t) => {
    const T = [0, 0.25, 0.4, 0.55, 0.9];
    const k = (v: number[]) => track(T, v)(t);
    const out: Record<string, Ch> = {
      Hips: [0, k([0, -4, 6, 5, 0]), 0],
      Spine1: [6, k([0, -6, 11, 9, 0]), 0],
      Spine2: [0, k([0, -3, 5, 4, 0]), 0],
      Head: [-6, k([0, 6, -12, -10, 0]), 0],
    };
    side(out, 'Arm', [55, 0, 12], [k([55, 55, 86, 84, 55]), 0, k([12, 14, 16, 16, 12])]);
    side(out, 'ForeArm', [120, 0, 0], [k([120, 125, 8, 15, 120]), 0, 0]);
    side(out, 'UpLeg', [14, 0, 4], [k([-6, -6, -10, -10, -6]), 0, 4]);
    side(out, 'Leg', [-20, 0, 0], [-8, 0, 0]);
    side(out, 'Foot', [6, 0, 0], [0, 0, 0]);
    fist(out);
    return { bones: out, root: { ground: true }, thumbs: FISTS };
  },
};

export const hit: Clip = {
  id: 'hit', name: 'Hit reaction', category: 'Actions', duration: 0.8, loop: false,
  sample: (t) => {
    const T = [0, 0.1, 0.3, 0.8];
    const k = (v: number[]) => track(T, v)(t);
    const out: Record<string, Ch> = {
      Spine: [k([0, -18, -8, 0]), 0, 0], Spine1: [k([0, -12, -5, 0]), 0, 0], Neck: [k([0, -15, -5, 0]), 0, 0],
      Head: [k([0, -20, 5, 0]), k([0, 10, 4, 0]), 0],
    };
    side(out, 'Arm', [k([0, 25, 10, 0]), 0, k([3, 22, 10, 3])], [k([0, 20, 8, 0]), 0, k([3, 25, 10, 3])]);
    side(out, 'ForeArm', [k([12, 40, 22, 12]), 0, 0], [k([12, 35, 20, 12]), 0, 0]);
    side(out, 'UpLeg', [0, 0, 0], [k([0, -15, -10, 0]), 0, 0]);
    side(out, 'Leg', [-3, 0, 0], [k([-3, -22, -10, -3]), 0, 0]);
    fingers(out, k([14, 30, 20, 14]));
    return { bones: out, root: { ground: true, z: k([0, -0.04, -0.06, -0.05]) } };
  },
};
