/**
 * Swimming. The water surface is the floor plane (y = 0): swimmers float with the body below it and the head
 * above, as Studio's water and the builder's water preview show. Strokes carry their speed in `travel`;
 * the dive and climb-out author their own path around an even travel so engines can play them in place.
 */
import type { Ch, Clip } from './types';
import { cyc, fingers, side, track } from './helpers';

const TAU = Math.PI * 2;
/** Hip heights (metres at 1.8 m, relative to standing) for an upright swimmer and a prone one at the surface. */
const UPRIGHT = -1.58, PRONE = -0.96;

/** Treading water: upright, eggbeater kick, hands sculling just below the surface, head clear. */
export const treadWater: Clip = {
  id: 'tread_water', name: 'Tread water', category: 'Swimming', duration: 2, loop: true,
  sample: (t) => {
    const a = (t / 2) * TAU, out: Record<string, Ch> = { Spine: [6, 0, 0], Spine1: [3, 0, 0], Neck: [-4, 0, 0], Head: [-3, 4 * Math.sin(a / 2), 0] };
    // Each leg circles in turn (eggbeater): knee out and bent, the shin sweeping round.
    side(out, 'UpLeg', [50 + 10 * Math.sin(a), 0, 30 + 6 * Math.cos(a)], [50 + 10 * Math.sin(a + Math.PI), 0, 30 + 6 * Math.cos(a + Math.PI)]);
    side(out, 'Leg', [-90 + 22 * Math.cos(a), 0, 0], [-90 + 22 * Math.cos(a + Math.PI), 0, 0]);
    side(out, 'Foot', [-15, 0, 0], [-15, 0, 0]);
    // Sculling: forearms sweep in and out with the palms angled.
    const sweep = Math.sin(a * 2);
    side(out, 'Arm', [25 + 6 * sweep, 0, 55 - 12 * sweep], [25 + 6 * sweep, 0, 55 - 12 * sweep]);
    side(out, 'ForeArm', [45, 0, 0], [45, 0, 0]);
    side(out, 'Hand', [0, 0, 20 * sweep], [0, 0, 20 * sweep]);
    fingers(out, 8);
    return { bones: out, root: { y: UPRIGHT + 0.025 * Math.sin(a * 2), pitch: 8 }, gaze: [0, 0] };
  },
};

/**
 * One arm of a windmill stroke at phase p (0..1): the arm angle from the side, decreasing through the pull
 * under the body (180 → 0) and the recovery over the water (0 → −180). Forearms bend at the catch and
 * high-elbow recovery.
 */
function strokeArm(p: number, backstroke = false): [Ch, Ch] {
  const u = ((p % 1) + 1) % 1, angle = backstroke ? -180 + 360 * u : 180 - 360 * u, under = u < 0.5;
  const bend = backstroke ? 25 * Math.sin(u * TAU) ** 2 : under ? 45 * Math.sin(u * TAU) : 85 * Math.sin((u - 0.5) * TAU);
  return [[angle, 0, 10], [Math.max(0, bend), 0, 0]];
}

/** Front crawl: prone, rolling with the alternating arms, flutter kick, breathing to the right each cycle. */
export const swimFreestyle: Clip = {
  id: 'swim_freestyle', name: 'Swim forward (front crawl)', category: 'Swimming', duration: 1.4, loop: true, travel: [0, 0, 1.1],
  sample: (t) => {
    const u = t / 1.4, roll = 28 * Math.sin(u * TAU), breathe = Math.max(0, Math.sin((u - 0.35) * TAU)) ** 2;
    const out: Record<string, Ch> = { Spine: [0, roll * 0.6, 0], Spine1: [0, roll * 0.4, 0], Neck: [-6, -45 * breathe, 0], Head: [-4, -25 * breathe, 0] };
    const [la, lf] = strokeArm(u + 0.5), [ra, rf] = strokeArm(u);
    side(out, 'Arm', la, ra); side(out, 'ForeArm', lf, rf);
    // Flutter kick: six beats per cycle, from the hips, ankles pointed.
    const kick = (o: number) => Math.sin(u * 3 * TAU + o);
    side(out, 'UpLeg', [4 + 14 * kick(0), 0, 4], [4 + 14 * kick(Math.PI), 0, 4]);
    side(out, 'Leg', [-12 - 12 * Math.max(0, kick(0.8)), 0, 0], [-12 - 12 * Math.max(0, kick(0.8 + Math.PI)), 0, 0]);
    side(out, 'Foot', [45, 0, 0], [45, 0, 0]);
    fingers(out, 6);
    return { bones: out, root: { y: PRONE + 0.02 * Math.sin(u * 2 * TAU), pitch: 88 }, gaze: [0, 0] };
  },
};

