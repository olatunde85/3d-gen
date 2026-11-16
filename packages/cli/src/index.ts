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
import type { AnimationClip, Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import AraWorker from './library/worker?worker&inline';
import type { CharacterInput, Generated, GenerateOptions } from './library/generate';
import type { CharacterColors } from './library/colors';
import type { WorkerReply, WorkerRequest } from './library/worker';
import type { HumanParams } from '../../../src/core/params';
import DATA from '../../data/package.json';
// Built from the generator's own lists at build time (see vite.lib.config.ts).
import CATALOG from 'virtual:ara-catalog';

export type { CharacterColors, CharacterInput, GenerateOptions };
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
  /** Runs blinking. Call it every frame, after mixer.update(), with the seconds since the last frame. */
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
 * Face controls over the character's blend shapes. An expression sets the resting face; blinking and mouth shapes
 * play on top of it, so a smile keeps smiling while the character blinks and talks.
 */
function faceControls(root: Group, resting: string) {
  const meshes: Morphable[] = [];
  root.traverse((o) => { const m = o as Morphable;if (m.morphTargetDictionary && m.morphTargetInfluences) meshes.push(m); });
  const set = (name: string, value: number) => { for (const m of meshes) { const i = m.morphTargetDictionary![name];if (i !== undefined) m.morphTargetInfluences![i] = value; } };
  const base: Record<string, number> = {}, lids = ['eyeBlinkLeft', 'eyeBlinkRight'];
  let next = 1 + Math.random() * 3, phase = -1;
  const controls = {
    setFace(weights: Record<string, number>) {
      for (const [name, value] of Object.entries(weights)) {
        if (!FACE_SHAPES.includes(name)) throw Error(`Unknown face shape "${name}". See FACE_SHAPES.`);
        base[name] = value;set(name, value);
      }
    },
    setExpression(name: string, amount = 1) {
      const weights = CATALOG.expressions[name];
      if (!weights) throw Error(`Unknown expression "${name}". Use one of: ${EXPRESSIONS.join(', ')}.`);
      // Expressions own every shape except the mouth shapes, which belong to lip-sync.
      const face: Record<string, number> = {};
      for (const shape of FACE_SHAPES) if (!shape.startsWith('viseme_')) face[shape] = (weights[shape] ?? 0) * amount;
      controls.setFace(face);
    },
    setMouth(shape: string | null, weight = 1) {
      if (shape !== null && !MOUTH_SHAPES.includes(shape)) throw Error(`Unknown mouth shape "${shape}". Use one of: ${MOUTH_SHAPES.join(', ')}.`);
      const w = shape === null ? 0 : weight;
      for (const m of MOUTH_SHAPES) { base[m] = m === shape ? w : 0;set(m, base[m]); }
      // While a mouth shape shows, it moves the jaw, and smiles and frowns ease off, so an open expression and a
      // mouth shape don't add up to an over-stretched mouth. The expression's own values come back with null.
      for (const [shape, keep] of Object.entries(MOUTH_SHARE)) set(shape, (base[shape] ?? 0) * (1 - (1 - keep) * w));
    },
    update(delta: number, blinking: boolean) {
      if (!meshes.length) return;
      // Turned off mid-blink: open the eyes back to the expression's lids.
      if (!blinking) { if (phase >= 0) { for (const lid of lids) set(lid, base[lid] ?? 0);phase = -1; } return; }
      // A blink every 2-6 seconds, from whatever the expression holds: the lids close in 0.07 s, stay shut for 0.04 s
      // (so they close fully at any frame rate) and open in 0.1 s.
      if (phase < 0) { next -= delta;if (next <= 0) { phase = 0;next = 2 + Math.random() * 4; } return; }
      phase += delta;
      const closed = phase < 0.07 ? phase / 0.07 : phase < 0.11 ? 1 : phase < 0.21 ? 1 - (phase - 0.11) / 0.1 : 0;
      for (const lid of lids) set(lid, Math.max(base[lid] ?? 0, closed));
      if (phase >= 0.21) phase = -1;
    },
  };
  if (CATALOG.expressions[resting]) for (const [shape, value] of Object.entries(CATALOG.expressions[resting])) base[shape] = value;
  return controls;
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
  const byName = new Map(character.animations.map((a) => [a.name, a])), face = faceControls(character.scene, generated.params.expression);
  const hero: AraCharacter = {
    ...character, props, params: generated.params, colors: generated.colors, height: generated.height, glb: main.data,
    clip: (id) => byName.get(generated.clipNames[id] ?? id),
    setExpression: face.setExpression, setMouth: face.setMouth, setFace: face.setFace,
    blinking: true, update: (delta) => face.update(delta, hero.blinking),
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
