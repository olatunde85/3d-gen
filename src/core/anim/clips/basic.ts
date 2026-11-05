/** Idle and crouch stance (recorded locomotion is in recorded.ts). */
import { type Ch, type Clip } from './types';
import { fingers, side } from './helpers';

export const idle: Clip = {
  id: 'idle', name: 'Idle', category: 'Idle & stance', duration: 3.2, loop: true,
  sample: (t) => {
    const a = (t / 3.2) * Math.PI * 2;
    const out: Record<string, Ch> = {
      Spine: [1.2 * Math.sin(a), 0, 0],
      Spine2: [1.5 * Math.sin(a + 0.7), 0, 0],
      Hips: [0, 0, 1.5 * Math.sin(a * 0.5)],
      Neck: [0, 0, -0.8 * Math.sin(a * 0.5)],
      Head: [2 * Math.sin(a + 1), 7 * Math.sin(a * 0.5), 0],
    };
    side(out, 'Arm', [2 * Math.sin(a), 0, 3 + Math.sin(a)], [2 * Math.sin(a + 0.4), 0, 3 + Math.sin(a + 0.4)]);
    side(out, 'ForeArm', [12 + 2 * Math.sin(a), 0, 0], [12 + 2 * Math.sin(a + 0.4), 0, 0]);
    side(out, 'Leg', [-3, 0, 0], [-3, 0, 0]);
    side(out, 'UpLeg', [0, 0, -3], [0, 0, -3]);
    fingers(out, 14);
    return { bones: out, root: { x: 0.008 * Math.sin(a * 0.5), y: 0.002 * Math.sin(a), ground: true } };
  },
};

export const crouch: Clip = {
  id: 'crouch', name: 'Crouch idle', category: 'Idle & stance', duration: 3, loop: true,
  sample: (t) => {
    const a = (t / 3) * Math.PI * 2;
    const out: Record<string, Ch> = {
      Spine: [20 + Math.sin(a), 0, 0], Spine1: [8, 0, 0], Neck: [-10, 0, 0], Head: [-14, 6 * Math.sin(a * 0.5), 0],
    };
    side(out, 'UpLeg', [78, 0, 8], [78, 0, 8]);
    side(out, 'Leg', [-118, 0, 0], [-118, 0, 0]);
    side(out, 'Foot', [36, 0, 0], [36, 0, 0]);
    side(out, 'Arm', [32 + Math.sin(a), 0, 8], [32 + Math.sin(a + 0.5), 0, 8]);
    side(out, 'ForeArm', [55, 0, 0], [55, 0, 0]);
    fingers(out, 20);
    return { bones: out, root: { ground: true } };
  },
};
