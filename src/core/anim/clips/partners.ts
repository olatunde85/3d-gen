/**
 * Two-person interactions: a handshake. It is symmetric, so both people play the same clip, standing face
 * to face at the spacing below (PAIRS). Hands aim at fixed points in floor space (metres at 1.8 m height), so they
 * meet for two people of similar height; the clips start and end in the standing pose.
 */
import { type Ch, type Clip, type HandTarget } from './types';
import { fingers, side, v } from './helpers';
import { idle } from './basic';

/**
 * Where the partner stands, in the first person's floor space (metres at 1.8 m height, +Z forward, +X to their left),
 * facing back: `x` and `z` place the partner's feet, and the partner turns half round.
 */
export interface PairPlacement { x: number; z: number }

/** A handshake's partner stands a little to the right, so the two right hands meet in the middle. */
const SHAKE: PairPlacement = { x: -0.1, z: 0.75 };

/** The interactions two people play together, by clip ID, with where the partner stands. */
export const PAIRS: Record<string, PairPlacement> = { handshake: SHAKE };

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 0 → 1 over [a, b], held, then 1 → 0 over [c, d]. */
const envelope = (t: number, a: number, b: number, c: number, d: number) => smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)));

/** The standing pose under an interaction, with the body leaning in by `lean` degrees. */
function stand(t: number, lean: number) {
  const s = idle.sample(t % idle.duration);
  const bones: Record<string, Ch> = { ...s.bones };
  for (const [bone, share] of [['Spine', 0.4], ['Spine1', 0.35], ['Spine2', 0.25]] as const) {
    const b = bones[bone] ?? [0, 0, 0];
    bones[bone] = [b[0] + lean * share, b[1], b[2]];
  }
  return { s, bones };
}

/** Handshake: reach in, three gentle pumps, let go. */
export const handshake: Clip = {
  id: 'handshake', name: 'Handshake', category: 'Interaction', duration: 2.6, loop: false,
  sample: (t) => {
    const w = envelope(t, 0.05, 0.5, 2.0, 2.55);
    const pumps = t > 0.6 && t < 1.8 ? Math.sin(((t - 0.6) / 0.4) * Math.PI * 2) * smooth((t - 0.6) / 0.15) * smooth((1.8 - t) / 0.15) : 0;
    const { s, bones } = stand(t, 5 * w);
    const head = bones.Head ?? [0, 0, 0];
    bones.Head = [head[0] + 4 * w + 2 * pumps * w, head[1], head[2]];
    side(bones, 'Hand', [0, 0, 0], [0, 0, 0]);
    fingers(bones, 10 + 50 * w);
    // The meeting point is in front, a little to the right, at hand height. The wrists sit either side of it (palm
    // facing the partner's palm, about a hand's thickness apart) and short of it, so the two hands overlap.
    const grip: HandTarget = { space: 'floor', pos: v(-0.065, 1.04 + 0.035 * pumps, SHAKE.z / 2 - 0.06), pole: v(-1, -1, -0.3), dir: v(0.08, 0, 1), palm: v(1, 0, 0) };
    return { ...s, bones, ik: { ...s.ik, Right: grip }, ikWeight: { ...s.ikWeight, Right: w } };
  },
};

export const PARTNER_CLIPS: Clip[] = [handshake];
