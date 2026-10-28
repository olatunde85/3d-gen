/**
 * Facial blend shapes and expressions, built from MakeHuman's CC0 expression targets
 * (`targets/expression/units/<ethnicity>/*`). Each character gets the shapes blended by its
 * ethnicity mix, so faces deform naturally on every head. Shape names follow Apple's ARKit
 * convention where the MakeHuman target matches, so face-capture tools can drive them.
 */
import type { AssetLibrary } from './assets';
import { applyTargets } from './morph';
import type { HumanParams } from './params';

export interface FaceShape {
  name: string;
  /** MakeHuman expression unit names and their weights. */
  units: [string, number][];
}

export const FACE_SHAPES: FaceShape[] = [
  // Scaled per character by calibrateBlinks(): MakeHuman's closure overshoots (the lid folds under
  // itself and looks see-through), and where the lids meet depends on the face.
  { name: 'eyeBlinkLeft', units: [['eye-left-closure', 1]] },
  { name: 'eyeBlinkRight', units: [['eye-right-closure', 1]] },
  { name: 'eyeWideLeft', units: [['eye-left-opened-up', 1]] },
  { name: 'eyeWideRight', units: [['eye-right-opened-up', 1]] },
  { name: 'eyeSquintLeft', units: [['eye-left-slit', 1]] },
  { name: 'eyeSquintRight', units: [['eye-right-slit', 1]] },
  { name: 'browDownLeft', units: [['eyebrows-left-down', 1]] },
  { name: 'browDownRight', units: [['eyebrows-right-down', 1]] },
  { name: 'browInnerUp', units: [['eyebrows-left-inner-up', 1], ['eyebrows-right-inner-up', 1]] },
  { name: 'browOuterUpLeft', units: [['eyebrows-left-extern-up', 1]] },
  { name: 'browOuterUpRight', units: [['eyebrows-right-extern-up', 1]] },
  { name: 'jawOpen', units: [['mouth-open', 1]] },
  { name: 'mouthSmile', units: [['mouth-corner-puller', 1]] },
  { name: 'mouthFrown', units: [['mouth-depression', 1]] },
  { name: 'mouthPucker', units: [['mouth-pursing', 1]] },
  { name: 'mouthPress', units: [['mouth-compression', 1]] },
  { name: 'mouthStretch', units: [['mouth-retraction', 1]] },
  { name: 'noseSneerLeft', units: [['nose-left-elevation', 1]] },
  { name: 'noseSneerRight', units: [['nose-right-elevation', 1]] },
  { name: 'mouthUpperUp', units: [['mouth-part-later', 1]] },
  // Speech mouth shapes (visemes), Oculus/Meta naming as used by lip-sync tools. Rest ("sil") is
  // every shape at zero. Built from MakeHuman's mouth units; the jaw follows 'mouth-open'.
  { name: 'viseme_PP', units: [['mouth-compression', 0.8], ['mouth-pursing', 0.1]] },
  { name: 'viseme_FF', units: [['mouth-part-later', 0.35], ['mouth-eversion', -0.5], ['mouth-open', 0.05]] },
  { name: 'viseme_TH', units: [['mouth-open', 0.25], ['mouth-parling', 0.25]] },
  { name: 'viseme_DD', units: [['mouth-open', 0.28], ['mouth-parling', 0.2], ['mouth-retraction', 0.2]] },
  { name: 'viseme_kk', units: [['mouth-open', 0.38], ['mouth-retraction', 0.25]] },
  { name: 'viseme_CH', units: [['mouth-protusion', 0.8], ['mouth-open', 0.08]] },
  { name: 'viseme_SS', units: [['mouth-retraction', 0.5], ['mouth-upward-retraction', 0.5]] },
  { name: 'viseme_nn', units: [['mouth-open', 0.22], ['mouth-parling', 0.15]] },
  { name: 'viseme_RR', units: [['mouth-protusion', 0.5], ['mouth-pursing', 0.45], ['mouth-open', 0.15]] },
  { name: 'viseme_aa', units: [['mouth-open', 0.85]] },
  { name: 'viseme_E', units: [['mouth-open', 0.35], ['mouth-retraction', 0.45], ['mouth-upward-retraction', 0.15]] },
  { name: 'viseme_I', units: [['mouth-open', 0.15], ['mouth-retraction', 0.55], ['mouth-corner-puller', 0.25], ['mouth-upward-retraction', 0.15]] },
  { name: 'viseme_O', units: [['mouth-open', 0.45], ['mouth-pursing', 0.7], ['mouth-protusion', 0.4]] },
  { name: 'viseme_U', units: [['mouth-pursing', 0.9], ['mouth-protusion', 0.4], ['mouth-open', 0.08]] },
];
export const FACE_SHAPE_NAMES = FACE_SHAPES.map((s) => s.name);
export type FaceWeights = Partial<Record<string, number>>;

