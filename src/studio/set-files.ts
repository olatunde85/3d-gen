/**
 * Set files: sets modelled, textured and lit in Blender (see studio-sets/), their lighting baked into lightmaps, packed
 * into one GLB. The GLB's extras hold the set's details (`ara_set`: name, category, room, seats, the light on the
 * cast) and point at its lightmaps and preview, which are images inside the file. Studio imports set files (see
 * set-store.ts), draws a set in its baked light and lights the cast to match (see StudioScene).
 */
import * as THREE from 'three';
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

interface Gltf {
  images?: { bufferView?: number; mimeType?: string }[]; bufferViews?: { buffer: number; byteOffset?: number; byteLength: number }[];
  textures?: { source?: number; extensions?: Record<string, { source?: number }> }[];
  nodes?: { mesh?: number }[]; meshes?: { primitives?: { indices?: number; mode?: number; attributes?: Record<string, number> }[] }[]; accessors?: { count?: number }[];
  extras?: { ara_set?: unknown };
}
interface Parsed { json: Gltf; bin: Uint8Array }

function chunks(bytes: ArrayBuffer): Parsed {
  const view = new DataView(bytes);
  if (bytes.byteLength < 28 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(16, true) !== 0x4e4f534a) throw Error('That isn\'t a set file: make one in Blender with the Export for Ara Studio add-on.');
  const jsonLength = view.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength))) as Gltf;
  const at = 20 + jsonLength, bin = at + 8 <= bytes.byteLength ? new Uint8Array(bytes, at + 8, view.getUint32(at, true)) : new Uint8Array();
  return { json, bin };
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

function imageBlob({ json, bin }: Parsed, index: number): Blob {
  const image = json.images![index], view = image.bufferView === undefined ? undefined : json.bufferViews?.[image.bufferView];
  if (!view || view.buffer !== 0) return fail('an image isn\'t inside the file');
  const start = view.byteOffset ?? 0;
  if (start + view.byteLength > bin.byteLength) return fail('the file is cut short');
  return new Blob([bin.slice(start, start + view.byteLength)], { type: image.mimeType ?? 'image/jpeg' });
}

/** An image's width and height from its first bytes (PNG, JPEG or WebP); 0 × 0 for another format. */
function imageSize(b: Uint8Array): [number, number] {
  const be16 = (i: number) => (b[i] << 8) | b[i + 1], le16 = (i: number) => b[i] | (b[i + 1] << 8), le24 = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return [(be16(16) << 16) | be16(18), (be16(20) << 16) | be16(22)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++;continue; }
      const marker = b[i + 1];
      if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += marker === 0xff ? 1 : 2;continue; }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [be16(i + 7), be16(i + 5)];
      i += 2 + be16(i + 2);
    }
  }
  const tag = (i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  if (b.length > 30 && tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    if (tag(12) === 'VP8 ') return [le16(26) & 0x3fff, le16(28) & 0x3fff];
    if (tag(12) === 'VP8L') { const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]; }
    if (tag(12) === 'VP8X') return [le24(24) + 1, le24(27) + 1];
  }
  return [0, 0];
}

/** What a set asks of the graphics card: triangles, separate meshes (one per material on each object) and texture pixels. */
export interface SetCost { triangles: number; meshes: number; megapixels: number }
function costOf({ json, bin }: Parsed, manifest: SetManifest): SetCost {
  let triangles = 0, meshes = 0;
  for (const node of json.nodes ?? []) {
    for (const p of node.mesh === undefined ? [] : json.meshes?.[node.mesh]?.primitives ?? []) {
      meshes++;
      const count = json.accessors?.[p.indices ?? p.attributes?.POSITION ?? -1]?.count ?? 0;
      if (p.mode === undefined || p.mode === 4) triangles += count / 3;
    }
  }
  const images = new Set(Object.values(manifest.lightmaps).map((l) => l.image));
  for (const t of json.textures ?? []) for (const source of [t.source, ...Object.values(t.extensions ?? {}).map((e) => e?.source)]) if (Number.isInteger(source)) images.add(source!);
  let pixels = 0;
  for (const i of images) {
    const image = json.images?.[i], view = image?.bufferView === undefined ? undefined : json.bufferViews?.[image.bufferView];
    if (!view) continue;
    const [w, h] = imageSize(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + Math.min(view.byteLength, 65536)));
    pixels += w * h;
  }
  return { triangles: Math.round(triangles), meshes, megapixels: Math.round(pixels / 1e5) / 10 };
}

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

/** A GLB without its images (for geometry alone): textures and their references are dropped from its JSON. */
function withoutImages(glb: ArrayBuffer): ArrayBuffer {
  const view = new DataView(glb), jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)));
  delete json.images;delete json.textures;delete json.samplers;
  for (const key of ['extensionsUsed', 'extensionsRequired']) json[key] = (json[key] ?? []).filter((e: string) => !/^(EXT_texture_webp|KHR_texture_basisu|EXT_texture_avif)$/.test(e));
  const strip = (v: unknown): unknown => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !/Texture$/.test(k)).map(([k, x]) => [k, strip(x)])) : v;
  json.materials = strip(json.materials ?? []);
  const text = new TextEncoder().encode(JSON.stringify(json)), padded = Math.ceil(text.length / 4) * 4;
  const rest = new Uint8Array(glb, 20 + jsonLength), out = new Uint8Array(20 + padded + rest.length);
  const o = new DataView(out.buffer);
  o.setUint32(0, 0x46546c67, true);o.setUint32(4, 2, true);o.setUint32(8, out.length, true);o.setUint32(12, padded, true);o.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);out.fill(0x20, 20 + text.length, 20 + padded);out.set(rest, 20 + padded);
  return out.buffer;
}
