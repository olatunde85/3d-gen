/**
 * Two-person interactions: a handshake and a hug. Each is symmetric, so both people play the same clip, standing face
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
/** Hugging partners stand close, chest to chest, a little offset so their heads pass each other. */
const HUG: PairPlacement = { x: -0.08, z: 0.42 };

/** The interactions two people play together, by clip ID, with where the partner stands. */
export const PAIRS: Record<string, PairPlacement> = { handshake: SHAKE, hug: HUG };

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

/** Hug: open the arms, wrap them round (right arm over the partner's shoulder, left round the waist), hold, let go. */
export const hug: Clip = {
  id: 'hug', name: 'Hug', category: 'Interaction', duration: 3.4, loop: false,
  sample: (t) => {
    const w = envelope(t, 0.1, 0.8, 2.7, 3.35);
    const sway = Math.sin(((t - 0.8) / 1.9) * Math.PI * 2) * w, pat = t > 1.4 && t < 2.4 ? Math.max(0, Math.sin(((t - 1.4) / 0.5) * Math.PI * 2)) : 0;
    const { s, bones } = stand(t, 8 * w);
    // The head turns to the left, so the two heads go to opposite sides.
    const head = bones.Head ?? [0, 0, 0], neck = bones.Neck ?? [0, 0, 0];
    bones.Neck = [neck[0] + 6 * w, neck[1] + 16 * w, neck[2] - 4 * w];
    bones.Head = [head[0] + 8 * w, head[1] + 20 * w, head[2] - 6 * w];
    const spine = bones.Spine ?? [0, 0, 0];
    bones.Spine = [spine[0], spine[1], spine[2] + 2 * sway];
    side(bones, 'Shoulder', [0, 0, 6 * w], [0, 0, 8 * w]);
    fingers(bones, 12);
    // Right hand on the partner's far shoulder blade, the arm passing over their shoulder (elbow up and out); left hand
    // round their waist, on the back clear of the body and clothes.
    const over: HandTarget = { space: 'floor', pos: v(HUG.x - 0.14, 1.38, HUG.z + 0.17 + 0.02 * pat), pole: v(-0.8, 0.8, -0.1), dir: v(0.6, -0.4, 0.5), palm: v(0.1, 0, -1) };
    const under: HandTarget = { space: 'floor', pos: v(HUG.x + 0.16, 1.0, HUG.z + 0.18), pole: v(1, -0.4, -0.5), dir: v(-0.75, 0, 0.4), palm: v(0, 0, -1) };
    return { ...s, bones, ik: { Left: under, Right: over }, ikWeight: { Left: w, Right: w } };
  },
};

export const PARTNER_CLIPS: Clip[] = [handshake, hug];
