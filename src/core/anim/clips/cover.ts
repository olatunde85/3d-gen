/**
 * Rifle combat: taking cover behind a low wall, waiting in cover, popping up to fire over it, and hit and death
 * reactions that keep hold of the rifle. Cover idle and Cover fire are built against a wall `COVER` (metres at 1.8 m
 * height, from the character's position, facing forward); Take cover starts from Rifle idle and steps up to it.
 */
import type { Ch, Clip, HandTarget } from './types';
import { grip, side, smoother, track, v } from './helpers';
import { AIM, READY, hold, rifleUpper, stance, type Hold } from './shooter';
import { deathBackward, deathForward, hitFrom } from './reactions';

export const COVER = { near: 0.58, depth: 0.3, height: 1.1, width: 1.6 };

type V3 = [number, number, number];
const keys = (T: number[], t: number) => (vals: number[]) => track(T, vals)(t);

/** Low crouch behind the wall (`w` 0 = standing rifle stance, 1 = crouched), weight on the balls of the feet. */
function crouch(out: Record<string, Ch>, w: number) {
  const stand: Record<string, Ch> = {};
  stance(stand);
  const pose: Record<string, [Ch, Ch]> = { UpLeg: [[108, 0, 10], [92, 0, 8]], Leg: [[-138, 0, 0], [-145, 0, 0]], Foot: [[36, 0, 0], [50, 0, 0]] };
  const lerp = (a: Ch, b: Ch): Ch => a.map((x, i) => x + (b[i] - x) * w) as Ch;
  for (const [bone, [l, r]] of Object.entries(pose)) {
    // The stance's right side is stored mirrored; unmirror it to blend in side()'s left-handed values.
    const R = stand[`Right${bone}`];
    side(out, bone, lerp(stand[`Left${bone}`], l), lerp([R[0], -R[1], -R[2]], r));
  }
  out.Spine = [26 * w, 0, 0];
}

/** Muzzle up, rifle close to the chest: the hold in cover, clear of the wall and the floor. */
const PORT: Hold = {
  Right: { pos: v(-0.12, -0.36, 0.2), pole: v(-1, -0.6, -0.4), dir: v(0.1, 0.88, 0.45), palm: v(1, 0, 0) },
  Left: { ...READY.Left },
};
const mix3 = (a: V3, b: V3, w: number): V3 => v(a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w);
/** Both hands blended from hold `a` to hold `b` (the support hand keeps finding the rifle). */
function between(a: Hold, b: Hold, w: number): Hold {
  const hand = (x: HandTarget, y: HandTarget): HandTarget => ({ ...y, pos: mix3(x.pos, y.pos, w), pole: mix3(x.pole, y.pole, w), dir: mix3(x.dir!, y.dir!, w), palm: mix3(x.palm!, y.palm!, w) });
  return { Right: hand(a.Right, b.Right), Left: hand(a.Left, b.Left) };
}

/**
 * Take cover: two steps forward (left, then right) while the rifle comes up to the chest, then down into the crouch
 * behind the wall. Starts from Rifle idle and ends in Cover idle, `TAKE_COVER_STEP` further forward. Each foot is
 * planted on the floor (floor space, as residuals around the even travel) so nothing slides.
 */
export const TAKE_COVER_STEP = 0.46;
const TAKE = 1.2, TAKE_V: V3 = [0, 0, TAKE_COVER_STEP / TAKE];
// Ankles standing in Rifle idle and crouched in Cover idle (metres at 1.8 m height, from the character's position).
const STAND = { Left: v(0.18, 0.09, 0.08), Right: v(-0.2, 0.09, -0.1) }, LOW = { Left: v(0.17, 0.07, 0.16), Right: v(-0.15, 0.08, 0.06) };
const takeCover: Clip = {
  id: 'take_cover', name: 'Take cover', category: 'Shooter', duration: TAKE, loop: false, travel: TAKE_V,
  sample: (t) => {
    const w = Math.sin((Math.PI / 2) * Math.min(1, t / 1.1)), out: Record<string, Ch> = {};
    crouch(out, w);
    rifleUpper(out, false);
    out.Head = [4 - 10 * w, 0, 0];
    const step = (s: 'Left' | 'Right', from: number, to: number) => {
      const f = smoother((t - from) / (to - from)), a = STAND[s], b = LOW[s];
      const pos = mix3(a, v(b[0], b[1], b[2] + TAKE_COVER_STEP), f);
      // Eased on from the Rifle idle stance it starts in.
      return { pos: v(pos[0], pos[1] + 0.09 * Math.sin(Math.PI * f), pos[2] - TAKE_V[2] * t), pole: v(s === 'Left' ? 0.3 : -0.3, 0, 1), weight: smoother(t / 0.12) };
    };
    return { bones: out, root: { ground: true }, ik: between(READY, PORT, Math.sin((Math.PI / 2) * Math.min(1, t / 0.45))), feet: { Left: step('Left', 0.05, 0.55), Right: step('Right', 0.48, 0.88) }, gaze: [0, 0] };
  },
};