/** Backstroke: on the back, straight-arm windmill, flutter kick, face out of the water. */
export const swimBackstroke: Clip = {
  id: 'swim_backstroke', name: 'Swim backstroke', category: 'Swimming', duration: 1.5, loop: true, travel: [0, 0, -0.9],
  sample: (t) => {
    const u = t / 1.5, roll = 22 * Math.sin(u * TAU);
    const out: Record<string, Ch> = { Spine: [0, roll * 0.6, 0], Spine1: [0, roll * 0.4, 0], Neck: [12, 0, 0], Head: [8, 0, 0] };
    const [la, lf] = strokeArm(u + 0.5, true), [ra, rf] = strokeArm(u, true);
    side(out, 'Arm', la, ra); side(out, 'ForeArm', lf, rf);
    const kick = (o: number) => Math.sin(u * 3 * TAU + o);
    side(out, 'UpLeg', [8 + 14 * kick(0), 0, 4], [8 + 14 * kick(Math.PI), 0, 4]);
    side(out, 'Leg', [-10 - 14 * Math.max(0, kick(-0.8)), 0, 0], [-10 - 14 * Math.max(0, kick(-0.8 + Math.PI)), 0, 0]);
    side(out, 'Foot', [45, 0, 0], [45, 0, 0]);
    fingers(out, 6);
    // Floating face-up and travelling head first (backwards for the character).
    return { bones: out, root: { y: PRONE + 0.02 * Math.sin(u * 2 * TAU), pitch: -84 }, gaze: [0, 0] };
  },
};

/** Breaststroke: glide, out-sweep, in-sweep lifting the head to breathe, frog kick, glide. */
export const swimBreaststroke: Clip = {
  id: 'swim_breaststroke', name: 'Swim breaststroke', category: 'Swimming', duration: 1.6, loop: true, travel: [0, 0, 0.75],
  sample: (t) => {
    const k = (v: number[]) => cyc(v)(t / 1.6);
    const out: Record<string, Ch> = {
      Spine: [k([0, 0, -10, -18, -8, 0, 0, 0]), 0, 0], Neck: [k([-5, -5, -20, -35, -15, -5, -5, -5]), 0, 0], Head: [k([-5, -5, -10, -20, -10, -5, -5, -5]), 0, 0],
    };
    // Arms: extended forward, hands sweep apart and down, round in to meet under the chin (never crossing), shoot
    // forward together. With the arm raised overhead, a negative side angle opens the hands outward.
    const ax = k([175, 160, 140, 115, 130, 165, 175, 175]), az = k([5, -30, -55, 2, 4, 5, 5, 5]), af = k([0, 15, 45, 125, 70, 15, 0, 0]);
    side(out, 'Arm', [ax, 0, az], [ax, 0, az]); side(out, 'ForeArm', [af, 0, 0], [af, 0, 0]);
    // Frog kick: heels drawn up, knees apart, feet turned out, then a whip-kick back together.
    const ux = k([0, 0, 15, 45, 55, 15, 0, 0]), uz = k([3, 3, 12, 25, 32, 25, 6, 3]), lx = k([-5, -5, -40, -105, -115, -30, -5, -5]), fx = k([45, 45, 20, -10, -20, 25, 45, 45]);
    side(out, 'UpLeg', [ux, 0, uz], [ux, 0, uz]); side(out, 'Leg', [lx, 0, 0], [lx, 0, 0]); side(out, 'Foot', [fx, 0, 0], [fx, 0, 0]);
    fingers(out, 4);
    return { bones: out, root: { y: k([PRONE, PRONE, PRONE + 0.04, PRONE + 0.1, PRONE + 0.06, PRONE, PRONE, PRONE]), pitch: k([86, 86, 80, 70, 74, 84, 86, 86]) }, gaze: [0, 0] };
  },
};

/** Ease a timed path into a constant-speed travel: `travel * t` plus the returned residual equals the path. */
const alongTravel = (T: number[], z: number[], speed: number) => (t: number) => track(T, z)(t) - speed * t;

