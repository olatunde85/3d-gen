/**
 * ara3d for the browser: generate realistic, rigged and animated characters as three.js objects.
 *
 *   import { createCharacter } from 'ara3d';
 *   const hero = await createCharacter('The Soldier', { animations: ['walk', 'run', 'idle'] });
 *   scene.add(hero.scene);
 *   const mixer = new THREE.AnimationMixer(hero.scene);
 *   mixer.clipAction(hero.clip('walk')!).play();
 *
 * Characters are built in a background worker, so the page stays responsive, and exported with the same exporter as
 * the Ara builder and the ara3d CLI. The character data loads from a free CDN by default.
 */
import { LoopRepeat, NumberKeyframeTrack, type AnimationAction, type AnimationClip, type AnimationMixer, type Group, type Object3D, type Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import AraWorker from './library/worker?worker&inline';
import type { CharacterInput, Generated, GenerateOptions } from './library/generate';
import type { CharacterColors } from './library/colors';
import { parseSteps, type SequenceStep } from './library/sequence';
import { lipSync, locomotion, lookControls, type LipSync, type LipSyncSource, type Locomotion, type LocomotionOptions, type LookOptions } from './library/motion';
import type { WorkerReply, WorkerRequest } from './library/worker';
import type { HumanParams } from '../../../src/core/params';
import DATA from './data-pin.json';
// Built from the generator's own lists at build time (see vite.lib.config.ts).
import CATALOG from 'virtual:ara-catalog';

export type { CharacterColors, CharacterInput, GenerateOptions, SequenceStep, LipSync, LipSyncSource, Locomotion, LocomotionOptions, LookOptions };

/** Options for playSequence(). */
export interface SequenceOptions {
  /** Seconds each clip blends into the next (default 0.35). */
  fade?: number;
  /** Start again after the last clip (default true). Without it, the last clip keeps playing, or holds its last pose. */
  repeat?: boolean;
}
/** A sequence that is playing: stop() ends it, leaving the mixer to you. */
export interface Sequence { stop(): void }
export type CharacterParams = Partial<HumanParams>;

/** The character data this version uses, served by jsDelivr from the ara3d-data npm package. */
export const DEFAULT_ASSETS_URL = `https://cdn.jsdelivr.net/npm/ara3d-data@${DATA.version}/assets/`;

/** The preset character names. */
export const PRESET_NAMES: readonly string[] = CATALOG.presets;
/** Every animation clip: its ID, its name in exported files, its group, and whether it loops. */
export const ANIMATIONS: readonly { id: string; name: string; group: string; category: string; loop: boolean }[] = CATALOG.animations;
/** Props for the weapon, carry and vehicle options. */
export const PROPS: { weapons: readonly string[]; carried: readonly string[]; vehicles: readonly string[] } = CATALOG.props;
/** The clip that shows each vehicle in use, such as { motorcycle: 'ride_motorcycle' }. */
export const VEHICLE_CLIPS: Readonly<Record<string, string>> = CATALOG.rides;
/** Facial expressions for setExpression(). */
export const EXPRESSIONS: readonly string[] = Object.keys(CATALOG.expressions);
/** Mouth shapes for lip-sync (the Oculus viseme names that lip-sync tools use), for setMouth(). */
export const MOUTH_SHAPES: readonly string[] = CATALOG.faceShapes.filter((n) => n.startsWith('viseme_'));
/** Every face shape a character carries: ARKit-style names (eyeBlinkLeft, jawOpen, mouthSmile...) and the mouth shapes. */
export const FACE_SHAPES: readonly string[] = CATALOG.faceShapes;

export interface CharacterOptions extends GenerateOptions {
  /** Where the character data is served from; defaults to DEFAULT_ASSETS_URL. Copy node_modules/ara3d-data/assets to self-host. */
  assetsUrl?: string;
  /** Called while the character is built and exported, with a label and a fraction from 0 to 1. */
  onProgress?: (label: string, fraction: number) => void;
}

export interface AraCharacter {
  /** The character, ready to add to a scene. */
  scene: Group;
  /** The animation clips, for THREE.AnimationMixer. */
  animations: AnimationClip[];
  /** The clip for an Ara clip ID, such as "walk". */
  clip(id: string): AnimationClip | undefined;
  /** Props exported beside the character, such as a vehicle, each placed at the character's origin. */
  props: { name: string; scene: Group; animations: AnimationClip[] }[];
  /** The character's settings, after presets and options were applied: save them to rebuild it. */
  params: HumanParams;
  /** The colour of each part that can be recoloured with the colors option, such as { top: '#4a5a3a', shoes: '#141414' }. */
  colors: CharacterColors;
  /** Standing height in metres. */
  height: number;
  /** The character as a GLB file, for downloading or uploading. */
  glb: Uint8Array;
  /** Changes the facial expression (see EXPRESSIONS), blended by `amount` from 0 to 1. */
  setExpression(name: string, amount?: number): void;
  /** Shows one mouth shape for lip-sync (see MOUTH_SHAPES), or none with null. */
  setMouth(shape: string | null, weight?: number): void;
  /** Sets face shapes directly by name (see FACE_SHAPES), such as { jawOpen: 0.4, mouthSmile: 1 }. */
  setFace(weights: Record<string, number>): void;
  /** Natural blinking, on by default; call update() every frame for it to run. */
  blinking: boolean;
  /**
   * Plays clips one after another on `mixer`, blending each into the next, such as "run 2s, vault_over, ledge_climb_up". A step
   * that loops (walk, idle) plays one cycle unless given a length; others (vault_over, jump) play once, or a number of times.
   * It moves on as you call mixer.update(), and takes over the mixer's other actions.
   */
  playSequence(mixer: AnimationMixer, steps: string | readonly SequenceStep[], options?: SequenceOptions): Sequence;
  /**
   * Blends idle, walk and run on `mixer` by speed. Set the returned `speed` (metres per second) from your own movement
   * every frame, and the steps keep pace with the ground. Load the clips first: animations: ['idle', 'walk', 'run'].
   */
  locomotion(mixer: AnimationMixer, options?: LocomotionOptions): Locomotion;
  /** Turns the head and neck towards a point or an object (followed as it moves), within natural limits; null looks ahead. */
  lookAt(target: Vector3 | Object3D | null, options?: LookOptions): void;
  /** Moves the mouth with the sound of an <audio> or <video> element, a MediaStream (a microphone) or a Web Audio node. */
  lipSync(source: LipSyncSource): LipSync;
  /** Runs blinking, looking and lip-sync. Call it every frame, after mixer.update(), with the seconds since the last frame. */
  update(delta: number): void;
  /** Frees the GPU memory held by the character and its props. */
  dispose(): void;
}

let worker: Worker | undefined, next = 1;
const pending = new Map<number, { resolve: (g: Generated) => void; reject: (e: Error) => void; progress?: CharacterOptions['onProgress'] }>();

function generator() {
  if (worker) return worker;
  worker = new AraWorker();
  worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
    const job = pending.get(data.id);
    if (!job) return;
    if (data.type === 'progress') { job.progress?.(data.label, data.fraction);return; }
    pending.delete(data.id);
    if (data.type === 'done') job.resolve(data.result);else job.reject(Error(data.message));
  };
  // A worker that can't start (for example, blocked by a strict Content-Security-Policy) fails every waiting call.
  worker.onerror = (event) => {
    const error = Error(`The ara3d worker failed${event.message ? `: ${event.message}` : ''}. If the page has a Content-Security-Policy, allow worker-src blob:.`);
    for (const job of pending.values()) job.reject(error);
    pending.clear();worker?.terminate();worker = undefined;
  };
  return worker;
}

