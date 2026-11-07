/**
 * Dodge and roll: a forward (shoulder) roll and quick side dodges. Root motion is carried by `travel`, so
 * engines can play them in place or moving; the body stays above the floor through the roll.
 */
import type { Ch, Clip } from './types';
import { fingers, side, track } from './helpers';

/** Crouch, hands to the floor, tuck the head and roll over the back, then come up through a crouch to stand. */
export const forwardRoll: Clip = {
  id: 'roll_forward', name: 'Forward roll', category: 'Actions', duration: 1.3, loop: false, travel: [0, 0, 1.5],
  sample: (t) => {
    const T = [0, 0.22, 0.42, 0.6, 0.8, 1.0, 1.3];
    const k = (v: number[]) => track(T, v)(t);
    const out: Record<string, Ch> = {
      Spine: [k([5, 30, 45, 50, 40, 20, 0]), 0, 0], Spine1: [k([3, 20, 30, 30, 25, 10, 0]), 0, 0],
      Neck: [k([0, 20, 40, 40, 30, 10, 0]), 0, 0], Head: [k([0, 10, 25, 25, 15, 0, 0]), 0, 0],
    };
    // Legs tuck tight while inverted, then plant under the hips to rise.
    side(out, 'UpLeg', [k([10, 90, 80, 120, 130, 90, 3]), 0, 6], [k([10, 90, 80, 120, 130, 90, 3]), 0, 6]);
    side(out, 'Leg', [k([-15, -110, -60, -130, -135, -110, -3]), 0, 0], [k([-15, -110, -60, -130, -135, -110, -3]), 0, 0]);
    side(out, 'Foot', [k([5, 30, 10, 20, 30, 30, 0]), 0, 0], [k([5, 30, 10, 20, 30, 30, 0]), 0, 0]);
    // Hands reach for the floor, then the arms hug the knees and swing forward for balance.
    side(out, 'Arm', [k([10, 60, 90, 60, 40, 40, 5]), 0, k([5, 10, 10, 20, 20, 15, 4])], [k([10, 60, 90, 60, 40, 40, 5]), 0, k([5, 10, 10, 20, 20, 15, 4])]);
    side(out, 'ForeArm', [k([20, 20, 10, 60, 40, 30, 12]), 0, 0], [k([20, 20, 10, 60, 40, 30, 12]), 0, 0]);
    fingers(out, k([14, 10, 6, 30, 30, 20, 14]));
    return { bones: out, root: { drop: k([0, 0.45, 0.7, 0.9, 0.85, 0.5, 0]), pitch: k([0, 20, 95, 185, 280, 340, 360]), floor: true } };
  },
};

/** Duck into a crouch, push off the far leg, hop sideways and land low on the near leg, guard up, then recover. */
function dodge(dir: 1 | -1): Clip {
  const T = [0, 0.15, 0.4, 0.65, 0.9];
  return {
    id: dir > 0 ? 'dodge_left' : 'dodge_right', name: dir > 0 ? 'Side dodge left' : 'Side dodge right', category: 'Actions',
    duration: 0.9, loop: false, travel: [dir * 1.3, 0, 0],
    sample: (t) => {
      const k = (v: number[]) => track(T, v)(t);
      // Lean over the landing leg.
      const lean = (v: number[]) => k(v.map((x) => x * dir));
      const out: Record<string, Ch> = {
        Spine: [k([5, 20, 15, 25, 5]), 0, lean([0, 0, -12, -14, 0])], Spine1: [k([2, 10, 8, 12, 2]), 0, lean([0, 0, -6, -8, 0])],
        Head: [k([-5, -15, -10, -15, -5]), 0, lean([0, 0, 10, 12, 0])],
      };
      // Land on the bent leg on the dodge side; the far leg pushes off and stays stretched out behind the move.
      const lead: [Ch, Ch, Ch] = [[k([10, 40, 35, 55, 10]), 0, k([3, 6, 8, 8, 3])], [k([-15, -70, -60, -95, -15]), 0, 0], [k([5, 25, 15, 30, 5]), 0, 0]];
      const push: [Ch, Ch, Ch] = [[k([10, 40, 15, 15, 10]), 0, k([3, 6, 35, 40, 3])], [k([-15, -70, -5, -8, -15]), 0, 0], [k([5, 25, 0, 5, 5]), 0, 0]];
      const [l, r] = dir > 0 ? [lead, push] : [push, lead];
      side(out, 'UpLeg', l[0], r[0]); side(out, 'Leg', l[1], r[1]); side(out, 'Foot', l[2], r[2]);
      // Guard up through the move.
      const arm = k([10, 35, 40, 45, 10]), wide = k([5, 15, 30, 20, 5]), fore = k([20, 80, 60, 80, 20]);
      side(out, 'Arm', [arm, 0, wide], [arm, 0, wide]); side(out, 'ForeArm', [fore, 0, 0], [fore, 0, 0]);
      fingers(out, k([14, 40, 40, 40, 14]));
      return { bones: out, root: { ground: true, lift: k([0, 0, 0.12, 0, 0]) } };
    },
  };
}

export const DODGES: Clip[] = [forwardRoll, dodge(1), dodge(-1)];
