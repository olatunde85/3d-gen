/**
 * Climbing: ladder up and down, a speed vault over a waist-high obstacle, hanging from a ledge and climbing up onto
 * it. Every contact (rung, obstacle top, ledge edge, wall) is fixed in floor space and both hands and feet are
 * solved onto it, so nothing slides while the body moves. Positions are metres at 1.8 m height from the character's
 * starting origin, facing +Z. Clips that end somewhere else carry that offset in `travel`; their authored path and
 * contacts are expressed relative to that even travel, so they line up exactly with root motion and stay close to
 * place without it. Games supply the ladder, obstacle and ledge (dimensions below).
 */
import type { Ch, Clip, HandTarget, Sample } from './types';
import { fingers, grip, side, track, v } from './helpers';
import { idle } from './basic';

type V3 = [number, number, number];
const smooth = (x: number) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
const frac = (x: number) => ((x % 1) + 1) % 1;
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return v(a[0] / l, a[1] / l, a[2] / l); };

/** Ladder geometry: rungs every 30 cm, the lowest 45 cm up, in a vertical plane 36 cm in front of the origin, 44 cm wide. */
export const LADDER = { rung: 0.3, first: 0.45, plane: 0.36, width: 0.44 };
const CYCLE = 1.2, CLIMB = (2 * LADDER.rung) / CYCLE;
/**
 * One ladder pose at phase `u` (0..1 per two rungs). Each limb holds its rung for half the cycle while the body
 * rises past it, then moves up two rungs, arcing away from the ladder; each hand moves with the opposite foot.
 * Heights are in the in-place frame, where the rungs slide down at the climbing speed.
 */
function ladder(u: number): Sample {
  const R = LADDER.rung;
  /** Height of a limb's rung at phase p, between `top` and `top - R`, and how far it is through its reach. */
  const limb = (p: number, top: number) => { const q = frac(p); return q < 0.5 ? { y: top - R * (q / 0.5), lift: 0 } : { y: top - R + R * smooth((q - 0.5) / 0.5), lift: Math.sin(((q - 0.5) / 0.5) * Math.PI) }; };
  // Overhand grip: fingers rise over the rung and curl onto it, palm towards the ladder.
  const hand = (s: 1 | -1, p: number): HandTarget => {
    const { y, lift } = limb(p, 2.25), dir = norm(v(0, 1, 0.3)), rung: V3 = v(s * 0.2, y, LADDER.plane - 0.02 - 0.08 * lift);
    return { space: 'floor', pos: v(rung[0] - dir[0] * 0.085, rung[1] - dir[1] * 0.085, rung[2] - dir[2] * 0.085), pole: v(s, -1, -0.4), dir, palm: norm(v(0, -0.3, 1)) };
  };
  // Ball of the foot on the rung: ankle behind and above it.
  const foot = (s: 1 | -1, p: number) => { const { y, lift } = limb(p, 1.05); return { pos: v(s * 0.12, y + 0.07 + 0.04 * lift, LADDER.plane - 0.14 - 0.1 * lift), pole: v(s * 0.15, 0.2, 1) }; };
  const bones: Record<string, Ch> = { Spine: [3, 0, 0], Spine1: [2, 0, 0], Neck: [-12, 0, 0], Head: [-8, 0, 0] };
  side(bones, 'Arm', [120, 0, 15], [120, 0, 15]);
  side(bones, 'Foot', [15, 0, 0], [15, 0, 0]);
  grip(bones, 'Left'); grip(bones, 'Right');
  return {
    bones, gaze: [0, 0], root: { y: 0.6, z: -0.14 }, thumbs: { Left: 0.7, Right: 0.7 },
    ik: { Left: hand(1, u), Right: hand(-1, u + 0.5) }, feet: { Left: foot(1, u + 0.5), Right: foot(-1, u) },
  };
}
export const ladderUp: Clip = {
  id: 'ladder_up', name: 'Climb ladder up', category: 'Climbing', duration: CYCLE, loop: true, travel: [0, CLIMB, 0],
  sample: (t) => ladder(t / CYCLE),
};
const DOWN = CYCLE * 1.15;
export const ladderDown: Clip = {
  id: 'ladder_down', name: 'Climb ladder down', category: 'Climbing', duration: DOWN, loop: true, travel: [0, -(2 * LADDER.rung) / DOWN, 0],
  sample: (t) => ladder(1 - t / DOWN),
};

/** A path authored in world space, re-expressed relative to an even travel over the clip (see the file comment). */
const residual = (T: number[], values: number[], speed: number) => (t: number) => track(T, values)(t) - speed * t;

/**
 * Speed vault over a 90 cm-high, 35 cm-deep obstacle whose near face is 1.1 m ahead: step in and take off from the
 * left foot, plant the left hand on top, lift both feet over it beside the hand, land on the far side and stand
 * (2.8 m forward). Both feet follow explicit paths, so they always clear the top.
 */
