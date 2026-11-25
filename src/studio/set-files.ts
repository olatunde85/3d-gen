/**
 * Set files: sets modelled, textured and lit in Blender (see studio-sets/), their lighting baked into lightmaps, packed
 * into one GLB. The GLB's extras hold the set's details (`ara_set`: name, category, room, seats, the light on the
 * cast) and point at its lightmaps and preview, which are images inside the file. Studio imports set files (see
 * set-store.ts), draws a set in its baked light and lights the cast to match (see StudioScene).
 */
import * as THREE from 'three';
import { imageBytes, modelCost, readGlb, withoutImages, type Glb, type ModelCost } from '../core/glb';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SET_ID, type Mood, type SceneCategory, type SceneFamily, type SetId } from './catalog';
import type { Seat, StudioSet } from './sets';

/** The layer baked sets are drawn on: their own pass, without the cast's lights. */
export const BAKED_LAYER = 1;
/** The largest set file Studio takes. */
export const MAX_SET_FILE = 64 * 1024 * 1024;
/** The most a set may ask of the graphics card (textures of 200 megapixels take about 1 GB of its memory). */
export const SET_LIMITS = { triangles: 300_000, meshes: 400, megapixels: 200 };

export interface SetManifest {
  kind: 'ara-studio-set'; version: 1;
  /** `<author>/<set>`, in lower case: the ID films use. */
  id: SetId; name: string; category: SceneCategory; family: SceneFamily; mood: Mood; subtitle: string;
  /** Who made it, under what licence, and which release of it this is (such as 1.2). */
  author: string; license: string; release: string;
  /** Where things are, in words, for Assist. */
  staging?: string;
  /** Lightmaps by name (meshes name theirs in ara_lightmap): the image in the file, and the scale its values were divided by. */
  lightmaps: Record<string, { image: number; scale: number }>;
  /** A still of the set, an image in the file. */
  preview?: number;
  /** The room's floor, [minX, minZ, maxX, maxZ] in metres, for staging. */
  room: [number, number, number, number];
  /** Seats: x, y (seat height), z in metres; yaw in degrees (0 faces +Z). */
  seats: { x: number; y: number; z: number; yaw: number }[];
  /** Light on the cast, matched to the bake: the sun's direction of travel, and a fill. */
  light: { sun: { direction: [number, number, number]; color: string; intensity: number }; fill: { color: string; intensity: number }; exposure: number; background: string };
}

/** What a baked set adds to a StudioSet: its manifest, for lighting the cast. */
export interface Baked { manifest: SetManifest }

export const CATEGORIES: readonly SceneCategory[] = ['Studios', 'Workplaces', 'Homes', 'Leisure', 'City', 'Outdoors', 'Travel'];
export const FAMILIES: readonly SceneFamily[] = ['studio', 'office', 'bedroom', 'lounge', 'kitchen', 'beach', 'pool', 'garden', 'street', 'transit', 'warehouse', 'restaurant', 'landscape', 'yacht', 'civic', 'bathroom', 'venue', 'road'];
export const MOODS: readonly Mood[] = ['day', 'sunset', 'night'];

