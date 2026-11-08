/** Melee set: sword guard, slash, block, a three-cut combination and a thrust. */
import { type Ch, type Clip, type HandTarget } from './types';
import { crossV, fist, FISTS, normV, side, track, v } from './helpers';

// The blade leaves the top of the fist (socket +Y). For the right hand that direction is
// dir x palm, so a hand target is built from the blade and edge directions we want.
/** Right-hand target holding a blade pointing `blade`, edge (knuckles) toward `edge`. */
function swordHand(pos: [number, number, number], blade: [number, number, number], edge: [number, number, number], pole: [number, number, number]): HandTarget {
  const B = normV(blade);
  const k = edge[0] * B[0] + edge[1] * B[1] + edge[2] * B[2];
  const F = normV(v(edge[0] - B[0] * k, edge[1] - B[1] * k, edge[2] - B[2] * k));
  return { pos, pole, dir: F, palm: crossV(B, F) };
}
function swordBody(out: Record<string, Ch>) {
  side(out, 'UpLeg', [14, 0, 2], [-10, 0, 2]);
  side(out, 'Leg', [-22, 0, 0], [-10, 0, 0]);
  side(out, 'Foot', [6, 0, 0], [0, 0, 0]);
  out.Spine = [6, 0, 0];
  side(out, 'Arm', [35, 0, 15], [0, 0, 0]);
  side(out, 'ForeArm', [75, 0, 0], [0, 0, 0]);
  fist(out, ['Left']);
  fist(out, ['Right']);
}
const swordIdle: Clip = {
  id: 'sword_idle', name: 'Sword idle (guard)', category: 'Combat', duration: 3, loop: true,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    swordBody(out);
    const b = Math.sin((t / 3) * Math.PI * 2);
    out.Spine1 = [b, 0, 0];
    return {
      bones: out, root: { ground: true, lift: 0 }, thumbs: FISTS,
      ik: { Right: swordHand(v(-0.14, -0.31 + 0.01 * b, 0.32), v(0.05, 0.8, 0.6), v(0, -0.6, 0.8), v(-1, -0.8, -0.3)) },
    };
  },
};
const swordSlash: Clip = {
  id: 'sword_slash', name: 'Sword slash', category: 'Combat', duration: 1.0, loop: false,
  sample: (t) => {
    const T = [0, 0.3, 0.45, 0.6, 1.0];
    const k = (vals: number[]) => track(T, vals)(t);
    const out: Record<string, Ch> = {};
    swordBody(out);
    out.Hips = [0, k([0, -18, 5, 15, 0]), 0];
    out.Spine1 = [k([0, -4, 8, 10, 0]), k([0, -22, 8, 22, 0]), 0];
    out.Head = [0, k([0, 12, 0, -10, 0]), 0];
    const pos = v(k([-0.14, -0.32, -0.05, 0.16, -0.14]), k([-0.31, 0.12, -0.2, -0.5, -0.31]), k([0.32, 0.05, 0.45, 0.32, 0.32]));
    const blade = v(k([0.05, -0.3, 0.4, 0.6, 0.05]), k([0.8, 0.6, -0.1, -0.5, 0.8]), k([0.6, -0.7, 0.9, 0.6, 0.6]));
    const edge = v(k([0, 0.3, 0.6, 0.5, 0]), k([-0.6, 0.6, -0.5, -0.6, -0.6]), k([0.8, 0.5, 0.2, -0.2, 0.8]));
    return { bones: out, root: { ground: true }, thumbs: FISTS, ik: { Right: swordHand(pos, blade, edge, v(-1, -0.6, -0.3)) } };
  },
};
const swordBlock: Clip = {
  id: 'sword_block', name: 'Sword block', category: 'Combat', duration: 0.8, loop: false,
  sample: (t) => {
    const k = (vals: number[]) => track([0, 0.2, 0.8], vals)(t);
    const out: Record<string, Ch> = {};
    swordBody(out);
    out.Spine1 = [k([0, -6, -6]), 0, 0];
    out.Head = [k([0, -6, -6]), 0, 0];
    const pos = v(k([-0.14, -0.2, -0.2]), k([-0.31, 0.14, 0.14]), k([0.32, 0.28, 0.28]));
    const blade = v(k([0.05, 1, 1]), k([0.8, 0.15, 0.15]), k([0.6, 0.05, 0.05]));
    return { bones: out, root: { ground: true }, thumbs: FISTS, ik: { Right: swordHand(pos, blade, v(0, 1, 0.3), v(-1, -0.4, -0.3)) } };
  },
};


type V3 = [number, number, number];
type Key = { pos: V3; blade: V3; edge: V3; pole?: V3 };
// Sword idle's hand at t = 0: the combo and the thrust start and end on it exactly.
const GUARD: Key = { pos: v(-0.14, -0.31, 0.32), blade: v(0.05, 0.8, 0.6), edge: v(0, -0.6, 0.8), pole: v(-1, -0.8, -0.3) };
/** Sword hand through keyed positions, blade and edge directions (and elbow pole, `pole` where a key has none). */
function swordPath(T: number[], keysAt: Key[], t: number, pole: V3): HandTarget {
  const k = (f: (x: Key) => number) => track(T, keysAt.map(f))(t), p = (x: Key) => x.pole ?? pole;
  return swordHand(v(k((x) => x.pos[0]), k((x) => x.pos[1]), k((x) => x.pos[2])), v(k((x) => x.blade[0]), k((x) => x.blade[1]), k((x) => x.blade[2])),
    v(k((x) => x.edge[0]), k((x) => x.edge[1]), k((x) => x.edge[2])), v(k((x) => p(x)[0]), k((x) => p(x)[1]), k((x) => p(x)[2])));
}