export const VAULT = { near: 1.1, depth: 0.35, height: 0.9 };
const VAULT_LEN = 2.8, VAULT_DUR = 1.2, VAULT_V = VAULT_LEN / VAULT_DUR;
const VAULT_T = [0, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1.2];
export const vaultOver: Clip = {
  id: 'vault_over', name: 'Vault over obstacle', category: 'Climbing', duration: VAULT_DUR, loop: false, travel: [0, 0, VAULT_V],
  sample: (t) => {
    const k = (vals: number[]) => track(VAULT_T, vals)(t);
    const bones: Record<string, Ch> = {
      // Lean towards the planted hand so the shoulder stays within reach of it.
      Spine: [k([4, 14, 26, 24, 12, 6, 4, 0]), k([0, 0, -10, -16, -8, 0, 0, 0]), k([0, 0, -14, -22, -10, 0, 0, 0])], Spine1: [k([2, 6, 10, 8, 4, 2, 2, 0]), 0, 0],
      Neck: [k([-4, -10, -10, -6, -4, -6, -4, 0]), 0, 0], Head: [k([-2, -8, -10, -6, -4, -6, -2, 0]), k([0, 0, 10, 16, 8, 0, 0, 0]), 0],
    };
    side(bones, 'Foot', [k([0, 10, 25, 25, 20, 5, 0, 0]), 0, 0], [k([0, 10, 25, 25, 20, 5, 0, 0]), 0, 0]);
    // The free right arm swings forward for balance.
    side(bones, 'Arm', [k([10, 75, 80, 70, 40, 15, 10, 5]), 0, k([5, 15, 25, 30, 25, 15, 8, 4])], [k([-10, 40, 60, 70, 50, 30, 15, 5]), 0, k([5, 20, 35, 40, 30, 15, 8, 4])]);
    side(bones, 'ForeArm', [k([20, 30, 10, 10, 30, 40, 30, 12]), 0, 0], [k([20, 40, 30, 25, 35, 40, 30, 12]), 0, 0]);
    fingers(bones, 12);
    const hipsZ = residual(VAULT_T, [0, 0.45, 0.85, 1.2, 1.6, 2.05, 2.45, VAULT_LEN], VAULT_V)(t);
    // Ankle paths (world, then expressed against the even travel). Up over the top while crossing it.
    const path = (T: number[], x: number[], y: number[], z: number[]): V3 => v(track(T, x)(t), track(T, y)(t), track(T, z)(t) - VAULT_V * t);
    const LT = [0, 0.15, 0.22, 0.3, 0.38, 0.46, 0.56, 0.68, 0.82, 0.92, 1.02, 1.2];
    const left = path(LT, [0.1, 0.1, 0.1, 0.18, 0.26, 0.26, 0.22, 0.15, 0.11, 0.11, 0.11, 0.11], [0.08, 0.08, 0.08, 0.7, 1.06, 1.08, 1.06, 0.6, 0.08, 0.17, 0.08, 0.08], [0, 0.48, 0.48, 0.7, 0.92, 1.2, 1.5, 1.8, 2.08, 2.42, 2.78, 2.8]);
    const RT = [0, 0.08, 0.2, 0.3, 0.38, 0.46, 0.56, 0.7, 0.86, 1.02, 1.1, 1.2];
    const right = path(RT, [-0.1, -0.1, -0.14, -0.2, -0.26, -0.26, -0.2, -0.14, -0.11, -0.11, -0.11, -0.11], [0.08, 0.1, 0.35, 0.78, 1.08, 1.1, 1.02, 0.5, 0.08, 0.08, 0.16, 0.08], [0, 0.05, 0.4, 0.7, 0.95, 1.25, 1.55, 2.0, 2.28, 2.28, 2.55, 2.8]);
    const s: Sample = {
      bones, gaze: [0, 0], root: { y: k([0, -0.02, 0.26, 0.29, 0.22, -0.03, -0.05, 0]), z: hipsZ, pitch: k([0, 10, 24, 28, 16, 6, 4, 0]), ground: false },
      feet: { Left: { pos: left, pole: v(0.5, 1, 0.4) }, Right: { pos: right, pole: v(-0.5, 1, 0.4) } },
    };
    // Left hand plants on the top, fingers forward; as the hips pass over, the knuckles stay put and the heel of the
    // hand lifts (the wrist pivots up and forward over them) before letting go.
    const plant = smooth((t - 0.27) / 0.07) * (1 - smooth((t - 0.37) / 0.16)), roll = smooth((t - 0.36) / 0.12) * 1.1;
    if (plant > 0) {
      const knuckles: V3 = v(0.16, VAULT.height + 0.03, VAULT.near + 0.12 - VAULT_V * t), d: V3 = v(0, -Math.sin(roll), Math.cos(roll));
      s.ik = { Left: { space: 'floor', pos: v(knuckles[0] - d[0] * 0.085, knuckles[1] - d[1] * 0.085, knuckles[2] - d[2] * 0.085), pole: v(1, 0, -1), dir: d, palm: v(0, -Math.cos(roll), -Math.sin(roll)) } };
    }
    s.ikWeight = { Left: plant };
    return s;
  },
};