export const EXPRESSIONS = ['neutral', 'happy', 'laughing', 'angry', 'sad', 'crying', 'surprised', 'afraid', 'determined'] as const;
export type ExpressionId = (typeof EXPRESSIONS)[number];
export const EXPRESSION_LABELS: Record<ExpressionId, string> = {
  neutral: 'Neutral', happy: 'Happy', laughing: 'Laughing', angry: 'Angry', sad: 'Sad', crying: 'Crying', surprised: 'Surprised', afraid: 'Afraid', determined: 'Determined',
};

/** Expressions as blend-shape weights (the resting face for every clip). */
const EXPRESSIONS_RAW: Record<ExpressionId, FaceWeights> = {
  neutral: {},
  happy: { mouthSmile: 0.85, eyeSquintLeft: 0.35, eyeSquintRight: 0.35, browOuterUpLeft: 0.15, browOuterUpRight: 0.15 },
  angry: { browDownLeft: 1, browDownRight: 1, mouthPress: 0.65, mouthUpperUp: 0.2, mouthFrown: 0.25, noseSneerLeft: 0.6, noseSneerRight: 0.6, eyeSquintLeft: 0.35, eyeSquintRight: 0.35 },
  sad: { browInnerUp: 0.85, mouthFrown: 0.75, eyeBlinkLeft: 0.18, eyeBlinkRight: 0.18 },
  laughing: { mouthSmile: 1, jawOpen: 0.45, mouthUpperUp: 0.45, eyeSquintLeft: 0.65, eyeSquintRight: 0.65, browOuterUpLeft: 0.25, browOuterUpRight: 0.25 },
  crying: { browInnerUp: 1, mouthFrown: 0.85, mouthStretch: 0.35, jawOpen: 0.12, eyeSquintLeft: 0.55, eyeSquintRight: 0.55, noseSneerLeft: 0.2, noseSneerRight: 0.2 },
  surprised: { browInnerUp: 0.7, browOuterUpLeft: 0.8, browOuterUpRight: 0.8, eyeWideLeft: 0.75, eyeWideRight: 0.75, jawOpen: 0.35 },
  afraid: { browInnerUp: 0.9, eyeWideLeft: 0.6, eyeWideRight: 0.6, mouthStretch: 0.55, jawOpen: 0.15 },
  determined: { browDownLeft: 0.65, browDownRight: 0.65, mouthPress: 0.55, eyeSquintLeft: 0.3, eyeSquintRight: 0.3 },
};

/**
 * Relaxed upper lids: MakeHuman's eyes rest wide open (a staring look), so every expression that
 * doesn't widen or close the eyes itself lowers the lids slightly. Blinks still close fully.
 */
const RESTING_LID = 0.16;
export const EXPRESSION_WEIGHTS = Object.fromEntries(
  Object.entries(EXPRESSIONS_RAW).map(([id, w]) => [
    id,
    'eyeWideLeft' in w || 'eyeBlinkLeft' in w ? w : { ...w, eyeBlinkLeft: RESTING_LID, eyeBlinkRight: RESTING_LID },
  ]),
) as Record<ExpressionId, FaceWeights>;

