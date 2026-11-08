/**
 * Unarmed fighting: a guard stance, a jab-cross-hook combination, front and roundhouse kicks and a high block. Every
 * move starts and ends in the guard, so they chain with Fighting stance and with each other.
 */
import type { Ch, Clip, HandTarget, Sample } from './types';
import { fist, FISTS, side, track, v } from './helpers';

type V3 = [number, number, number];
const keys = (T: number[], t: number) => (vals: number[]) => track(T, vals)(t);

// Guard: fists at chin height, palms in, elbows down (chest space, see HandTarget).
const GUARD_L: HandTarget = { pos: v(0.11, 0.0, 0.3), pole: v(0.5, -1, 0), dir: v(-0.45, 0.8, 0.4), palm: v(-1, 0, 0) };
const GUARD_R: HandTarget = { pos: v(-0.08, 0.02, 0.22), pole: v(-0.5, -1, 0), dir: v(0.4, 0.85, 0.3), palm: v(1, 0, 0) };

const mix = (a: V3, b: V3, w: number): V3 => v(a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w);
/** A hand moved from its guard toward `to` by `w` (0 = guard). */
function blendHand(guard: HandTarget, to: HandTarget, w: number): HandTarget {
  return { pos: mix(guard.pos, to.pos, w), pole: mix(guard.pole, to.pole, w), dir: mix(guard.dir!, to.dir!, w), palm: mix(guard.palm!, to.palm!, w) };
}

/** Bladed stance, left foot forward, knees soft; `bounce` (0..1) dips the knees. */
function stance(out: Record<string, Ch>, bounce = 0) {
  side(out, 'UpLeg', [16 + 3 * bounce, 0, 4], [-12 + 3 * bounce, 0, 6]);
  side(out, 'Leg', [-24 - 6 * bounce, 0, 0], [-14 - 6 * bounce, 0, 0]);
  side(out, 'Foot', [8 + 3 * bounce, 0, 0], [4 + 3 * bounce, 0, 0]);
  out.Spine = [6, 0, 0];
  out.Spine1 = [4, -10, 0];
  out.Neck = [0, 6, 0];
  out.Head = [-4, 4, 0];
  fist(out);
}

/** A fighting sample; feet stay planted where the guard put them unless `plant` lifts one (a kick). */
const fight = (bones: Record<string, Ch>, ik: Sample['ik'], root: Sample['root'] = { ground: true }, plant: Sample['plant'] = { Left: 1, Right: 1 }): Sample =>
  ({ bones, root, ik, thumbs: FISTS, gaze: [0, 0], plant });
/** Plant weight for a foot that leaves the floor between `off` and `on` (seconds). */
const lifted = (t: number, off: number, on: number) => track([0, off, on, on + 0.12], [1, 0, 0, 1])(t);

const fightIdle: Clip = {
  id: 'fight_idle', name: 'Fighting stance', category: 'Combat', duration: 2, loop: true,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    const b = Math.sin((t / 2) * Math.PI * 2 * 2) ** 2;
    stance(out, b);
    const sway = Math.sin((t / 2) * Math.PI * 2);
    out.Spine1 = [4, -10 + 3 * sway, 0];
    return fight(out, { Left: GUARD_L, Right: GUARD_R });
  },
};

/** Jab (left), cross (right, hips and shoulders turning through), hook (left), back to the guard. */
const punchCombo: Clip = {
  id: 'punch_combo', name: 'Punch combo (jab, cross, hook)', category: 'Combat', duration: 1.6, loop: false,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    stance(out);
    const T = [0, 0.13, 0.27, 0.43, 0.6, 0.82, 0.98, 1.2, 1.6], k = keys(T, t);
    // Shoulders: a little right for the jab, well left for the cross, hard right for the hook.
    const turn = k([0, -8, 0, 24, 6, 10, -28, -10, 0]);
    out.Hips = [0, turn * 0.45, 0];
    out.Spine1 = [4, -10 + turn * 0.55, 0];
    out.Neck = [0, 6 - turn * 0.5, 0];
    out.Head = [-4, 4 - turn * 0.4, 0];
    // The back heel lifts and turns as the cross drives off it.
    side(out, 'UpLeg', [16, 0, 4], [-12 + 6 * k([0, 0, 0, 1, 0.3, 0, 0, 0, 0]), 0, 6]);
    out.RightFoot = [4 - 14 * k([0, 0, 0, 1, 0.3, 0, 0, 0, 0]), 0, 0];
    const jab: HandTarget = { pos: v(0.15, 0.02, 0.56), pole: v(0.4, -1, 0), dir: v(0, 0.05, 1), palm: v(0, -1, 0) };
    const cross: HandTarget = { pos: v(-0.22, 0.02, 0.54), pole: v(-0.4, -1, 0), dir: v(0.15, 0.05, 1), palm: v(0, -1, 0) };
    const hook: HandTarget = { pos: v(0.3, 0.02, 0.33), pole: v(1, 0.3, 0.2), dir: v(-0.65, 0, 0.76), palm: v(0, -1, 0) };
    const left = k([0, 1, 0, 0, 0, 0, 0, 0, 0]), right = k([0, 0, 0, 1, 0, 0, 0, 0, 0]), hooked = k([0, 0, 0, 0, 0, 0.35, 1, 0.3, 0]);
    const L = left > 0.001 ? blendHand(GUARD_L, jab, left) : blendHand(GUARD_L, hook, hooked);
    return fight(out, { Left: L, Right: blendHand(GUARD_R, cross, right) });
  },
};

