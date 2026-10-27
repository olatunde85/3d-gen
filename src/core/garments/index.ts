import type { AssetLibrary } from '../assets';
import { ageToYears, type HumanParams } from '../params';
import { makeBody } from './body';
import { bootShafts, garmentById, sandals, type GarmentStyle, type GCtx, type GPart } from './catalog';
import { PATTERNS, type Pattern } from './textures';
import { setById } from './yoruba';

export { GARMENTS, garmentById } from './catalog';
export { PATTERNS } from './textures';
export { archFeet } from './heels';
export { OUTFIT_SETS, setById, type OutfitSet } from './yoruba';

export interface Dressing {
  top?: string;
  bottom?: string;
  underwear: boolean;
  accessories: string[];
  footwear?: 'sandals' | 'boots' | 'heels';
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
  let styles = p.garmentStyles;
  if (set) {
    const shared = { pattern: set.patterns[0], color: set.color, color2: set.color2, ...styles[set.id] };
    styles = { ...styles, [set.top]: shared, ...(set.bottom !== 'none' ? { [set.bottom]: shared } : {}) };
    // Matching gele: the set's colours unless the gele has its own.
    if (!styles.gele) styles = { ...styles, gele: { color: shared.color, color2: shared.color2 } };
  }
  if (pieces && !bottom && underwear) bottom = 'briefs';
  if (pieces && !top && p.gender < 0.5 && minor) top = 'tank_top';
  return {
    top,
    bottom,
    underwear,
    accessories: p.accessories.filter((a) => garmentById.get(a)?.slot === 'acc'),
    footwear: p.shoes === 'sandals' ? 'sandals' : p.shoes === 'combat_boots' ? 'boots' : p.shoes === 'heels' ? 'heels' : undefined,
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

export function buildGarments(lib: AssetLibrary, coords: Float32Array, normals: Float32Array, faceVerts: Uint32Array, d: Dressing): GPart[] {
  if (!d.top && !d.bottom && !d.accessories.length && !d.footwear) return [];
  const body = makeBody(coords, normals, lib.base.arrays.regions as Uint8Array, lib.base.meta.joints);
  const g: GCtx = {
    body,
    faceVerts,
    layered: { top: !!d.top, bottom: !!d.bottom && d.bottom !== 'briefs' },
    underwear: d.underwear,
    texture(key, make) {
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
    },
  };
  const parts: GPart[] = [];
  for (const id of [d.bottom, d.top, ...d.accessories]) {
    if (!id) continue;
    parts.push(...garmentById.get(id)!.build(g, styleOf(id, d.styles)));
  }
  if (d.footwear === 'sandals') parts.push(...sandals(g));
  if (d.footwear === 'boots') parts.push(...bootShafts(g));
  if (d.footwear === 'heels') parts.push(...garmentById.get('heels')!.build(g, styleOf('heels', d.styles)));
  return parts;
}
