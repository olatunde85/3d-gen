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
import type { WorkerReply, WorkerRequest } from './library/worker';
import type { HumanParams } from '../../../src/core/params';
import DATA from '../../data/package.json';
// Built from the generator's own lists at build time (see vite.lib.config.ts).
import CATALOG from 'virtual:ara-catalog';

export type { CharacterInput, GenerateOptions };
export type CharacterParams = Partial<HumanParams>;

/** The character data this version uses, served by jsDelivr from the ara3d-data npm package. */
export const DEFAULT_ASSETS_URL = `https://cdn.jsdelivr.net/npm/ara3d-data@${DATA.version}/assets/`;

/** The preset character names. */
export const PRESET_NAMES: readonly string[] = CATALOG.presets;
/** Every animation clip: its ID, its name in exported files, its group, and whether it loops. */
export const ANIMATIONS: readonly { id: string; name: string; group: string; category: string; loop: boolean }[] = CATALOG.animations;
/** Props for the weapon, carry and vehicle options. */
export const PROPS: { weapons: readonly string[]; carried: readonly string[]; vehicles: readonly string[] } = CATALOG.props;

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
  /** Standing height in metres. */
  height: number;
  /** The character as a GLB file, for downloading or uploading. */
  glb: Uint8Array;
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
  const byName = new Map(character.animations.map((a) => [a.name, a]));
  return {
    ...character, props, params: generated.params, height: generated.height, glb: main.data,
    clip: (id) => byName.get(generated.clipNames[id] ?? id),
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
}