/** Right front kick: knee up, snap the foot out at the stomach, chamber again and step back into the guard. */
const kickFront: Clip = {
  id: 'kick_front', name: 'Front kick', category: 'Combat', duration: 1.1, loop: false,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    stance(out);
    const T = [0, 0.28, 0.44, 0.56, 0.78, 1.1], k = keys(T, t);
    side(out, 'UpLeg', [16, 0, 4], [k([-12, 88, 78, 86, 20, -12]), 0, 6]);
    side(out, 'Leg', [k([-24, -20, -18, -20, -22, -24]), 0, 0], [k([-14, -125, -6, -110, -40, -14]), 0, 0]);
    out.RightFoot = [k([4, -25, 20, -10, 0, 4]), 0, 0];
    // Lean back to counter the leg.
    out.Spine = [k([6, -4, -14, -6, 2, 6]), 0, 0];
    out.Spine1 = [4, -10 + k([0, 4, 6, 4, 0, 0]), 0];
    return fight(out, { Left: GUARD_L, Right: GUARD_R }, { ground: true }, { Left: 1, Right: lifted(t, 0.1, 0.98) });
  },
};

/**
 * Right roundhouse: pivot on the front foot, turn the hips over, whip the shin across at head height, then turn back
 * into the guard. The hips swing round the planted foot, so it stays put.
 */
const PIVOT: [number, number] = [0.1, 0.14];
const kickRoundhouse: Clip = {
  id: 'kick_roundhouse', name: 'Roundhouse kick', category: 'Combat', duration: 1.4, loop: false,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    stance(out);
    const T = [0, 0.32, 0.56, 0.68, 0.92, 1.4], k = keys(T, t);
    const yaw = k([0, 40, 80, 80, 36, 0]), a = (yaw * Math.PI) / 180;
    // Chamber the knee out to the side, extend the shin through the target, chamber and set the foot back down.
    side(out, 'UpLeg', [16, 0, 4], [k([-12, 60, 70, 70, 40, -12]), 0, k([6, 40, 62, 62, 30, 6])]);
    side(out, 'Leg', [k([-24, -14, -10, -10, -16, -24]), 0, 0], [k([-14, -120, -8, -30, -80, -14]), 0, 0]);
    out.RightFoot = [k([4, -20, -30, -30, -10, 4]), 0, 0];
    out.LeftFoot = [k([8, 6, 4, 4, 6, 8]), 0, 0];
    // Lean away from the kick and keep the eyes on the target.
    out.Spine = [k([6, 0, -6, -6, 0, 6]), 0, k([0, 10, 22, 22, 10, 0])];
    out.Spine1 = [4, -10 - yaw * 0.35, k([0, 4, 8, 8, 4, 0])];
    out.Neck = [0, 6 - yaw * 0.25, 0];
    out.Head = [-4, 4 - yaw * 0.25, k([0, -6, -10, -10, -6, 0])];
    const x = PIVOT[0] - (PIVOT[0] * Math.cos(a) + PIVOT[1] * Math.sin(a)), z = PIVOT[1] - (-PIVOT[0] * Math.sin(a) + PIVOT[1] * Math.cos(a));
    return fight(out, { Left: GUARD_L, Right: GUARD_R }, { ground: true, yaw, x, z }, { Left: 1, Right: lifted(t, 0.12, 1.26) });
  },
};

/** High block: forearms up in front of the face, absorb the blow, return to the guard. */
const block: Clip = {
  id: 'block', name: 'Block (unarmed)', category: 'Combat', duration: 0.8, loop: false,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    const T = [0, 0.12, 0.24, 0.45, 0.8], k = keys(T, t);
    const up = k([0, 1, 1, 0.8, 0]), jolt = k([0, 0, 1, 0.2, 0]);
    stance(out, 0.6 * up);
    out.Spine = [6 - 10 * jolt, 0, 0];
    out.Spine1 = [4 - 4 * jolt, -10 + 6 * up, 0];
    out.Head = [-4 + 10 * up, 4, 0];
    const highL: HandTarget = { pos: v(0.075, 0.08, 0.24), pole: v(0.4, -1, 0.3), dir: v(-0.1, 1, 0.15), palm: v(0, 0, -1) };
    const highR: HandTarget = { pos: v(-0.075, 0.09, 0.23), pole: v(-0.4, -1, 0.3), dir: v(0.1, 1, 0.15), palm: v(0, 0, -1) };
    return fight(out, { Left: blendHand(GUARD_L, highL, up), Right: blendHand(GUARD_R, highR, up) }, { ground: true, z: -0.04 * jolt });
  },
};

export const COMBAT: Clip[] = [fightIdle, punchCombo, kickFront, kickRoundhouse, block];
