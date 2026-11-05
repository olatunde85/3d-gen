/** Procedural low gait for crouch locomotion; upright movement uses recorded.ts. */
import { type Ch, type Sample } from './types';
import { cyc, fingers, side } from './helpers';

export interface Gait {
  thigh: number[];
  knee: number[];
  foot: number[];
  arm: number[];
  elbow: number[];
  bob: number[]; // metres, 8 keys over the full cycle (two steps)
  pelvisYaw: number;
  spineLean: number;
  armOut: number;
  legIn: number;
}

export const WALK: Gait = {
  thigh: [25, 18, 6, -8, -18, -8, 12, 24],
  knee: [-5, -15, -8, -5, -22, -58, -40, -10],
  foot: [15, 0, 0, -6, -20, -10, 5, 10],
  arm: [-18, -10, 0, 10, 18, 10, 0, -10],
  elbow: [10, 11, 14, 20, 25, 20, 14, 11],
  bob: [0, -0.018, -0.004, 0.012, 0, -0.018, -0.004, 0.012],
  pelvisYaw: 5,
  spineLean: 3,
  armOut: 2,
  legIn: 5,
};

export const RUN: Gait = {
  thigh: [30, 12, -10, -25, -5, 35, 55, 42],
  knee: [-20, -42, -25, -18, -85, -110, -72, -35],
  foot: [10, 0, -12, -30, -20, 0, 15, 15],
  arm: [-32, -18, 4, 22, 28, 18, -4, -26],
  elbow: [72, 74, 80, 86, 88, 84, 78, 74],
  bob: [0, -0.04, -0.015, 0.035, 0, -0.04, -0.015, 0.035],
  pelvisYaw: 9,
  spineLean: 11,
  armOut: 6,
  legIn: 4,
};

export function gait(g: Gait, p: number, reverse = false): Sample {
  const ph = reverse ? 1 - p : p;
  const c = (keys: number[]) => cyc(keys);
  const thigh = c(g.thigh), knee = c(g.knee), foot = c(g.foot), arm = c(g.arm), elbow = c(g.elbow), bob = c(g.bob);
  const out: Record<string, Ch> = {};
  const L = ph, R = ph + 0.5;
  // Thighs slightly adducted so the feet track under the body (the bind pose stands wide).
  side(out, 'UpLeg', [thigh(L), 0, -g.legIn], [thigh(R), 0, -g.legIn]);
  side(out, 'Leg', [knee(L), 0, 0], [knee(R), 0, 0]);
  side(out, 'Foot', [foot(L), 0, g.legIn * 0.8], [foot(R), 0, g.legIn * 0.8]);
  side(out, 'Arm', [arm(L), 0, g.armOut], [arm(R), 0, g.armOut]);
  side(out, 'ForeArm', [elbow(L), 0, 0], [elbow(R), 0, 0]);
  const twist = Math.sin(ph * Math.PI * 2) * g.pelvisYaw;
  out.Hips = [0, -twist, Math.sin(ph * Math.PI * 2 + Math.PI / 2) * 2];
  out.Spine = [g.spineLean * 0.4 * (reverse ? -1 : 1), twist * 0.6, 0];
  out.Spine1 = [g.spineLean * 0.4 * (reverse ? -1 : 1), twist * 0.6, 0];
  out.Spine2 = [g.spineLean * 0.2, twist * 0.2, 0];
  out.Head = [-g.spineLean * 0.6, -twist * 0.3, 0];
  fingers(out, g === RUN ? 25 : 12);
  // Walking keeps the stance foot planted; running has a flight phase so it uses its own bob.
  return { bones: out, root: g === RUN ? { y: bob(ph) } : { ground: true } };
}