function run(input: CharacterInput, options: CharacterOptions = {}): Promise<Generated> {
  // Browsers don't start workers on pages opened straight from disk.
  if (globalThis.location?.protocol === 'file:') return Promise.reject(Error('This page was opened as a file, and browsers block ara3d there. Open it from a web server instead, such as: npx serve'));
  const { assetsUrl = DEFAULT_ASSETS_URL, onProgress, ...rest } = options;
  // Resolve relative URLs against the page, since the worker runs from a blob: address.
  const absolute = new URL(assetsUrl, globalThis.location?.href).href;
  return new Promise((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve, reject, progress: onProgress });
    const request: WorkerRequest = { id, assetsUrl: absolute, input, options: rest };
    generator().postMessage(request);
  });
}

/** How much of the expression's jaw and lip shapes stay while a mouth shape shows fully. */
const MOUTH_SHARE: Record<string, number> = { jawOpen: 0, mouthStretch: 0, mouthPucker: 0, mouthPress: 0.3, mouthSmile: 0.6, mouthFrown: 0.6 };

type Morphable = { morphTargetDictionary?: Record<string, number>; morphTargetInfluences?: number[] };

/**
 * Face controls over the character's blend shapes. An expression sets the resting face; the playing clip's own face
 * movements (a wince, gritted teeth), blinking and mouth shapes play on top of it, so a smile keeps smiling while the
 * character blinks, talks and moves.
 *
 * The clips move the face through `root.araFace` (one value per face shape, written by the mixer, see clipFaces) rather
 * than the blend shapes themselves, so a clip never replaces the expression; each update() adds them together.
 */
