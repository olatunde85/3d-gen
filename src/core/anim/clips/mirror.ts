/**
 * Left/right mirroring of keyframed clips: a right-footed kick becomes a left-footed one, a right-hand throw a left-hand
 * one. Bones swap sides with their twist and side channels negated; the root, hand and foot targets, planted feet,
 * faces and gaze mirror with them. Motion-captured poses are left as they are.
 */
import type { Ch, Clip, FootTarget, HandTarget, Sample } from './types';

type V3 = [number, number, number];
const flipV = (a: V3): V3 => [-a[0], a[1], a[2]];
const other = (name: string) => name.startsWith('Left') ? `Right${name.slice(4)}` : name.startsWith('Right') ? `Left${name.slice(5)}` : name;
/** Face shapes named ...Left / ...Right swap. */
const otherFace = (name: string) => name.endsWith('Left') ? `${name.slice(0, -4)}Right` : name.endsWith('Right') ? `${name.slice(0, -5)}Left` : name;
const swap = <T>(o?: { Left?: T; Right?: T }, f: (x: T) => T = (x) => x) => o && { Left: o.Right === undefined ? undefined : f(o.Right), Right: o.Left === undefined ? undefined : f(o.Left) };
const flipHand = (h: HandTarget): HandTarget => ({ ...h, pos: flipV(h.pos), pole: flipV(h.pole), dir: h.dir && flipV(h.dir), palm: h.palm && flipV(h.palm) });
const flipFoot = (f: FootTarget): FootTarget => ({ ...f, pos: flipV(f.pos), pole: flipV(f.pole) });

export function mirrorSample(s: Sample): Sample {
  const bones: Record<string, Ch> = {};
  for (const [name, ch] of Object.entries(s.bones)) bones[other(name)] = [ch[0], -ch[1], -ch[2]];
  const r = s.root, neg = (x?: number) => x === undefined ? undefined : -x;
  const face = s.face && Object.fromEntries(Object.entries(s.face).map(([k, w]) => [otherFace(k), w]));
  return {
    ...s, bones, face,
    root: { ...r, x: neg(r.x), yaw: neg(r.yaw), roll: neg(r.roll) },
    ik: swap(s.ik, flipHand), ikWeight: swap(s.ikWeight), feet: swap(s.feet, flipFoot), plant: swap(s.plant), thumbs: swap(s.thumbs),
    gaze: s.gaze && [-s.gaze[0], s.gaze[1]],
    blend: s.blend && { ...s.blend, sample: mirrorSample(s.blend.sample) },
  };
}

/** The clip performed with the other side of the body (same id unless one is given). */
export function mirrorClip(c: Clip, id = c.id, name = c.name): Clip {
  return { ...c, id, name, travel: c.travel && [-c.travel[0], c.travel[1], c.travel[2]], sample: (t) => mirrorSample(c.sample(t)) };
}

const cache = new WeakMap<Clip, Clip>();
/** Cached mirror of a clip, for playing it left-footed. */
export function mirrored(c: Clip): Clip {
  let m = cache.get(c);
  if (!m) { m = mirrorClip(c); cache.set(c, m); }
  return m;
}
