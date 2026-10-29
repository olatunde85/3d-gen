/**
 * "Looks": tattoos, procedural hairstyles, facial hair and earrings. Returns
 * mesh parts in morphed body space (decimetres); human.ts skins and places them.
 */
import type { AssetLibrary } from '../assets';
import { compact, type PolyMesh } from '../geometry';
import type { Material } from '../mesh';
import { ageToYears, type HumanParams } from '../params';
import { beardCards, boxBraids, buzzCards, cornrows, hairLayers, isProceduralHair, spikes, type HeadCtx } from './hair';
import { mouthShadeLayer } from './mouth';
import { earrings, metalMaterial } from './jewelry';
import { baseBody, paintOverlay, overlaySurface, type Layer } from './overlay';
import { tattooLayers } from './tattoos';
import { braidTexture, hairCardTexture, spikeTexture } from './textures';
import type { TexOut } from '../garments/textures';
import { merge } from '../garments/ring';

export { TATTOOS, TATTOO_LABELS, type TattooId } from './tattoos';
export { FACIAL_HAIR, FACIAL_HAIR_LABELS, HAIRSTYLES, isProceduralHair, type FacialHairId, type HairstyleId } from './hair';
export { EARRINGS, EARRING_LABELS, type EarringId, type Metal } from './jewelry';

export interface LooksInput {
  p: HumanParams;
  /** Morphed base mesh coordinates and vertex normals (decimetres). */
  coords: Float32Array;
  normals: Float32Array;
  /** The full (skinned) base mesh with morphed positions. */
  fullBody: PolyMesh;
  /** Base faces hidden under clothes (the overlay skips them). */
  hidden: Uint8Array;
  /** Base faces under headwear (no hair cards grow there). */
  underHat?: Uint8Array;
  /** Neck base height (dm): box braids stop above the shoulders. */
  neckY: number;
  low: boolean;
  onStage?: (stage: string) => void;
}

export interface Looks {
  /** Skin overlay (tattoos, stubble, shaved scalp): already skinned via the body. */
  overlay?: [PolyMesh, Material];
  /** Scalp hair geometry (skin to the head). */
  hair: [PolyMesh, Material][];
  /** Beard / mustache cards (skin to head + neck, so the jaw moves them). */
  beard: [PolyMesh, Material][];
  /** Earrings (skin to the head). */
  jewelry: [PolyMesh, Material][];
}

/** Which base faces carry paint, per overlay texture. */
const paintedFaces = new WeakMap<AssetLibrary, Map<string, Uint8Array>>();

/** Small LRU of generated geometry per library (a few head shapes x styles). */
const geometry = new WeakMap<AssetLibrary, Map<string, unknown>>();
function cached<T>(lib: AssetLibrary, key: string, make: () => T): T {
  let m = geometry.get(lib);
  if (!m) geometry.set(lib, (m = new Map()));
  if (m.has(key)) {
    const v = m.get(key) as T;
    m.delete(key); // refresh LRU position
    m.set(key, v);
    return v;
  }
  const v = make();
  m.set(key, v);
  if (m.size > 12) m.delete(m.keys().next().value!);
  return v;
}

/** Fingerprint of the morphed body (any slider that changes the shape changes it). */
function coordsHash(c: Float32Array): string {
  const u = new Uint32Array(c.buffer, c.byteOffset, c.length);
  let h = 2166136261;
  for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619);
  return (h >>> 0).toString(36) + c.length;
}

function hashKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Register a generated texture once; returns its file names. */
function tex(lib: AssetLibrary, id: string, make: () => TexOut): { map: string; normalMap?: string } {
  const map = `${id}.png`, normalMap = `${id}_n.png`;
  if (!lib.hasTexture(map)) {
    const t = make();
    lib.registerTexture(map, t.color);
    if (t.normal) lib.registerTexture(normalMap, t.normal);
  }
  return { map, normalMap: lib.hasTexture(normalMap) ? normalMap : undefined };
}

