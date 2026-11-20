import { BALL_PATHS } from './clips/sports';

/**
 * Stage props: the objects some clips are authored against (a ladder, a vault obstacle, a ledge wall, low cover, and
 * the football the sports clips kick, catch and dive for).
 */
export type StageProp = 'ladder' | 'obstacle' | 'ledge' | 'cover' | 'football';
export const STAGE_PROP_LABELS: Record<StageProp, string> = { ladder: 'Ladder', obstacle: 'Vault obstacle', ledge: 'Ledge wall', cover: 'Cover wall', football: 'Football' };

const PROP_FOR_CLIP: Record<string, StageProp> = {
  ladder_up: 'ladder', ladder_down: 'ladder', vault_over: 'obstacle', ledge_hang: 'ledge', ledge_climb_up: 'ledge',
  take_cover: 'cover', cover_idle: 'cover', cover_fire: 'cover',
  soccer_shoot: 'football', soccer_pass: 'football', soccer_side_pass_left: 'football', soccer_side_pass_forward: 'football', soccer_side_pass_right: 'football',
  ball_pick_up: 'football', ball_bounce: 'football', throw_side_right: 'football', throw_side_left: 'football', throw_two_hands: 'football', throw_low_right: 'football', throw_low_left: 'football', slide_tackle: 'football', keeper_catch: 'football',
  keeper_dive_left: 'football', keeper_dive_right: 'football', keeper_low_dive_left: 'football', keeper_low_dive_right: 'football',
};

/** The prop a clip is authored against, or undefined for clips without one. */
export const stagePropFor = (clipId: string): StageProp | undefined => PROP_FOR_CLIP[clipId];

/** A size 5 football's radius (metres). */
export const FOOTBALL_RADIUS = 0.11;

/**
 * Where the football is at clip time `t`: metres at 1.8 m height in the character's starting frame (+X left, +Z
 * forward), from the floor. It waits at the foot until the kick's contact, then flies; a keeper's ball arrives from the
 * front, meets the hands and is held (catch) or pushed wide (dives).
 */
export function footballAt(clipId: string, t: number): [number, number, number] | undefined {
  const r = FOOTBALL_RADIUS, flight = (from: [number, number, number], vel: [number, number, number], dt: number): [number, number, number] =>
    [from[0] + vel[0] * dt, Math.max(r, from[1] + vel[1] * dt - 6.5 * dt * dt), from[2] + vel[2] * dt];
  if (clipId === 'soccer_shoot') return t < 0.3 ? [-0.1, r, 0.4] : flight([-0.1, r, 0.4], [0, 4.5, 17], t - 0.3);
  if (clipId === 'soccer_pass') return t < 0.22 ? [-0.1, r, 0.34] : [-0.1, r, 0.34 + 8 * (t - 0.22)];
  // The inside of the right foot sends the ball left, straight ahead or (the body opened) to the right.
  if (clipId === 'soccer_side_pass_left') return t < 0.24 ? [-0.06, r, 0.24] : [-0.06 + 6.5 * (t - 0.24), r, 0.24 + 3 * (t - 0.24)];
  if (clipId === 'soccer_side_pass_forward') return t < 0.24 ? [-0.1, r, 0.32] : [-0.1, r, 0.32 + 8 * (t - 0.24)];
  if (clipId === 'soccer_side_pass_right') return t < 0.24 ? [-0.31, r, 0.13] : [-0.31 - 6.1 * (t - 0.24), r, 0.13 + 5.1 * (t - 0.24)];
  const held = BALL_PATHS[clipId];
  if (held) return held(t);
  if (clipId === 'slide_tackle') return t < 0.36 ? [-0.1, r, 1.55] : flight([-0.1, r, 1.55], [-1.6, 1.5, 3.2], t - 0.36);
  if (clipId === 'keeper_catch') return t < 0.3 ? [0, 1.12, 0.36 + (0.3 - t) * 14] : [0, 1.12 - 0.12 * Math.min(1, (t - 0.3) / 0.25), 0.36 - 0.06 * Math.min(1, (t - 0.3) / 0.25)];
  const dive = /^keeper_(low_)?dive_(left|right)$/.exec(clipId);
  if (dive) {
    const x = dive[2] === 'left' ? 1 : -1, at: [number, number, number] = dive[1] ? [1.35 * x, r + 0.04, 0.3] : [1.05 * x, 1.5, 0.35];
    return t < 0.42 ? [at[0], at[1], at[2] + (0.42 - t) * 14] : flight(at, [2.5 * x, 2.2, -1.2], t - 0.42);
  }
  return undefined;
}