type Parsed = Glb;
function chunks(bytes: ArrayBuffer): Parsed {
  const glb = readGlb(bytes);
  if (!glb) throw Error('That isn\'t a set file: make one in Blender with the Export for Ara Studio add-on.');
  return glb;
}
function imageBlob(glb: Parsed, index: number): Blob {
  const image = imageBytes(glb, index);
  if (!image) return fail('an image isn\'t inside the file');
  return new Blob([image.bytes], { type: image.type });
}
const fail = (why: string): never => { throw Error(`That set file can't be used: ${why}.`); };
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const colour = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** The set's details, checked: what Studio needs to list, stage and light it. */
function manifestOf({ json }: Parsed): SetManifest {
  const m = json.extras?.ara_set as Partial<SetManifest> | undefined;
  if (!m || m.kind !== 'ara-studio-set') return fail('it has no set details (is it a plain GLB?)');
  if (m.version !== 1) return fail('it was made for a newer Studio');
  if (typeof m.id !== 'string' || !SET_ID.test(m.id)) return fail('its ID isn\'t author/set in lower case');
  if (!text(m.name, 60) || !text(m.subtitle, 200)) return fail('it needs a name and a line about it');
  if (!text(m.author, 60) || !text(m.license, 100)) return fail('it needs its author and licence');
  if (typeof m.release !== 'string' || !/^\d{1,4}(\.\d{1,4}){0,2}$/.test(m.release)) return fail('its release isn\'t a number such as 1.0');
  if (!CATEGORIES.includes(m.category!) || !FAMILIES.includes(m.family!) || !MOODS.includes(m.mood!)) return fail('its category, family or mood isn\'t one Studio knows');
  if (m.staging !== undefined && !text(m.staging, 2000)) return fail('its staging note is too long');
  const images = json.images ?? [], image = (i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < images.length;
  if (!m.lightmaps || typeof m.lightmaps !== 'object' || !Object.values(m.lightmaps).every((l) => l && image(l.image) && number(l.scale) && l.scale > 0)) return fail('its lightmaps are missing');
  if (m.preview !== undefined && !image(m.preview)) return fail('its preview is missing');
  if (!Array.isArray(m.room) || m.room.length !== 4 || !m.room.every(number) || m.room[0] >= m.room[2] || m.room[1] >= m.room[3]) return fail('its room isn\'t [minX, minZ, maxX, maxZ]');
  if (!Array.isArray(m.seats) || m.seats.length > 64 || !m.seats.every((s) => s && number(s.x) && number(s.y) && number(s.z) && number(s.yaw))) return fail('its seats aren\'t right');
  const l = m.light;
  if (!l || !l.sun || !Array.isArray(l.sun.direction) || l.sun.direction.length !== 3 || !l.sun.direction.every(number) || !colour(l.sun.color) || !number(l.sun.intensity)
    || !l.fill || !colour(l.fill.color) || !number(l.fill.intensity) || !number(l.exposure) || !colour(l.background)) return fail('its light isn\'t right');
  return m as SetManifest;
}

/** What a set asks of the graphics card: triangles, separate meshes (one per material on each object) and texture pixels. */
export type SetCost = ModelCost;
const costOf = (glb: Parsed, manifest: SetManifest): SetCost => modelCost(glb, Object.values(manifest.lightmaps).map((l) => l.image));
const SAY = { triangles: (n: number) => `${n.toLocaleString('en')} triangles`, meshes: (n: number) => `${n} separate meshes`, megapixels: (n: number) => `${n} megapixels of textures` };

/**
 * Reads a set file's details, preview and cost, checking them, without building the set. Refuses a set over
 * SET_LIMITS.
 */
export function readSetFile(bytes: ArrayBuffer): { manifest: SetManifest; preview?: Blob; cost: SetCost } {
  if (bytes.byteLength > MAX_SET_FILE) fail(`it's over ${MAX_SET_FILE / 1024 / 1024} MB`);
  const parsed = chunks(bytes), manifest = manifestOf(parsed), cost = costOf(parsed, manifest);
  const over = (['triangles', 'meshes', 'megapixels'] as const).filter((k) => cost[k] > SET_LIMITS[k]);
  if (over.length) fail(`it's too heavy to play smoothly, with ${over.map((k) => `${SAY[k](cost[k])} (up to ${SAY[k](SET_LIMITS[k])})`).join(' and ')}`);
  return { manifest, cost, ...(manifest.preview !== undefined ? { preview: imageBlob(parsed, manifest.preview) } : {}) };
}

/**
 * Builds a set from its file: the model in its baked light, ready to draw. `textures: false` builds its geometry
 * alone, without images (to measure its staging map outside a browser).
 */
export async function buildSet(bytes: ArrayBuffer, options: { textures?: boolean } = {}): Promise<StudioSet> {
  const textures = options.textures !== false, parsed = chunks(bytes), { manifest } = readSetFile(bytes);
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf: GLTF = await new GLTFLoader().parseAsync(textures ? bytes : withoutImages(bytes), '');
  const lightmaps = new Map<string, THREE.Texture>();
  if (textures) await Promise.all(Object.entries(manifest.lightmaps).map(async ([name, { image }]) => {
    const bitmap = await createImageBitmap(imageBlob(parsed, image), { imageOrientation: 'none' });
    const texture = new THREE.Texture(bitmap as unknown as HTMLImageElement);
    // The lightmap follows the model's second texture coordinates, which glTF stores flipped, as its own textures.
    texture.flipY = false;texture.colorSpace = THREE.SRGBColorSpace;texture.channel = 1;texture.needsUpdate = true;
    lightmaps.set(name, texture);
  }));
  const group = new THREE.Group();
  group.name = manifest.id;
  const lights: THREE.Object3D[] = [];
  gltf.scene.traverse((o) => {
    if ((o as THREE.Light).isLight) { lights.push(o);return; }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.layers.set(BAKED_LAYER);
    const name = mesh.userData.ara_lightmap ?? mesh.parent?.userData.ara_lightmap, map = name && lightmaps.get(name);
    for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
      // Light comes from the bake (three adds a lightmap as irradiance, which it divides by pi), with a sheen from the
      // scene's environment that the surface's normal and roughness maps shape (three uses the scene's
      // environmentIntensity for it, not envMapIntensity; see StudioScene).
      if (map) { m.lightMap = map;m.lightMapIntensity = manifest.lightmaps[name].scale * Math.PI; }
      if (mesh.userData.ara_glass || mesh.parent?.userData.ara_glass) { m.transparent = true;m.depthWrite = false; }
    }
  });
  for (const light of lights) light.removeFromParent();
  group.add(gltf.scene);
  // Staging's room: the floor inside the walls (inset a little, so the walls bound the room rather than block it).
  const [x0, z0, x1, z1] = manifest.room;
  group.userData.roomBounds = { minX: x0 + 0.05, minZ: z0 + 0.05, maxX: x1 - 0.05, maxZ: z1 - 0.05 };
  const seats: Seat[] = manifest.seats.map((s) => ({ x: s.x, y: s.y, z: s.z, yaw: (s.yaw * Math.PI) / 180 }));
  const { light } = manifest;
  return { group, seats, background: light.background, floor: '#000000', key: light.sun.color, fill: light.fill.color, exposure: light.exposure, baked: { manifest } };
}