export async function buildLooks(lib: AssetLibrary, i: LooksInput): Promise<Looks> {
  const { p } = i;
  const out: Looks = { hair: [], beard: [], jewelry: [] };
  const base = baseBody(lib);
  const adult = ageToYears(p.age) >= 18;
  const tattoos = adult ? [...new Set(p.tattoos ?? [])].sort() : [];
  const facial = p.facialHair ?? 'none';
  const hairColor = p.hairColor ?? '#2a1e16';
  const beardColor = p.beardColor ?? '#241a13';
  const proc = isProceduralHair(p.hair) ? p.hair : '';

  // --- Skin overlay ---
  const layers: Layer[] = [mouthShadeLayer(base), ...hairLayers(proc, facial, hairColor, beardColor), ...tattooLayers(base, tattoos, p.tattooInk ?? '#1c2128')];
  if (layers.length) {
    const size = i.low ? 1024 : 2048;
    const key = `look_${hashKey(JSON.stringify([tattoos, p.tattooInk, proc, facial, hairColor, beardColor, size]))}`;
    const map = `${key}.png`;
    let cache = paintedFaces.get(lib);
    if (!cache) paintedFaces.set(lib, (cache = new Map()));
    let faces = cache.get(key);
    if (!faces || !lib.hasTexture(map)) {
      i.onStage?.(tattoos.length ? 'Painting tattoos' : 'Painting skin details');
      const painted = await paintOverlay(lib, layers, size);
      lib.registerTexture(map, painted.png);
      cache.set(key, (faces = painted.faces));
    }
    const sel = overlaySurface(faces, i.hidden);
    // Offset along the body normals: 0.4 mm (more on the low-poly proxy body).
    const d = i.low ? 0.02 : 0.004;
    const positions = new Float32Array(i.coords.length);
    for (let k = 0; k < positions.length; k++) positions[k] = i.coords[k] + i.normals[k] * d;
    const mesh = compact({ ...i.fullBody, positions }, (f) => sel[f] === 1);
    if (mesh.faceSizes.length)
      out.overlay = [mesh, { name: 'Skin details', color: '#ffffff', roughness: 0.85, metalness: 0, alpha: 'blend', doubleSided: false, map }];
  }

  // --- Geometry (cached per head shape: a tattoo or colour change doesn't regrow hair) ---
  const ctx: HeadCtx = {
    base, coords: i.coords, normals: i.normals, regions: base.regions, faceVerts: lib.base.arrays.faceVerts as Uint32Array,
    seed: p.seed, low: i.low, underHat: i.underHat,
  };
  const shape = coordsHash(i.coords);
  const grown = <T>(what: string, make: () => T): T =>
    cached(lib, `${what}|${shape}|${p.seed}|${i.low}|${i.underHat ? hashKey(String(i.underHat.reduce((n, x, k) => (x ? n + k : n), 0))) : ''}`, () => {
      i.onStage?.('Growing hair');
      return make();
    });
  const hairMat = (name: string, t: { map: string; normalMap?: string }, extra: Partial<Material> = {}): Material => ({
    name, color: hairColor, roughness: 0.55, metalness: 0, alpha: 'opaque', doubleSided: false, ...t, ...extra,
  });
  if (proc === 'mohawk') {
    const m = grown('spikes', () => spikes(ctx));
    if (m) out.hair.push([m, hairMat('Hair spikes', tex(lib, 'gen_hair_spike', spikeTexture))]);
  } else if (proc === 'cornrows') {
    const m = grown('cornrows', () => cornrows(ctx));
    if (m) out.hair.push([m, hairMat('Braids', tex(lib, 'gen_hair_braid', braidTexture))]);
  } else if (proc === 'box_braids') {
    const m = grown('box_braids', () => boxBraids(ctx, i.neckY + 0.25));
    if (m) out.hair.push([m, hairMat('Braids', tex(lib, 'gen_hair_braid', braidTexture))]);
  }
  if (proc === 'buzz') {
    const m = grown('buzz', () => buzzCards(ctx));
    if (m) out.hair.push([m, hairMat('Buzz cut', tex(lib, 'gen_hair_card', hairCardTexture), { alpha: 'mask', doubleSided: true, roughness: 0.8 })]);
  }
  const beard = facial === 'none' || facial === 'stubble' ? undefined : grown(`beard:${facial}`, () => beardCards(ctx, facial));
  if (beard)
    out.beard.push([beard, hairMat('Beard', tex(lib, 'gen_hair_card', hairCardTexture), { color: beardColor, alpha: 'mask', doubleSided: true, roughness: 0.75 })]);

  const ear = p.earrings ?? 'none';
  const rings = merge(earrings(ear, base, i.coords, i.normals));
  if (rings) out.jewelry.push([rings, metalMaterial(p.earringMetal ?? 'gold')]);
  return out;
}