/** The shapes a character gets: all, or without the speech shapes (they come last, so the other
 * shapes keep their indices). */
export function faceShapeNames(speech: boolean): string[] {
  return speech ? FACE_SHAPE_NAMES : FACE_SHAPE_NAMES.filter((n) => !n.startsWith('viseme_'));
}

/** Weights in `names` order (default: every shape). */
export function weightsArray(w: FaceWeights, names = FACE_SHAPE_NAMES): number[] {
  return names.map((n) => w[n] ?? 0);
}

/**
 * Per-shape vertex offsets on the base mesh (decimetres), blended by the character's ethnicity
 * mix. Returns one Float32Array (vertexCount * 3) per shape in `names` (default: every shape).
 */
export function faceDeltas(lib: AssetLibrary, p: HumanParams, names = FACE_SHAPE_NAMES): Float32Array[] {
  return names.map((n) => faceShapeDelta(lib, p, n));
}

/** One face shape's offsets (see faceDeltas), by name. */
export function faceShapeDelta(lib: AssetLibrary, p: HumanParams, name: string): Float32Array {
  return shapeDelta(lib, p, FACE_SHAPES.find((s) => s.name === name)!);
}

function shapeDelta(lib: AssetLibrary, p: HumanParams, shape: FaceShape): Float32Array {
  const rs = p.african + p.asian + p.caucasian;
  const mix: [string, number][] = rs > 0
    ? [['african', p.african / rs], ['asian', p.asian / rs], ['caucasian', p.caucasian / rs]]
    : [['african', 1 / 3], ['asian', 1 / 3], ['caucasian', 1 / 3]];
  const base = lib.base.arrays.positions as Float32Array;
  const w = new Map<string, number>();
  for (const [unit, k] of shape.units)
    for (const [eth, e] of mix) if (e > 1e-4) w.set(`expression/units/${eth}/${unit}`, (w.get(`expression/units/${eth}/${unit}`) ?? 0) + k * e);
  const moved = applyTargets(lib, w);
  for (let i = 0; i < moved.length; i++) moved[i] -= base[i];
  return moved;
}


/**
 * Scale the blink shapes so weight 1 is "just closed" on this face. For each eye, rays from in
 * front through the iris area must hit eyelid skin before the eyeball; a short search finds the
 * weakest closure that covers them all (MakeHuman's full closure overshoots and folds the lid).
 * Units: decimetres, face looking toward +Z. `eyes`: fitted eyeball mesh (both eyes).
 */
