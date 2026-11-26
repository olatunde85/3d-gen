/**
 * At the board (Ara Educate): writing with a marker and pointing. The hand's target is the board itself, which only
 * the scene knows: Studio gives it each frame (Animator.frame's `reach`), in the character's floor space. The clips
 * set the body, the grip, how the elbow hangs and how firmly the hand follows; their own target is where the hand
 * rests when no board is given.
 */
import type { Ch, Clip } from './types';
import { fingers, fist, grip, v } from './helpers';
import { idle } from './basic';

const ease = (x: number) => { const u = Math.max(0, Math.min(1, x));return u * u * (3 - 2 * u); };
export const BOARD_CLIPS = new Set(['board_write', 'board_point']);

/** Writing on a board: facing it, a marker in the right hand, the hand following the pen across the board. */
export const boardWrite: Clip = {
  id: 'board_write', name: 'Write on the board', category: 'Everyday', duration: 4, loop: true,
  sample: (t) => {
    const s = idle.sample((t / 4) * 3.2), bones: Record<string, Ch> = { ...s.bones, Spine: [3, 0, 0], Spine1: [2, 0, 0], Neck: [-6, 0, 0], Head: [-4, 0, 0] };
    // The left hand rests at the side, fingers loose; the right grips the marker.
    fingers(bones, 14);
    grip(bones, 'Right');
    return { ...s, bones, gaze: [0, 0], thumbs: { Right: 0.5 },
      // Fingers up round the marker, palm inwards, so the thumb side (and the marker's tip) faces the board.
      ik: { Right: { pos: v(-0.2, 1.42, 0.4), pole: v(-1, -0.6, -0.4), dir: v(-0.1, 1, 0.35), palm: v(1, 0, 0.1), space: 'floor' } } };
  },
};

/** Pointing at the board with the right index finger, the arm rising to it and holding. */
export const boardPoint: Clip = {
  id: 'board_point', name: 'Point at the board', category: 'Everyday', duration: 2, loop: false,
  sample: (t) => {
    const w = ease(t / 0.55), s = idle.sample(t * 0.8), bones: Record<string, Ch> = { ...s.bones };
    fingers(bones, 14);
    fist(bones, ['Right']);
    for (const k of [1, 2, 3]) bones[`RightHandIndex${k}`] = [0, 0, 0];
    return { ...s, bones, gaze: [0, 0], thumbs: { Right: 1 },
      ik: { Right: { pos: v(-0.45, 1.35, 0.45), tip: true, pole: v(-1, -0.8, -0.2), dir: v(-0.5, 0.1, 1), palm: v(1, 0, 0), space: 'floor' } },
      ikWeight: { Right: w } };
  },
};

export const TEACHING: Clip[] = [boardWrite, boardPoint];
