/**
 * Prop files: props modelled outside Ara (in Blender, by script or by hand), one GLB each with its details in the
 * extras (`ara_prop`). A prop names the Ara vehicle it stands in for (its base), so it keeps that vehicle's riders,
 * animations and boarding, and it tags its parts: its seats, wheels, steering wheel and exhausts as nodes, its
 * lamps and paint as materials (`ara_role`). Apps read prop files and register them here; a vehicle style that
 * names a registered prop (VehicleStyle.model) is built from it (see vehicle-imported.ts). No DOM.
 */
import * as T from 'three';
import { imageBytes, modelCost, readGlb, withoutImages, type ModelCost } from '../glb';

export const PROP_BASES = ['car', 'sports_car', 'suv', 'pickup'] as const;
export type PropBase = typeof PROP_BASES[number];
/** `<author>/<prop>`, in lower case. */
export const PROP_ID = /^[a-z0-9][a-z0-9-]{0,39}\/[a-z0-9][a-z0-9-]{0,59}$/;
/** The largest prop file Ara takes, and the most a prop may ask of the graphics card. */
export const MAX_PROP_FILE = 32 * 1024 * 1024;
export const PROP_LIMITS = { triangles: 150_000, meshes: 200, megapixels: 64 };

export interface PropManifest {
  kind: 'ara-prop'; version: 1;
  id: string; name: string; author: string; license: string; release: string;
  /** What it is (vehicles, for now) and the Ara vehicle it stands in for. */
  type: 'vehicle'; base: PropBase;
  /** A still of the prop: an index into the GLB's images. */
  preview?: number;
}

/** A prop ready to place: its details, a model to copy for each use, and its tagged parts. */
export interface PropModel {
  manifest: PropManifest; cost: ModelCost;
  /** The model as loaded, in metres, facing +Z; each use takes a copy (see clonePropModel). */
  template: T.Object3D;
  /** The seated hips of the driver and passenger, in the model's frame. */
  seats: { driver: T.Vector3; passenger?: T.Vector3 };
}

const fail = (why: string): never => { throw Error(`That prop file can't be used: ${why}.`); };
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

function manifestOf(extras: Record<string, unknown> | undefined, images: number): PropManifest {
  const m = extras?.ara_prop as Partial<PropManifest> | undefined;
  if (!m || m.kind !== 'ara-prop') return fail('it has no prop details (is it a plain GLB?)');
  if (m.version !== 1) return fail('it was made for a newer Ara');
  if (typeof m.id !== 'string' || !PROP_ID.test(m.id)) return fail('its ID isn\'t author/prop in lower case');
  if (!text(m.name, 60) || !text(m.author, 60) || !text(m.license, 100)) return fail('it needs a name, an author and a licence');
  if (typeof m.release !== 'string' || !/^\d{1,4}(\.\d{1,4}){0,2}$/.test(m.release)) return fail('its release isn\'t a number such as 1.0');
  if (m.type !== 'vehicle' || !PROP_BASES.includes(m.base!)) return fail(`it isn't a vehicle standing in for one of Ara's cars (${PROP_BASES.join(', ')})`);
  if (m.preview !== undefined && !(Number.isInteger(m.preview) && m.preview >= 0 && m.preview < images)) return fail('its preview is missing');
  return m as PropManifest;
}

/** Reads a prop file's details, cost and preview, checking them, without building the model. */
export function readPropFile(bytes: ArrayBuffer): { manifest: PropManifest; cost: ModelCost; preview?: { bytes: Uint8Array<ArrayBuffer>; type: string } } {
  if (bytes.byteLength > MAX_PROP_FILE) fail(`it's over ${MAX_PROP_FILE / 1024 / 1024} MB`);
  const glb = readGlb(bytes);
  if (!glb) return fail('it isn\'t a GLB');
  const manifest = manifestOf(glb.json.extras, glb.json.images?.length ?? 0), cost = modelCost(glb);
  const say = { triangles: 'triangles', meshes: 'separate meshes', megapixels: 'megapixels of textures' } as const;
  const over = (['triangles', 'meshes', 'megapixels'] as const).filter((k) => cost[k] > PROP_LIMITS[k]);
  if (over.length) fail(`it's too heavy to play smoothly, with ${over.map((k) => `${cost[k].toLocaleString('en')} ${say[k]} (up to ${PROP_LIMITS[k].toLocaleString('en')})`).join(' and ')}`);
  const preview = manifest.preview === undefined ? undefined : imageBytes(glb, manifest.preview);
  return { manifest, cost, ...(preview ? { preview } : {}) };
}

/** Builds a prop from its file. `textures: false` reads its geometry alone (outside a browser). */
export async function loadPropModel(bytes: ArrayBuffer, options: { textures?: boolean } = {}): Promise<PropModel> {
  const { manifest, cost } = readPropFile(bytes);
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().parseAsync(options.textures === false ? withoutImages(bytes) : bytes, '');
  const template = gltf.scene;
  template.updateMatrixWorld(true);
  // Vehicles batch their static parts by material: every mesh keeps the same data (position, normal, uv).
  template.traverse((o) => {
    const g = (o as T.Mesh).geometry;
    if (!g) return;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
  });
  const role = (name: string) => { let found: T.Object3D | undefined;template.traverse((o) => { if (!found && o.userData.ara_role === name) found = o; });return found; };
  const at = (o?: T.Object3D) => o && o.getWorldPosition(new T.Vector3());
  const driver = at(role('seat_driver'));
  if (!driver) fail('it has no driver\'s seat (an empty with ara_role "seat_driver")');
  let wheels = 0;
  template.traverse((o) => { if (o.userData.ara_role === 'wheel') wheels++; });
  if (wheels < 3) fail('its wheels aren\'t tagged (objects with ara_role "wheel")');
  const passenger = at(role('seat_passenger'));
  return { manifest, cost, template, seats: { driver: driver!, ...(passenger ? { passenger } : {}) } };
}

// The props loaded in this page or process.
const models = new Map<string, PropModel>(), listeners = new Set<() => void>();
export const propModel = (id: string | undefined) => (id ? models.get(id) : undefined);
export const propModels = () => [...models.values()];
/** Props standing in for this vehicle. */
export const propModelsFor = (base: string) => propModels().filter((m) => m.manifest.base === base);
export function registerPropModel(model: PropModel) { models.set(model.manifest.id, model);for (const fn of listeners) fn(); }
export function unregisterPropModel(id: string) { if (models.delete(id)) for (const fn of listeners) fn(); }
/** Calls `fn` when props are added or removed; returns a function that stops. */
export function onPropModelsChange(fn: () => void) { listeners.add(fn);return () => listeners.delete(fn); }

/**
 * How high a rider sits in this prop compared with Ara's car of the same base: Ara's car riders sit with their
 * hips 0.563 rig heights (scale) above the floor before lift.
 */
export const SEATED_HIP = 0.563;