function faceControls(root: Group & { araFace?: number[] }, resting: string) {
  const meshes: Morphable[] = [];
  root.traverse((o) => { const m = o as Morphable;if (m.morphTargetDictionary && m.morphTargetInfluences) meshes.push(m); });
  root.araFace = FACE_SHAPES.map(() => 0);
  const base: Record<string, number> = {}, lids = new Set(['eyeBlinkLeft', 'eyeBlinkRight']);
  let mouth: string | null = null, mouthWeight = 0, closed = 0, next = 1 + Math.random() * 3, phase = -1;
  /** One shape's weight: expression (eased while a mouth shape shows) + the clip's movement + mouth shape, then a blink. */
  const weight = (name: string, i: number) => {
    const share = MOUTH_SHARE[name], expression = (base[name] ?? 0) * (share === undefined ? 1 : 1 - (1 - share) * mouthWeight);
    let w = Math.min(1, Math.max(0, name.startsWith('viseme_') ? (name === mouth ? mouthWeight : 0) : expression + (root.araFace![i] ?? 0)));
    if (closed) { if (lids.has(name)) w = Math.max(w, closed);else if (/^eye(Wide|Squint)/.test(name)) w *= 1 - closed; }
    return w;
  };
  const apply = () => {
    const weights = new Map(FACE_SHAPES.map((name, i) => [name, weight(name, i)]));
    for (const m of meshes) for (const [name, i] of Object.entries(m.morphTargetDictionary!)) { const w = weights.get(name);if (w !== undefined) m.morphTargetInfluences![i] = w; }
  };
  const controls = {
    setFace(weights: Record<string, number>) {
      for (const name of Object.keys(weights)) if (!FACE_SHAPES.includes(name)) throw Error(`Unknown face shape "${name}". See FACE_SHAPES.`);
      for (const [name, value] of Object.entries(weights)) {
        if (name.startsWith('viseme_')) { if (value) { mouth = name;mouthWeight = value; } else if (mouth === name) mouth = null; }
        else base[name] = value;
      }
      apply();
    },
    setExpression(name: string, amount = 1) {
      const weights = CATALOG.expressions[name];
      if (!weights) throw Error(`Unknown expression "${name}". Use one of: ${EXPRESSIONS.join(', ')}.`);
      // Expressions own every shape except the mouth shapes, which belong to lip-sync.
      for (const shape of FACE_SHAPES) if (!shape.startsWith('viseme_')) base[shape] = (weights[shape] ?? 0) * amount;
      apply();
    },
    setMouth(shape: string | null, weight = 1) {
      if (shape !== null && !MOUTH_SHAPES.includes(shape)) throw Error(`Unknown mouth shape "${shape}". Use one of: ${MOUTH_SHAPES.join(', ')}.`);
      // While a mouth shape shows, it moves the jaw, and smiles and frowns ease off (MOUTH_SHARE), so an open
      // expression and a mouth shape don't add up to an over-stretched mouth. null brings the expression back.
      mouth = shape;mouthWeight = shape === null ? 0 : weight;
      apply();
    },
    update(delta: number, blinking: boolean) {
      if (!meshes.length) return;
      // A blink every 2-6 seconds: the lids close in 0.07 s, stay shut for 0.04 s (so they close fully at any frame
      // rate) and open in 0.1 s. Turned off mid-blink, the eyes open straight away.
      closed = 0;
      if (!blinking) phase = -1;
      else if (phase < 0) { next -= delta;if (next <= 0) { phase = 0;next = 2 + Math.random() * 4; } }
      if (phase >= 0) {
        phase += delta;
        closed = phase < 0.07 ? phase / 0.07 : phase < 0.11 ? 1 : phase < 0.21 ? 1 - (phase - 0.11) / 0.1 : 0;
        if (phase >= 0.21) phase = -1;
      }
      apply();
    },
  };
  if (CATALOG.expressions[resting]) for (const [shape, value] of Object.entries(CATALOG.expressions[resting])) if (!shape.startsWith('viseme_')) base[shape] = value as number;
  return controls;
}

/**
 * Hands the clips' face movements to the face controls. The GLB's face tracks set every blend shape (the built
 * expression, the clip's movements and baked blinks), which would replace an expression set later, so they come off;
 * clips that move the face get tracks on root.araFace instead, holding just the movement.
 */
function clipFaces(clips: AnimationClip[], faces: Generated['faces'], clipNames: Record<string, string>) {
  const byName = new Map(clips.map((c) => [c.name, c]));
  for (const clip of clips) clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.morphTargetInfluences'));
  for (const [id, { times, shapes }] of Object.entries(faces)) {
    const clip = byName.get(clipNames[id] ?? id);
    if (!clip) continue;
    for (const [shape, values] of Object.entries(shapes)) {
      const i = FACE_SHAPES.indexOf(shape);
      if (i >= 0) clip.tracks.push(new NumberKeyframeTrack(`.araFace[${i}]`, times, values));
    }
  }
}