/** Running-edge dive: crouch, swing the arms, spring out head first, glide underwater and surface into a stroke. */
const DIVE_T = [0, 0.3, 0.55, 0.75, 0.92, 1.15, 1.5, 2];
const DIVE_Z = [0, 0, 0.1, 1.1, 1.9, 2.5, 3.1, 3.5];
export const diveIntoWater: Clip = {
  id: 'dive_into_water', name: 'Dive into water', category: 'Swimming', duration: 2, loop: false, travel: [0, 0, 3.5 / 2],
  sample: (t) => {
    const k = (v: number[]) => track(DIVE_T, v)(t);
    const out: Record<string, Ch> = {
      Spine: [k([0, 30, 20, 0, -5, 0, 0, 0]), 0, 0], Spine1: [k([0, 15, 10, 0, 0, 0, 0, 0]), 0, 0],
      Neck: [k([0, 10, -5, 15, 20, 10, 0, 0]), 0, 0], Head: [k([0, 5, -5, 10, 15, 5, 0, 0]), 0, 0],
    };
    // Arms swing back, then forward overhead into a streamline, hands together.
    side(out, 'Arm', [k([0, -40, 60, 175, 178, 178, 178, 178]), 0, k([3, 10, 8, 4, 4, 4, 4, 4])], [k([0, -40, 60, 175, 178, 178, 178, 178]), 0, k([3, 10, 8, 4, 4, 4, 4, 4])]);
    side(out, 'ForeArm', [k([12, 20, 10, 0, 0, 0, 0, 0]), 0, 0], [k([12, 20, 10, 0, 0, 0, 0, 0]), 0, 0]);
    side(out, 'UpLeg', [k([0, 70, 40, 0, 0, 0, 0, 0]), 0, 3], [k([0, 70, 40, 0, 0, 0, 0, 0]), 0, 3]);
    side(out, 'Leg', [k([0, -90, -50, 0, 0, -5, -10, -5]), 0, 0], [k([0, -90, -50, 0, 0, -5, -10, -5]), 0, 0]);
    side(out, 'Foot', [k([0, 30, 10, 40, 45, 45, 45, 45]), 0, 0], [k([0, 30, 10, 40, 45, 45, 45, 45]), 0, 0]);
    fingers(out, k([14, 14, 6, 0, 0, 0, 0, 0]));
    return {
      bones: out, gaze: [0, 0],
      root: { y: k([0, -0.25, -0.15, 0.35, -0.15, -1.1, -1.55, PRONE]), pitch: k([0, 15, 25, 55, 118, 108, 90, 88]), z: alongTravel(DIVE_T, DIVE_Z, 3.5 / 2)(t), floor: t < 0.55 },
    };
  },
};

/** Climb out onto a bank at water level: hands on the edge, kick and press up, knee on, stand. */
const CLIMB_T = [0, 0.4, 0.8, 1.2, 1.6, 2, 2.4];
const CLIMB_Z = [0, 0.1, 0.2, 0.35, 0.6, 0.8, 0.9];
export const climbOutOfWater: Clip = {
  id: 'climb_out_of_water', name: 'Climb out of water', category: 'Swimming', duration: 2.4, loop: false, travel: [0, 0, 0.9 / 2.4],
  sample: (t) => {
    const k = (v: number[]) => track(CLIMB_T, v)(t);
    const out: Record<string, Ch> = {
      Spine: [k([6, 10, 20, 15, 30, 15, 0]), 0, 0], Spine1: [k([3, 6, 10, 8, 15, 8, 0]), 0, 0], Neck: [k([-4, -10, -5, 0, -10, -5, 0]), 0, 0],
    };
    // Reach up onto the edge, press down to straight arms beside the hips, then let go to stand.
    side(out, 'Arm', [k([25, 90, 70, 20, 10, 5, 0]), 0, k([55, 15, 20, 30, 15, 8, 3])], [k([25, 90, 70, 20, 10, 5, 0]), 0, k([55, 15, 20, 30, 15, 8, 3])]);
    side(out, 'ForeArm', [k([45, 20, 30, 5, 30, 15, 12]), 0, 0], [k([45, 20, 30, 5, 30, 15, 12]), 0, 0]);
    // Kick to rise, then the right knee comes up onto the bank and both legs stand.
    side(out, 'UpLeg', [k([50, 40, 0, 0, 20, 30, 0]), 0, k([30, 10, 4, 4, 6, 4, 0])], [k([50, 40, 0, 100, 90, 40, 0]), 0, k([30, 10, 4, 6, 6, 4, 0])]);
    side(out, 'Leg', [k([-90, -60, 0, -10, -90, -40, -3]), 0, 0], [k([-90, -60, 0, -120, -100, -40, -3]), 0, 0]);
    side(out, 'Foot', [k([-15, 20, 30, 20, 10, 5, 0]), 0, 0], [k([-15, 20, 30, 0, 10, 5, 0]), 0, 0]);
    fingers(out, k([8, 4, 6, 10, 14, 14, 14]));
    return { bones: out, gaze: [0, 0], root: { y: k([UPRIGHT, -1.62, -1.25, -0.85, -0.5, -0.25, 0]), pitch: k([8, 5, 20, 10, 25, 15, 0]), z: alongTravel(CLIMB_T, CLIMB_Z, 0.9 / 2.4)(t) } };
  },
};

export const SWIMMING: Clip[] = [treadWater, swimFreestyle, swimBreaststroke, swimBackstroke, diveIntoWater, climbOutOfWater];