/** Ledge: a wall whose face is 26 cm in front of the origin and whose top edge is 2.15 m up (just above the raised hands). */
export const LEDGE = { face: 0.26, top: 2.15 };
/** Hooked over the edge: fingers over the top, wrist just below and in front of the face. */
const ledgeGrip = (s: 1 | -1): HandTarget => ({ space: 'floor', pos: v(s * 0.22, LEDGE.top - 0.075, LEDGE.face - 0.035), pole: v(s, 0.2, -1), dir: norm(v(0, 1, 0.55)), palm: norm(v(0, -0.55, 1)) });
/** Palm flat on the top beside the body, fingers forward, for pressing up. */
const ledgePress = (s: 1 | -1, z: number): HandTarget => ({ space: 'floor', pos: v(s * 0.26, LEDGE.top + 0.035, z), pole: v(s, 0.3, -0.6), dir: v(0, 0, 1), palm: v(0, -1, 0) });

/** Legs hanging straight below the hips, toes pointed, swaying slightly with the body. */
function hangLegs(bones: Record<string, Ch>, swing = 0) {
  side(bones, 'UpLeg', [6 + 2 * swing, 0, -5], [6 + 2 * swing, 0, -5]);
  side(bones, 'Leg', [-8, 0, 0], [-8, 0, 0]);
  side(bones, 'Foot', [-30, 0, 0], [-30, 0, 0]);
}

export const ledgeHang: Clip = {
  id: 'ledge_hang', name: 'Ledge hang', category: 'Climbing', duration: 2.4, loop: true,
  sample: (t) => {
    const swing = Math.sin((t / 2.4) * Math.PI * 2);
    const bones: Record<string, Ch> = { Spine: [-2 + swing, 0, 0], Neck: [-16, 0, 0], Head: [-10, 0, 0] };
    side(bones, 'Arm', [170, 0, 10], [170, 0, 10]);
    hangLegs(bones, swing);
    grip(bones, 'Left'); grip(bones, 'Right');
    return { bones, gaze: [0, 0], root: { y: 0.15, z: -0.02, pitch: 4, reach: true }, thumbs: { Left: 0.6, Right: 0.6 },
      ik: { Left: ledgeGrip(1), Right: ledgeGrip(-1) } };
  },
};

/**
 * From the hang: walk the feet up the wall and pull up, press over the edge onto straight arms, step the right foot
 * up onto the top, push up, bring the left foot up beside it and stand (2.15 m up, 0.62 m forward).
 */