const LOOPS = new Map(CATALOG.animations.map((a) => [a.id, a.loop]));

function sequence(clipFor: (id: string) => AnimationClip | undefined, mixer: AnimationMixer, steps: string | readonly SequenceStep[], { fade = 0.35, repeat = true }: SequenceOptions = {}): Sequence {
  const plan = parseSteps(steps).map((step) => {
    const clip = clipFor(step.id);
    if (!clip) throw Error(`The animation "${step.id}" isn't loaded. Add it to the animations option (see ANIMATIONS for the IDs).`);
    const loops = LOOPS.get(step.id) ?? true;
    // A looping clip plays one cycle by default; a one-off move plays once, or as many times as asked.
    const length = step.seconds ?? clip.duration * (step.times ?? 1);
    return { action: mixer.clipAction(clip), loops, times: step.times ?? 1, length: Math.max(length, fade * 2) };
  });
  if (!plan.length) throw Error('Give playSequence() at least one animation, such as "walk, look_around".');
  const update = mixer.update;
  let index = -1, started = 0, done = false, stopped = false;
  const start = (i: number) => {
    const before: AnimationAction | undefined = plan[index]?.action, step = plan[i];
    index = i;started = mixer.time;
    step.action.reset();step.action.clampWhenFinished = true;
    step.action.setLoop(LoopRepeat, step.loops ? Infinity : step.times);
    step.action.play();
    if (before && before !== step.action) before.crossFadeTo(step.action, fade, false);
  };
  mixer.stopAllAction();start(0);
  // Each mixer.update() moves time on; when a step's time is nearly up, the next one starts blending in.
  mixer.update = (delta: number) => {
    update.call(mixer, delta);
    if (!stopped && !done && mixer.time - started >= plan[index].length - fade) {
      if (index + 1 < plan.length) start(index + 1);
      else if (repeat) start(0);
      else done = true;
    }
    return mixer;
  };
  return { stop() { stopped = true;mixer.update = update; } };
}

/** Builds a character and returns its GLB file, without needing three.js. */
export async function createCharacterGLB(input: CharacterInput, options?: CharacterOptions): Promise<Uint8Array> {
  return (await run(input, options)).files[0].data;
}

/**
 * Builds a character as three.js objects. `input` is a preset name ("The Soldier"), an "ara-character" object
 * ({ preset, params }), or character settings such as a params.json from an export.
 */
export async function createCharacter(input: CharacterInput, options?: CharacterOptions): Promise<AraCharacter> {
  const generated = await run(input, options), loader = new GLTFLoader();
  const load = async (data: Uint8Array) => {
    const gltf = await loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, '');
    return { scene: gltf.scene, animations: gltf.animations };
  };
  const [main, ...rest] = generated.files, character = await load(main.data);
  const props = await Promise.all(rest.map(async (f) => ({ name: f.name.replace(/\.glb$/, ''), ...(await load(f.data)) })));
  clipFaces(character.animations, generated.faces, generated.clipNames);
  const byName = new Map(character.animations.map((a) => [a.name, a])), face = faceControls(character.scene, generated.params.expression);
  const look = lookControls(character.scene);
  let speech: ReturnType<typeof lipSync> | undefined;
  const hero: AraCharacter = {
    ...character, props, params: generated.params, colors: generated.colors, height: generated.height, glb: main.data,
    clip: (id) => byName.get(generated.clipNames[id] ?? id),
    setExpression: face.setExpression, setMouth: face.setMouth, setFace: face.setFace,
    blinking: true,
    update(delta) { face.update(delta, hero.blinking);look.update(delta);speech?.update(delta); },
    playSequence: (mixer, steps, options) => sequence(hero.clip, mixer, steps, options),
    locomotion: (mixer, options) => locomotion(hero.clip, mixer, generated.height, options),
    lookAt: look.lookAt,
    lipSync(source) {
      speech?.stop();
      const next = lipSync(source, face.setMouth);speech = next;
      return { stop() { next.stop();if (speech === next) speech = undefined; } };
    },
    dispose() {
      for (const root of [character.scene, ...props.map((p) => p.scene)]) root.traverse((object) => {
        const mesh = object as { geometry?: { dispose(): void }; material?: unknown };
        mesh.geometry?.dispose();
        for (const material of [mesh.material].flat() as ({ dispose(): void; [key: string]: unknown } | undefined)[]) {
          if (!material) continue;
          for (const value of Object.values(material)) (value as { isTexture?: boolean; dispose?: () => void })?.isTexture && (value as { dispose(): void }).dispose();
          material.dispose();
        }
      });
    },
  };
  return hero;
}