export function calibrateBlinks(
  deltas: Float32Array[], coords: Float32Array, bodyQuads: Uint32Array,
  eyes: { positions: Float32Array; faceSizes: Uint8Array; faceVerts: Uint32Array },
): number[] {
  const scales: number[] = [];
  for (const [name, sign] of [['eyeBlinkLeft', 1], ['eyeBlinkRight', -1]] as const) {
    const s = FACE_SHAPE_NAMES.indexOf(name);
    const d = deltas[s];
    // Eyeball triangles and the cornea's front point for this eye.
    const eyeTris: number[][] = [];
    let apex = [0, 0, -Infinity];
    for (let f = 0, c = 0; f < eyes.faceSizes.length; c += eyes.faceSizes[f], f++) {
      const vs = Array.from(eyes.faceVerts.subarray(c, c + eyes.faceSizes[f]));
      if (Math.sign(eyes.positions[vs[0] * 3]) !== sign) continue;
      for (let k = 1; k < vs.length - 1; k++) eyeTris.push([vs[0], vs[k], vs[k + 1]]);
    }
    for (let i = 0; i < eyes.positions.length; i += 3)
      if (Math.sign(eyes.positions[i]) === sign && eyes.positions[i + 2] > apex[2]) apex = [eyes.positions[i], eyes.positions[i + 1], eyes.positions[i + 2]];
    // Skin quads around the eye that the blink moves (the lids) or that border them.
    const near = (v: number) => Math.hypot(coords[v * 3] - apex[0], coords[v * 3 + 1] - apex[1]) < 0.3 && coords[v * 3 + 2] > apex[2] - 0.25;
    const quads: number[] = [];
    for (let f = 0; f < bodyQuads.length / 4; f++) if ([0, 1, 2, 3].every((k) => near(bodyQuads[f * 4 + k]))) quads.push(f);
    // Engines don't draw back faces, so a lid folded under itself does not hide the eye: only
    // skin facing the viewer counts.
    const hit = frontHit;
    const eyeT = Uint32Array.from(eyeTris.flat());
    const skinT = Uint32Array.from(quads.flatMap((f) => [bodyQuads[f * 4], bodyQuads[f * 4 + 1], bodyQuads[f * 4 + 2], bodyQuads[f * 4], bodyQuads[f * 4 + 2], bodyQuads[f * 4 + 3]]));
    // Rays over the whole eye area; keep those that see the eyeball with the eye open.
    const rays: [number, number, number][] = [];
    for (let i = -10; i <= 10; i++)
      for (let j = -7; j <= 7; j++) {
        const x = apex[0] + i * 0.012, y = apex[1] + j * 0.012;
        const z = hit(x, y, eyeT, eyes.positions);
        if (z > -Infinity && z > hit(x, y, skinT, coords, true) + 0.002) rays.push([x, y, z]);
      }
    const moved = new Float32Array(coords.length);
    const closed = (w: number) => {
      for (const v of skinT) for (let k = 0; k < 3; k++) moved[v * 3 + k] = coords[v * 3 + k] + d[v * 3 + k] * w;
      return rays.every(([x, y, z]) => hit(x, y, skinT, moved, true) >= z - 0.002);
    };
    let scale = 0.55; // fallback: typical for MakeHuman faces
    if (rays.length && closed(1.2)) {
      let lo = 0.2, hi = 1.2;
      for (let it = 0; it < 8; it++) {
        const m = (lo + hi) / 2;
        if (closed(m)) hi = m;
        else lo = m;
      }
      scale = Math.min(1.2, hi + 0.04); // a touch past first contact, so the lids meet fully
    }
    for (let i = 0; i < d.length; i++) d[i] *= scale;
    scales.push(scale);
  }
  return scales;
}

/** Front-most z of a ray toward -Z at (x, y) on triangles `tris` (corners in flat xyz `P`).
 * With `facing`, only triangles facing the viewer (+Z, counter-clockwise) count. */
function frontHit(x: number, y: number, tris: Uint32Array, P: Float32Array, facing = false): number {
  let best = -Infinity;
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
    const ax = P[a], ay = P[a + 1], bx = P[b], by = P[b + 1], cx = P[c], cy = P[c + 1];
    if (x < Math.min(ax, bx, cx) || x > Math.max(ax, bx, cx) || y < Math.min(ay, by, cy) || y > Math.max(ay, by, cy)) continue;
    if (facing && (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) <= 0) continue;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den;
    const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den;
    if (u < 0 || v < 0 || u + v > 1) continue;
    best = Math.max(best, u * P[a + 2] + v * P[b + 2] + (1 - u - v) * P[c + 2]);
  }
  return best;
}

/** Triangles grouped by the ray columns (x values) they span, so each ray tests only its column. */
function byColumn(tris: Uint32Array, P: Float32Array, xs: number[]): Uint32Array[] {
  const cols: number[][] = xs.map(() => []);
  const step = xs.length > 1 ? xs[1] - xs[0] : 1;
  for (let t = 0; t < tris.length; t += 3) {
    const a = P[tris[t] * 3], b = P[tris[t + 1] * 3], c = P[tris[t + 2] * 3];
    const i0 = Math.max(0, Math.ceil((Math.min(a, b, c) - xs[0]) / step)), i1 = Math.min(xs.length - 1, Math.floor((Math.max(a, b, c) - xs[0]) / step));
    for (let i = i0; i <= i1; i++) cols[i].push(tris[t], tris[t + 1], tris[t + 2]);
  }
  return cols.map((c) => Uint32Array.from(c));
}

