/** Vehicle riders: car, passenger, bicycle, motorcycle, horse, canoe, kayak, rowing, boat helm. */
import { type Ch, type Clip, type HandTarget } from './types';
import { cyc, fingers, fist, FISTS, grip, normV, side, v } from './helpers';

// The rider only: the game supplies the vehicle and attaches the character to its seat.
// Seated clips keep the feet on the floor (car, boats); bike and horse clips hold the hips at
// saddle height. Hands are placed by IK on the controls (wheel, bars, reins, paddle, oars).

type V3 = [number, number, number];
const add3 = (a: V3, b: V3): V3 => v(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
const mul3 = (a: V3, k: number): V3 => v(a[0] * k, a[1] * k, a[2] * k);

/** Seated legs: thighs forward, shins down, slight spread. */
function seatedLegs(out: Record<string, Ch>, thigh = 85, knee = -85, foot = 4, spread = 6) {
  side(out, 'UpLeg', [thigh, 0, spread], [thigh, 0, spread]);
  side(out, 'Leg', [knee, 0, 0], [knee, 0, 0]);
  side(out, 'Foot', [foot, 0, 0], [foot, 0, 0]);
}

/**
 * Hands on a steering wheel (car or boat) at 9 and 3 o'clock, turned by `steer` degrees.
 * The wheel faces the driver, its top tilted away by `tilt` degrees.
 */
function wheelHands(centre: V3, radius: number, tilt: number, steer: number): { Left: HandTarget; Right: HandTarget } {
  const tr = (tilt * Math.PI) / 180;
  const n = v(0, Math.sin(tr), -Math.cos(tr)); // wheel normal, toward the driver
  const up = v(0, Math.cos(tr), Math.sin(tr)); // in the wheel plane, toward its top
  const across = v(1, 0, 0);
  const hand = (phi: number, s: 1 | -1): HandTarget => {
    const a = phi + (steer * Math.PI) / 180;
    const radial = add3(mul3(across, Math.cos(a)), mul3(up, Math.sin(a)));
    const tangent = add3(mul3(across, -Math.sin(a)), mul3(up, Math.cos(a)));
    return {
      pos: add3(centre, mul3(radial, radius)),
      pole: v(s, -1, -0.3),
      // Fingers forward around the rim, palm toward the wheel's centre.
      dir: normV(add3(mul3(tangent, 0.35 * s), mul3(n, -1))),
      palm: mul3(radial, -1),
    };
  };
  return { Left: hand(0, 1), Right: hand(Math.PI, -1) };
}

const driveCar: Clip = {
  id: 'drive_car', name: 'Drive car', category: 'Vehicles', duration: 4, loop: true,
  sample: (t) => {
    const a = (t / 4) * Math.PI * 2;
    const steer = 14 * Math.sin(a) + 5 * Math.sin(3 * a + 1);
    const out: Record<string, Ch> = {
      Spine: [-10, 0, 0], Spine1: [2, 0, 0], Spine2: [2, 0, 0],
      Neck: [4, 0, 0], Head: [6 + Math.sin(a * 2), 6 * Math.sin(a + 0.6) + 0.3 * steer, 0],
    };
    seatedLegs(out, 78, -72, 2, 7);
    side(out, 'Leg', [-80, 0, 0], [-62, 0, 0]); // right foot forward on the pedal
    side(out, 'Foot', [6, 0, 0], [-6, 0, 0]);
    grip(out, 'Left');
    grip(out, 'Right');
    return { bones: out, root: { ground: true }, thumbs: { Left: 0.5, Right: 0.5 }, ik: wheelHands(v(0, -0.34, 0.42), 0.18, 28, steer) };
  },
};

const sitPassenger: Clip = {
  id: 'sit_passenger', name: 'Sit (passenger)', category: 'Vehicles', duration: 6, loop: true,
  sample: (t) => {
    const a = (t / 6) * Math.PI * 2;
    const look = 22 * Math.sin(a) * Math.max(0, Math.sin(a)); // glances out of the window now and then
    const out: Record<string, Ch> = {
      Spine: [-12 + Math.sin(a * 3) * 0.8, 0, 0], Spine1: [2, 0, 0], Spine2: [1.5 * Math.sin(a * 3), 0, 0],
      Neck: [2, 0.3 * look, 0], Head: [2, 0.7 * look, 2 * Math.sin(a)],
    };
    seatedLegs(out, 86, -84, 2, 5);
    fingers(out, 18);
    // Hands resting on the thighs.
    const lap = (s: 1 | -1, dz: number): HandTarget => ({ pos: v(0.15 * s, -0.5, 0.3 + dz), pole: v(s, -0.6, -0.5), dir: v(0.05 * s, -0.25, 1), palm: v(0, -1, 0) });
    return { bones: out, root: { ground: true }, ik: { Left: lap(1, 0.01 * Math.sin(a * 3)), Right: lap(-1, 0.03) } };
  },
};

const rideBicycle: Clip = {
  id: 'ride_bicycle', name: 'Ride bicycle', category: 'Vehicles', duration: 1.0, loop: true,
  sample: (t) => {
    const c = (t / 1.0) * Math.PI * 2; // crank angle: one pedal revolution per loop
    const out: Record<string, Ch> = {
      Spine: [24, 0, 0], Spine1: [12, 0, 0], Spine2: [6, 1.5 * Math.sin(c), 0],
      Neck: [-16, 0, 0], Head: [-20, 0, 0], Hips: [0, 2 * Math.sin(c), 1.5 * Math.sin(c)],
    };
    // Pedalling: thigh highest and knee most bent with the pedal at the top.
    const leg = (ph: number): [Ch, Ch, Ch] => {
      const top = Math.cos(ph); // 1 = pedal at the top
      const fwd = Math.sin(ph); // 1 = pedal forward
      return [[52 + 26 * top + 6 * fwd, 0, 3], [-58 - 34 * top + 10 * fwd, 0, 0], [6 - 14 * fwd, 0, 0]];
    };
    const [lu, ll, lf] = leg(c), [ru, rl, rf] = leg(c + Math.PI);
    side(out, 'UpLeg', lu, ru);
    side(out, 'Leg', ll, rl);
    side(out, 'Foot', lf, rf);
    grip(out, 'Left');
    grip(out, 'Right');
    // Hands fixed on the handlebar (floor space), so they stay on the bar while the body pedals.
    const bar = (s: 1 | -1): HandTarget => ({ space: 'floor', pos: v(0.24 * s, 0.918, 0.437), pole: v(s, -0.39, -0.76), dir: v(0.25 * s, -0.85, 0.58), palm: v(-0.35 * s, -0.74, -0.67) });
    return { bones: out, root: { y: -0.02 + 0.006 * Math.sin(2 * c) }, thumbs: { Left: 0.6, Right: 0.6 }, ik: { Left: bar(1), Right: bar(-1) } };
  },
};

const rideMotorcycle: Clip = {
  id: 'ride_motorcycle', name: 'Ride motorcycle', category: 'Vehicles', duration: 3, loop: true,
  sample: (t) => {
    const a = (t / 3) * Math.PI * 2;
    const hum = 0.003 * Math.sin(t * 2 * Math.PI * 12); // engine vibration
    const out: Record<string, Ch> = {
      Spine: [20, 0, 0], Spine1: [10, 0, 0], Spine2: [4, 0, 0],
      Neck: [-14, 0, 0], Head: [-16, 5 * Math.sin(a), 0], Hips: [0, 0, 3 * Math.sin(a)],
    };
    // Astride the tank, feet back on the pegs.
    side(out, 'UpLeg', [58, 0, 14], [58, 0, 14]);
    side(out, 'Leg', [-92, 0, 0], [-92, 0, 0]);
    side(out, 'Foot', [18, 0, 0], [18, 0, 0]);
    grip(out, 'Left');
    grip(out, 'Right');
    const bar = (s: 1 | -1): HandTarget => ({ pos: v(0.34 * s, -0.22, 0.38 + 0.01 * s * Math.sin(a)), pole: v(s, -0.7, -0.4), dir: v(0.3 * s, -0.2, 1), palm: v(-0.3 * s, -1, 0) });
    return { bones: out, root: { y: -0.16 + hum }, thumbs: { Left: 0.6, Right: 0.6 }, ik: { Left: bar(1), Right: bar(-1) } };
  },
};

const rideHorse: Clip = {
  id: 'ride_horse', name: 'Ride horse (trot)', category: 'Vehicles', duration: 0.8, loop: true,
  sample: (t) => {
    const ph = (t / 0.8) * Math.PI * 2;
    const post = Math.max(0, Math.sin(ph)); // rising trot: up on every other beat
    const out: Record<string, Ch> = {
      Spine: [8 + 4 * post, 0, 0], Spine1: [4, 0, 0], Neck: [-6, 0, 0], Head: [-6 - 3 * post, 0, 0],
    };
    // Legs around the horse's barrel, heels down in the stirrups.
    side(out, 'UpLeg', [42 - 12 * post, 0, 26], [42 - 12 * post, 0, 26]);
    side(out, 'Leg', [-62 + 22 * post, 0, 0], [-62 + 22 * post, 0, 0]);
    side(out, 'Foot', [16, 0, 0], [16, 0, 0]);
    fist(out);
    const reins = (s: 1 | -1): HandTarget => ({ pos: v(0.09 * s, -0.42 + 0.04 * post, 0.34), pole: v(s, -1, -0.4), dir: v(-0.2 * s, -0.1, 1), palm: v(-s, 0, 0) });
    return { bones: out, root: { y: 0.42 + 0.1 * post }, thumbs: FISTS, ik: { Left: reins(1), Right: reins(-1) } };
  },
};

/** A paddle or oar stroke: positions through catch -> pull -> exit -> recovery (looping keys). */
const loop3 = (keys: V3[]) => {
  const xs = cyc(keys.map((k) => k[0])), ys = cyc(keys.map((k) => k[1])), zs = cyc(keys.map((k) => k[2]));
  return (p: number): V3 => v(xs(p), ys(p), zs(p));
};

const paddleCanoe: Clip = {
  id: 'paddle_canoe', name: 'Paddle canoe', category: 'Vehicles', duration: 1.8, loop: true,
  sample: (t) => {
    const p = t / 1.8;
    // Single-blade stroke on the right: catch forward, pull to the hip, lift out, swing forward.
    const low = loop3([v(-0.34, -0.48, 0.46), v(-0.34, -0.52, 0.2), v(-0.33, -0.5, -0.04), v(-0.3, -0.34, 0.1), v(-0.32, -0.36, 0.36)]);
    const top = loop3([v(-0.04, 0.04, 0.38), v(-0.08, -0.02, 0.3), v(-0.12, -0.06, 0.2), v(-0.06, 0.06, 0.24), v(-0.03, 0.08, 0.34)]);
    const twist = cyc([14, 4, -10, -4, 10])(p); // torso winds up for the catch
    const out: Record<string, Ch> = {
      Spine: [10, twist * 0.4, 0], Spine1: [6, twist * 0.6, -3], Spine2: [4, 0, 0], Neck: [-6, -twist * 0.6, 0], Head: [-8, -twist * 0.3, 0],
    };
    // Sitting on the canoe's bench, feet tucked back under it.
    seatedLegs(out, 82, -104, 12, 10);
    fist(out);
    return {
      bones: out,
      root: { ground: true },
      thumbs: FISTS,
      ik: {
        Right: { pos: low(p), pole: v(-1, -0.6, -0.5), dir: v(0.5, 0.1, 0.85), palm: v(0.6, 0, -0.5) },
        Left: { pos: top(p), pole: v(0.6, -1, 0), dir: v(-1, -0.1, 0.3), palm: v(0, -0.6, 1) },
      },
    };
  },
};

const paddleKayak: Clip = {
  id: 'paddle_kayak', name: 'Paddle kayak', category: 'Vehicles', duration: 1.6, loop: true,
  sample: (t) => {
    const p = t / 1.6;
    // Double-bladed paddle: right stroke in the first half, left in the second. The stroke-side
    // hand sweeps low from front to hip while the other pushes forward at shoulder height.
    const stroke = (q: number): [V3, V3] => {
      const s = q < 0.5 ? -1 : 1; // -1 = right side stroke
      const u = (q % 0.5) / 0.5; // 0..1 through this stroke
      const pull = 0.5 - 0.5 * Math.cos(u * Math.PI);
      const lowHand = v(0.3 * s, -0.36, 0.48 - 0.44 * pull);
      const highHand = v(-0.22 * s, -0.08 + 0.04 * Math.sin(u * Math.PI), 0.3 + 0.14 * pull);
      return s < 0 ? [highHand, lowHand] : [lowHand, highHand]; // [left, right]
    };
    const [L, R] = stroke(p);
    const twist = 16 * Math.sin(p * Math.PI * 2 + Math.PI / 2) * -1;
    const out: Record<string, Ch> = {
      Spine: [6, twist * 0.4, 0], Spine1: [4, twist * 0.6, 0], Neck: [0, -twist * 0.5, 0], Head: [-4, -twist * 0.4, 0],
    };
    // Sitting low, legs stretched forward with bent knees.
    seatedLegs(out, 70, -32, 6, 10);
    fist(out);
    return {
      bones: out,
      root: { ground: true },
      thumbs: FISTS,
      ik: {
        Left: { pos: L, pole: v(1, -0.8, -0.3), dir: v(-0.2, 0, 1), palm: v(0, -1, 0) },
        Right: { pos: R, pole: v(-1, -0.8, -0.3), dir: v(0.2, 0, 1), palm: v(0, -1, 0) },
      },
    };
  },
};

const rowBoat: Clip = {
  id: 'row_boat', name: 'Row boat', category: 'Vehicles', duration: 2.4, loop: true,
  sample: (t) => {
    const p = t / 2.4;
    // Catch (leaning forward, arms long) -> drive (lean back, pull to the chest) -> recovery
    // (hands drop to lift the blades, then reach forward again).
    const lean = cyc([30, 12, -16, -12, 6, 24])(p);
    const hand = (s: 1 | -1) => loop3([v(0.3 * s, -0.42, 0.56), v(0.28 * s, -0.34, 0.4), v(0.26 * s, -0.36, 0.12), v(0.27 * s, -0.46, 0.16), v(0.29 * s, -0.5, 0.38), v(0.3 * s, -0.47, 0.52)])(p);
    const out: Record<string, Ch> = {
      Spine: [lean * 0.55, 0, 0], Spine1: [lean * 0.3, 0, 0], Spine2: [lean * 0.15, 0, 0], Neck: [-lean * 0.4, 0, 0], Head: [-lean * 0.3, 0, 0],
    };
    // Fixed seat, feet braced against the stretcher.
    seatedLegs(out, 74, -58, 10, 9);
    fist(out);
    return {
      bones: out,
      root: { ground: true },
      thumbs: FISTS,
      ik: {
        Left: { pos: hand(1), pole: v(1, -0.6, -0.6), dir: v(0.15, 0, 1), palm: v(0, -1, 0) },
        Right: { pos: hand(-1), pole: v(-1, -0.6, -0.6), dir: v(-0.15, 0, 1), palm: v(0, -1, 0) },
      },
    };
  },
};

const driveBoat: Clip = {
  id: 'drive_boat', name: 'Drive boat (helm)', category: 'Vehicles', duration: 5, loop: true,
  sample: (t) => {
    const a = (t / 5) * Math.PI * 2;
    const roll = 4 * Math.sin(a) + 1.5 * Math.sin(2 * a + 1); // the deck rolls with the waves
    const steer = 22 * Math.sin(a + 0.8);
    const out: Record<string, Ch> = {
      Hips: [0, 0, roll], Spine: [2, 0, -roll * 0.7], Spine1: [2, 0, -roll * 0.3], Neck: [0, 0, -roll * 0.2], Head: [-2, 0.25 * steer, 0],
    };
    // Wide, soft-kneed stance for balance.
    side(out, 'UpLeg', [10, 0, 10], [10, 0, 10]);
    side(out, 'Leg', [-16 + 4 * Math.sin(a), 0, 0], [-16 - 4 * Math.sin(a), 0, 0]);
    side(out, 'Foot', [6, 0, -6], [6, 0, -6]);
    grip(out, 'Left');
    grip(out, 'Right');
    return { bones: out, root: { ground: true, x: 0.01 * Math.sin(a) }, thumbs: { Left: 0.5, Right: 0.5 }, ik: wheelHands(v(0, -0.3, 0.44), 0.2, 35, steer) };
  },
};

export const VEHICLES: Clip[] = [driveCar, sitPassenger, rideBicycle, rideMotorcycle, rideHorse, paddleCanoe, paddleKayak, rowBoat, driveBoat];
