import type { AssetLibrary } from '../assets';
import { ageToYears, type HumanParams } from '../params';
import { makeBody } from './body';
import { bootShafts, garmentById, sandals, type GarmentStyle, type GCtx, type GPart } from './catalog';
import { PATTERNS, type Pattern, type TexOut } from './textures';
import { flipFlops } from './beach';
import { setById, setStyles } from './sets';

export { GARMENTS, garmentById } from './catalog';
export { PATTERNS } from './textures';
export { archFeet } from './heels';
export { OUTFIT_SETS, setById, setStyles, sharedPieces, type OutfitSet } from './sets';

export interface Dressing {
  top?: string;
  jacket?: string;
  bottom?: string;
  underwear: boolean;
  accessories: string[];
  /** Built-in footwear, or a generated shoe's garment id (heels, sneakers, loafers). */
  footwear?: 'sandals' | 'boots' | 'flipflops' | string;
  styles: HumanParams['garmentStyles'];
}

/**
 * What the character actually wears. Topless and bottomless (no underwear)
 * are adult-only (18+): younger female characters always get a top, and every
 * under-18 character keeps underwear.
 */
export function dressing(p: HumanParams): Dressing {
  // An outfit set dresses its own top and bottom, sharing the set's pattern and colours.
  const set = setById.get(p.outfit);
  const pieces = p.outfit === 'none' || !!set;
  const minor = ageToYears(p.age) < 18;
  const underwear = p.underwear || minor;
  const topId = set ? set.top : p.top, bottomId = set ? set.bottom : p.bottom;
  let top = pieces && topId !== 'none' && garmentById.has(topId) ? topId : undefined;
  let bottom = pieces && bottomId !== 'none' && garmentById.has(bottomId) ? bottomId : undefined;
  const jacketId = set ? (set.jacket ?? 'none') : p.jacket;
  const jacket = pieces && garmentById.get(jacketId)?.slot === 'jacket' ? jacketId : undefined;
  const styles = set ? setStyles(set, p.garmentStyles) : p.garmentStyles;
  if (pieces && !bottom && underwear) bottom = 'briefs';
  if (pieces && !top && p.gender < 0.5 && minor) top = 'tank_top';
  return {
    top,
    jacket,
    bottom,
    underwear,
    accessories: [...p.accessories.filter((a) => garmentById.get(a)?.slot === 'acc'), ...(garmentById.get(p.hat)?.slot === 'hat' ? [p.hat] : [])],
    footwear: p.shoes === 'sandals' ? 'sandals' : p.shoes === 'combat_boots' ? 'boots' : p.shoes === 'flipflops' ? 'flipflops' : garmentById.get(p.shoes)?.slot === 'feet' ? p.shoes : undefined,
    styles,
  };
}

function hashKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function styleOf(id: string, styles: HumanParams['garmentStyles']): GarmentStyle {
  const def = garmentById.get(id)!;
  const o = styles[id] ?? {};
  const pattern = (o.pattern && PATTERNS.includes(o.pattern as Pattern) ? o.pattern : def.patterns[0]) as Pattern;
  return { pattern, color: o.color ?? def.color, color2: o.color2 ?? def.color2 };
}

/** Register a generated texture once (by key) and return its file names. */
export function genTexture(lib: AssetLibrary, key: string, make: () => TexOut): { map: string; normalMap?: string; alpha: boolean } {
  const id = `gen_${hashKey(key)}`;
  const color = `${id}.png`, normal = `${id}_n.png`;
  if (!lib.hasTexture(color)) {
    const t = make();
    lib.registerTexture(color, t.color);
    if (t.normal) lib.registerTexture(normal, t.normal);
    lib.registerTexture(`${id}.alpha`, new Uint8Array([t.alpha ? 1 : 0]));
  }
  const alpha = (lib.peekTexture(`${id}.alpha`)?.[0] ?? 0) === 1;
  return { map: color, normalMap: lib.hasTexture(normal) ? normal : undefined, alpha };
}

export function buildGarments(lib: AssetLibrary, coords: Float32Array, normals: Float32Array, faceVerts: Uint32Array, d: Dressing): GPart[] {
  if (!d.top && !d.jacket && !d.bottom && !d.accessories.length && !d.footwear) return [];
  const body = makeBody(coords, normals, lib.base.arrays.regions as Uint8Array, lib.base.meta.joints);
  const g: GCtx = {
    body,
    faceVerts,
    layered: { top: !!d.top, bottom: !!d.bottom && d.bottom !== 'briefs' },
    underwear: d.underwear,
    texture: (key, make) => genTexture(lib, key, make),
  };
  const parts: GPart[] = [];
  for (const id of [d.bottom, d.top, d.jacket, ...d.accessories]) {
    if (!id) continue;
    const built = garmentById.get(id)!.build(g, styleOf(id, d.styles));
    parts.push(...built);
    // The top, and the jacket over it: what later layers rest on.
    if (id === d.top || id === d.jacket) {
      const pts: [number, number, number][] = [];
      for (const p of built) for (let i = 0; i < p.mesh.positions.length; i += 3) pts.push([p.mesh.positions[i], p.mesh.positions[i + 1], p.mesh.positions[i + 2]]);
      if (id === d.top) g.worn = pts;
      else g.jacket = pts;
    }
  }
  if (d.footwear === 'sandals') parts.push(...sandals(g));
  if (d.footwear === 'boots') parts.push(...bootShafts(g));
  if (d.footwear === 'flipflops') parts.push(...flipFlops(g));
  const shoe = d.footwear ? garmentById.get(d.footwear) : undefined;
  if (shoe?.slot === 'feet') parts.push(...shoe.build(g, styleOf(shoe.id, d.styles)));
  return parts;
}