/**
 * How much of the teeth shows from the front: rays over the teeth (finely spaced up and down) that hit a tooth
 * in front of the face's front-facing skin (or through a gap between the lips). Units:
 * decimetres, face toward +Z.
 */
export function teethShowing(teeth: Float32Array, teethTris: Uint32Array, coords: Float32Array, bodyQuads: Uint32Array): number {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity;
  for (const v of teethTris) {
    x0 = Math.min(x0, teeth[v * 3]); x1 = Math.max(x1, teeth[v * 3]);
    y0 = Math.min(y0, teeth[v * 3 + 1]); y1 = Math.max(y1, teeth[v * 3 + 1]);
    z0 = Math.min(z0, teeth[v * 3 + 2]);
  }
  // Skin around the mouth (any corner near it), in front of the back teeth.
  const near = (v: number) => coords[v * 3] > x0 - 0.3 && coords[v * 3] < x1 + 0.3 && coords[v * 3 + 1] > y0 - 0.3 && coords[v * 3 + 1] < y1 + 0.3 && coords[v * 3 + 2] > z0 - 0.2;
  const skin: number[] = [];
  for (let f = 0; f < bodyQuads.length / 4; f++) {
    const q = bodyQuads.subarray(f * 4, f * 4 + 4);
    if ([0, 1, 2, 3].some((k) => near(q[k]))) skin.push(q[0], q[1], q[2], q[0], q[2], q[3]);
  }
  const xs: number[] = [];
  // 1 mm apart across the mouth, 0.2 mm apart up and down: lip gaps are long and very thin.
  for (let x = x0; x <= x1; x += 0.01) xs.push(x);
  const T = byColumn(teethTris, teeth, xs), S = byColumn(Uint32Array.from(skin), coords, xs);
  let n = 0;
  xs.forEach((x, i) => {
    for (let y = y0; y <= y1; y += 0.002) {
      const t = frontHit(x, y, T[i], teeth);
      if (t > -Infinity && t > frontHit(x, y, S[i], coords, true) + 0.001) n++;
    }
  });
  return n;
}

/**
 * Close parted lips at rest so the teeth don't show with a neutral face. Some faces rest with the
 * lips slightly apart; the upper lip is lowered (`upperUpOf`: the mouthUpperUp shape's offsets,
 * applied negatively) by the least amount that hides the teeth from the front. Mutates `coords`
 * and returns the amount used (0 when the lips already meet). `teethAt` fits the teeth to a face.
 */
export function sealLips(
  coords: Float32Array, upperUpOf: () => Float32Array, teethAt: (coords: Float32Array) => Float32Array,
  teethTris: Uint32Array, bodyQuads: Uint32Array,
): number {
  let upperUp: Float32Array = new Float32Array(0);
  const at = (w: number) => (w ? coords.map((v, i) => v - upperUp[i] * w) : coords);
  const shows = (w: number) => { const c = at(w); return teethShowing(teethAt(c), teethTris, c, bodyQuads) > 0; };
  if (!shows(0)) return 0;
  upperUp = upperUpOf();
  let lo = 0, hi = 0.4;
  if (!shows(hi))
    for (let it = 0; it < 6; it++) {
      const m = (lo + hi) / 2;
      if (shows(m)) lo = m;
      else hi = m;
    }
  // A little more than the least that hides them, so they stay hidden from slightly above or aside.
  const w = Math.min(0.45, hi + 0.06);
  for (let i = 0; i < coords.length; i++) coords[i] -= upperUp[i] * w;
  return w;
}