const CLIMB_T = [0, 0.5, 0.95, 1.35, 1.75, 2.2, 2.8];
const CLIMB_DUR = 2.8, CLIMB_END: V3 = [0, LEDGE.top, LEDGE.face + 0.36], CLIMB_V: V3 = [0, CLIMB_END[1] / CLIMB_DUR, CLIMB_END[2] / CLIMB_DUR];
export const ledgeClimb: Clip = {
  id: 'ledge_climb_up', name: 'Climb up ledge', category: 'Climbing', duration: CLIMB_DUR, loop: false, travel: CLIMB_V,
  sample: (t) => {
    const k = (vals: number[]) => track(CLIMB_T, vals)(t);
    // Hips height (above standing) and forward position: behind the wall face until they are above the top.
    const y = k([0.15, 0.5, 1.02, 1.37, 1.6, 2.0, 2.15]), z = k([-0.02, -0.07, -0.05, 0.12, 0.24, 0.5, 0.62]);
    const at = (p: V3): V3 => v(p[0], p[1] - CLIMB_V[1] * t, p[2] - CLIMB_V[2] * t);
    const bones: Record<string, Ch> = { Spine: [k([-2, 4, 14, 30, 22, 8, 0]), 0, 0], Spine1: [k([0, 2, 8, 12, 8, 2, 0]), 0, 0], Neck: [k([-16, -10, -4, 0, 2, 0, 0]), 0, 0], Head: [k([-10, -6, -2, 0, 0, 0, 0]), 0, 0] };
    side(bones, 'Arm', [k([170, 140, 60, 30, 20, 10, 0]), 0, 10], [k([170, 140, 60, 30, 20, 10, 0]), 0, 10]);
    side(bones, 'ForeArm', [k([5, 40, 60, 10, 15, 15, 12]), 0, 0], [k([5, 40, 60, 10, 15, 15, 12]), 0, 0]);
    // Feet stay level with the wall and the top: undo the body's forward lean at the ankles.
    const lean = k([4, 6, 16, 35, 20, 4, 0]);
    // Starts from the straight-legged hang, easing the feet onto the wall.
    hangLegs(bones);
    side(bones, 'Foot', [k([-34, 0, 10, 10, 10, 5, 0]) + lean, 0, 0], [k([-34, 0, 10, 10, 10, 5, 0]) + lean, 0, 0]);
    const onWall = smooth(t / 0.45);
    grip(bones, 'Left'); grip(bones, 'Right');
    // Hands: hooked grip, then palms flat on top for the press, let go once the right foot is up.
    const press = smooth((t - 0.6) / 0.35), release = smooth((t - 1.4) / 0.3);
    const hand = (s: 1 | -1): HandTarget => { const g = ledgeGrip(s), p = ledgePress(s, LEDGE.face + 0.12); const m = (a: V3, b: V3) => v(a[0] + (b[0] - a[0]) * press, a[1] + (b[1] - a[1]) * press, a[2] + (b[2] - a[2]) * press);
      // The wrist lifts over the edge before moving onto the top, clearing the corner.
      const lift = Math.sqrt(press), on = press * press, pos: V3 = v(g.pos[0] + (p.pos[0] - g.pos[0]) * press, g.pos[1] + (p.pos[1] - g.pos[1]) * lift, g.pos[2] + (p.pos[2] - g.pos[2]) * on);
      return { ...g, pos: at(pos), dir: norm(m(g.dir!, p.dir!)), palm: norm(m(g.palm!, p.palm!)), pole: m(g.pole, p.pole) }; };
    // Feet walk up the wall, rise clear of the edge, then step onto the top (each on its own timing).
    const top = LEDGE.top + 0.08, wall = LEDGE.face - 0.2, stand = LEDGE.face + 0.36;
    const RT = [0, 0.5, 0.95, 1.28, 1.44, 2.0, 2.4], LT = [0, 0.5, 0.95, 1.35, 1.8, 2.05, 2.4];
    // The right foot swings wide as it comes up level with the hips, so the knee never has to fold tighter than it can.
    const rightFoot: V3 = v(track(RT, [-0.13, -0.13, -0.15, -0.26, -0.2, -0.13, -0.13])(t), track(RT, [0.3, 0.78, 1.28, top + 0.06, top + 0.02, top, top])(t), track(RT, [wall, wall, wall, wall - 0.02, LEDGE.face + 0.14, LEDGE.face + 0.14, stand])(t));
    const leftFoot: V3 = v(0.13, track(LT, [0.3, 0.68, 1.22, 1.52, top + 0.05, top, top])(t), track(LT, [wall, wall, wall, wall - 0.02, wall - 0.02, stand, stand])(t));
    // Knees turn out to the side while the feet walk up the wall (forward would push them into it), then point up and
    // forward once the foot is going over the top.
    // ...and forward again once standing on the top.
    const knee = (sd: 1 | -1, over: number, onTop: number): V3 => { const w = smooth((t - over) / 0.45), f = smooth((t - onTop) / 0.35); return v(sd * 0.55 * (1 - 0.3 * w) * (1 - f), (0.5 + 0.5 * w) * (1 - f) + 0.3 * f, (0.15 + 0.15 * w) * (1 - f) + f); };
    const s: Sample = {
      bones, gaze: [0, 0], root: { y: y - CLIMB_V[1] * t, z: z - CLIMB_V[2] * t, pitch: k([4, 6, 16, 35, 20, 4, 0]), reach: true }, thumbs: { Left: 0.6, Right: 0.6 },
      ik: { Left: hand(1), Right: hand(-1) },
      // Feet on the wall rise with a short-armed body's higher hang; on the top they stay put.
      feet: { Left: { pos: at(leftFoot), pole: knee(1, 1.55, 1.8), rise: 1 - smooth((t - 1.6) / 0.3), weight: onWall }, Right: { pos: at(rightFoot), pole: knee(-1, 0.85, 1.42), rise: 1 - smooth((t - 1.15) / 0.2), weight: onWall } },
      ikWeight: { Left: 1 - release, Right: 1 - release },
    };
    // Straighten into a standing idle on top.
    const up = smooth((t - 2.2) / 0.55);
    if (up > 0) { const rest = idle.sample(0); s.blend = { sample: { ...rest, root: { ...rest.root, ground: false, y: y - CLIMB_V[1] * t, z: z - CLIMB_V[2] * t }, feet: s.feet }, w: up }; }
    return s;
  },
};

export const CLIMBING: Clip[] = [ladderUp, ladderDown, vaultOver, ledgeHang, ledgeClimb];