const coverIdle: Clip = {
  id: 'cover_idle', name: 'Cover idle', category: 'Shooter', duration: 3.2, loop: true,
  sample: (t) => {
    const out: Record<string, Ch> = {};
    crouch(out, 1);
    rifleUpper(out, false);
    // Breathe, and glance left and right along the wall.
    const p = (t / 3.2) * Math.PI * 2;
    out.Spine1 = [2 + Math.sin(p * 2), 0, 0];
    out.Head = [-6, 22 * Math.sin(p), 0];
    return { bones: out, root: { ground: true }, ik: PORT, gaze: [0, 0] };
  },
};

/** Rise until the rifle clears the wall, bring it down into the aim, fire three shots, lift it and duck back down. */
const coverFire: Clip = {
  id: 'cover_fire', name: 'Cover fire (pop up)', category: 'Shooter', duration: 2.4, loop: false,
  sample: (t) => {
    const k = keys([0, 0.4, 1.75, 2.15, 2.4], t), up = k([0, 1, 1, 0, 0]);
    const aim = keys([0, 0.25, 0.55, 1.65, 1.95, 2.4], t)([0, 0, 1, 1, 0, 0]), out: Record<string, Ch> = {};
    crouch(out, 1 - up);
    rifleUpper(out, aim > 0.5);
    out.Head = [-6 + 16 * up, -8 * aim, -4 * aim];
    // Three aimed shots.
    const shot = [0.75, 1.05, 1.35].reduce((m, s) => Math.max(m, t >= s ? Math.exp(-(t - s) * 28) : 0), 0);
    return { bones: out, root: { ground: true }, ik: between(PORT, hold(AIM, shot) as Hold, aim), gaze: [0, 0] };
  },
};

/** A hit reaction holding the rifle at low ready: the body follows the unarmed hit, the upper body a little stiffer. */
function rifleHit(dir: 'front' | 'back'): Clip {
  const base = hitFrom(dir), stiff = dir === 'front' ? 0.55 : 0.8;
  return {
    ...base, id: `rifle_hit_${dir}`, name: `Rifle hit from ${dir}`, category: 'Shooter',
    sample: (t) => {
      const s = base.sample(t), out: Record<string, Ch> = {};
      for (const [b, ch] of Object.entries(s.bones)) if (!/Arm|Hand/.test(b)) out[b] = ch;
      rifleUpper(out, false);
      for (const b of ['Spine', 'Spine1', 'Neck', 'Head']) if (s.bones[b]) out[b] = s.bones[b].map((x) => x * stiff) as Ch;
      return { ...s, bones: out, ik: hold(READY), gaze: [0, 0] };
    },
  };
}

/**
 * Death falling forward or backward from low ready: the support hand lets go first, then the rifle hand eases off the
 * hold and onto a floor-space path (switching while it follows the body, so there is no jump) that lays the rifle
 * flat on its side beside the body, palm up so the rifle lies on the hand rather than under it. The body ends where
 * the unarmed deaths end, so the get-ups follow.
 */
interface Laid { T: number[]; pos: V3[]; dir: V3; palm: V3; pole: V3; release: [number, number]; settle: [number, number] }
function rifleDeath(base: Clip, id: string, name: string, laid: Laid): Clip {
  return {
    ...base, id, name, category: 'Shooter',
    sample: (t) => {
      const s = base.sample(t), bones = { ...s.bones };
      grip(bones, 'Right', true);
      const ready = hold(READY)!, down = t >= laid.release[1];
      const at = (d: number) => track(laid.T, laid.pos.map((p) => p[d]))(t);
      const rest: HandTarget = { space: 'floor', pos: v(at(0), at(1), at(2)), dir: laid.dir, palm: laid.palm, pole: laid.pole };
      const ramp = (r: [number, number]) => smoother((t - r[0]) / (r[1] - r[0]));
      return {
        ...s, bones, ik: { Left: ready.Left, Right: down ? rest : ready.Right },
        ikWeight: { Left: 1 - smoother((t - 0.08) / 0.3), Right: down ? ramp(laid.settle) : 1 - ramp(laid.release) }, gaze: [0, 0],
      };
    },
  };
}
// Forward: the rifle is carried ahead, above the floor, and set down beside the head.
const FACE_DOWN: Laid = {
  T: [0.38, 0.75, 1.1], pos: [v(-0.3, 0.6, 0.5), v(-0.42, 0.25, 1.0), v(-0.45, 0.06, 1.2)],
  dir: v(-0.2, 0, 1), palm: v(0, 1, 0), pole: v(-1, 0.4, -0.3), release: [0.28, 0.38], settle: [0.38, 0.5],
};
// Backward: the arm follows the fall, then the rifle is carried out to the side and laid down beside the hips.
const ON_BACK: Laid = {
  T: [0.65, 1.0, 1.3], pos: [v(-0.5, 0.5, -0.4), v(-0.6, 0.22, -0.6), v(-0.58, 0.05, -0.62)], dir: v(-0.6, 0, 0.8), palm: v(0, 1, 0), pole: v(-1, 0.3, 0.2),
  release: [0.3, 0.65], settle: [0.65, 0.9],
};

export const RIFLE_COMBAT: Clip[] = [
  takeCover, coverIdle, coverFire,
  rifleHit('front'), rifleHit('back'),
  rifleDeath(deathForward, 'rifle_death_forward', 'Rifle death (fall forward)', FACE_DOWN),
  rifleDeath(deathBackward, 'rifle_death_backward', 'Rifle death (fall backward)', ON_BACK),
];