/** Diagonal cut down to the left, backhand cut across to the right, overhead chop, back to the guard. */
const swordCombo: Clip = {
  id: 'sword_combo', name: 'Sword combo (three cuts)', category: 'Combat', duration: 2.1, loop: false,
  sample: (t) => {
    const T = [0, 0.28, 0.44, 0.58, 0.82, 0.98, 1.12, 1.36, 1.54, 1.68, 2.1];
    const k = (vals: number[]) => track(T, vals)(t);
    const out: Record<string, Ch> = {};
    swordBody(out);
    out.Hips = [0, k([0, -18, 5, 15, 18, -6, -16, 0, 0, 0, 0]), 0];
    out.Spine1 = [k([0, -4, 8, 10, 4, 6, 4, -8, 14, 16, 0]), k([0, -22, 8, 22, 26, -8, -24, 0, 0, 0, 0]), 0];
    out.Head = [k([0, 0, 0, 0, 0, 0, 0, -6, 4, 4, 0]), k([0, 12, 0, -10, -14, 4, 12, 0, 0, 0, 0]), 0];
    const keysAt: Key[] = [
      GUARD,
      { pos: v(-0.32, 0.12, 0.05), blade: v(-0.3, 0.6, -0.7), edge: v(0.3, 0.6, 0.5) }, // wind up over the right shoulder
      { pos: v(-0.05, -0.2, 0.45), blade: v(0.4, -0.1, 0.9), edge: v(0.6, -0.5, 0.2) }, // cut through
      { pos: v(0.16, -0.5, 0.32), blade: v(0.6, -0.5, 0.6), edge: v(0.5, -0.6, -0.2) }, // follow through low left
      { pos: v(0.18, -0.12, 0.22), blade: v(0.8, 0.2, -0.2), edge: v(-0.6, 0, 0.6) }, // turn the blade, edge right
      { pos: v(-0.02, -0.16, 0.5), blade: v(0, 0.1, 1), edge: v(-1, 0, 0) }, // backhand across the front
      { pos: v(-0.32, -0.2, 0.28), blade: v(-0.8, 0, 0.5), edge: v(-0.5, 0, -0.6) }, // follow through right
      { pos: v(-0.1, 0.24, 0.08), blade: v(0, 0.55, -0.8), edge: v(0, 0.8, 0.5) }, // raise overhead
      { pos: v(-0.05, -0.12, 0.48), blade: v(0, 0.25, 1), edge: v(0, -1, 0.2) }, // chop
      { pos: v(-0.05, -0.42, 0.42), blade: v(0, -0.6, 0.8), edge: v(0, -0.8, -0.6) }, // follow through down
      GUARD,
    ];
    return { bones: out, root: { ground: true }, thumbs: FISTS, ik: { Right: swordPath(T, keysAt, t, v(-1, -0.6, -0.3)) }, plant: { Left: 1, Right: 1 } };
  },
};

/** Draw the blade back level, lunge onto the front foot and thrust, recover to the guard (blade keys allow for the chest leaning into the lunge). */
const swordThrust: Clip = {
  id: 'sword_thrust', name: 'Sword thrust', category: 'Combat', duration: 1.1, loop: false,
  sample: (t) => {
    const T = [0, 0.3, 0.46, 0.62, 1.1];
    const k = (vals: number[]) => track(T, vals)(t);
    const out: Record<string, Ch> = {};
    swordBody(out);
    const lunge = k([0, -0.2, 1, 1, 0]);
    side(out, 'UpLeg', [14 + 22 * lunge, 0, 2], [-10 - 10 * lunge, 0, 2]);
    side(out, 'Leg', [-22 - 20 * lunge, 0, 0], [-10 + 6 * lunge, 0, 0]);
    side(out, 'Foot', [6 + 8 * lunge, 0, 0], [-6 * lunge, 0, 0]);
    out.Spine = [6 + 8 * lunge, 0, 0];
    out.Spine1 = [0, k([0, -16, 6, 6, 0]), 0];
    out.Head = [-6 * lunge, k([0, 10, -4, -4, 0]), 0];
    const keysAt: Key[] = [
      GUARD,
      { pos: v(-0.24, -0.26, 0.1), blade: v(0.15, 0.32, 1), edge: v(0, -1, 0.3) },
      { pos: v(-0.06, -0.18, 0.62), blade: v(0, 0.5, 1), edge: v(0, -1, 0.5) },
      { pos: v(-0.06, -0.19, 0.6), blade: v(0, 0.5, 1), edge: v(0, -1, 0.5) },
      GUARD,
    ];
    // The back foot stays planted; the front foot steps into the lunge.
    return { bones: out, root: { ground: true, z: 0.08 * lunge }, thumbs: FISTS, ik: { Right: swordPath(T, keysAt, t, v(-1, -0.7, -0.2)) }, plant: { Right: 1 } };
  },
};

export const MELEE: Clip[] = [
  swordIdle,
  swordSlash,
  swordBlock,
  swordCombo,
  swordThrust,
];
