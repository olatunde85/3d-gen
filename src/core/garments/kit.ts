/**
 * Shared garment toolkit: types, materials and the shape helpers (shells,
 * hull-lofted skirts, limb bands, beads) that every garment builds on.
 * Everything is in MakeHuman decimetres.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import type { Material } from '../mesh';
import { cm, REGION, type Body, type VInfo } from './body';
import { along, ellipsoid, frameOf, hullRing, loftRings, merge, orientOutward, solidBand, v3, type Plane } from './ring';
import { buildShell, type ShellSpec } from './shell';
import { makePattern, type Pattern, type TexOut } from './textures';

export type Slot = 'top' | 'bottom' | 'acc' | 'feet';

export interface GarmentStyle {
  pattern: Pattern;
  color: string;
  color2: string;
}

export interface GarmentDef {
  id: string;
  label: string;
  slot: Slot;
  /** Patterns offered in the UI (first = default). */
  patterns: Pattern[];
  color: string;
  color2: string;
  /** Hides the skin it covers (opaque fitted garments). */
  build(g: GCtx, st: GarmentStyle): GPart[];
}

export interface GPart {
  mesh: PolyMesh;
  material: Material;
  /** Body-face mask whose skin should be hidden under this part. */
  hides?: Uint8Array;
  /** Covers the crown: hair above its lowest point is trimmed. */
  headwear?: boolean;
  /** Covers all the hair (a head tie): the hairstyle is left out. */
  hidesHair?: boolean;
  /** Touches the ground (soles): used for grounding. */
  ground?: boolean;
  /** Fitted cloth that should be subdivided in HD. */
  smooth?: boolean;
  /**
   * Where to look up skin weights for each vertex (defaults to its position): loose cloth looks
   * nearer the hips or torso so it doesn't follow a single leg or arm.
   */
  skinAt?: Float32Array;
}

export interface GCtx {
  body: Body;
  faceVerts: Uint32Array;
  /** Registers a generated texture, returns its file name. */
  texture(key: string, make: () => TexOut): { map: string; normalMap?: string; alpha: boolean };
  /** True when a top / bottom garment is worn (accessories sit a bit further out). */
  layered: { top: boolean; bottom: boolean };
  /** Briefs under wrappers / aprons / loincloths (always on for under-18 characters). */
  underwear: boolean;
}

// --- Helpers ---------------------------------------------------------------------

export const Y: Vec3 = [0, 1, 0];
export const Z: Vec3 = [0, 0, 1];
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export function torsoY(b: Body, t: number) {
  return b.L.hipY + t * (b.L.neckY - b.L.hipY);
}

export function points(b: Body, test: (v: VInfo, i: number) => boolean): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < b.info.length; i++) if (b.regions[i] !== 255 && test(b.info[i], i)) out.push(b.p(i));
  return out;
}

export const isTrunk = (v: VInfo) => v.region === REGION.torso || v.region === REGION.hips;
/** Trunk plus the shoulder tops and lower neck, which the weight-based regions split oddly. */
export const isUpper = (v: VInfo) => isTrunk(v) || (v.region === REGION.neck && v.tt < 1.0) || (v.region === REGION.upperarm && v.t < 0.08 && v.tt > 0.78);
export const isLegs = (v: VInfo) => v.region === REGION.upperleg || v.region === REGION.lowerleg;

export function mat(name: string, tex: { map: string; normalMap?: string; alpha: boolean } | null, o: Partial<Material> = {}): Material {
  return {
    name, color: '#ffffff', roughness: 0.85, metalness: 0,
    map: tex?.map, normalMap: tex?.normalMap, alpha: tex?.alpha ? 'mask' : 'opaque', doubleSided: false, ...o,
  };
}

export function cloth(g: GCtx, name: string, st: GarmentStyle, o: Partial<Material> = {}) {
  const key = `${st.pattern}_${st.color}_${st.color2}`;
  const tex = g.texture(key, () => makePattern(st.pattern, st.color, st.color2));
  const rough = st.pattern === 'leather' ? 0.55 : st.pattern === 'techwear' ? 0.6 : 0.88;
  return mat(name, tex, { roughness: rough, ...o });
}

export const leatherStyle = (color = '#5a3a22'): GarmentStyle => ({ pattern: 'leather', color, color2: '#000000' });
export const GOLD: Partial<Material> = { color: '#d9a441', roughness: 0.32, metalness: 0.9 };
export const STEEL: Partial<Material> = { color: '#9aa1a8', roughness: 0.35, metalness: 0.85 };

export function shell(g: GCtx, spec: ShellSpec) {
  return buildShell(g.body, g.faceVerts, spec);
}

export function shellPart(g: GCtx, spec: ShellSpec, material: Material, hide = true): GPart[] {
  const r = shell(g, spec);
  if (!r) return [];
  return [{ mesh: r.mesh, material, hides: hide && material.alpha === 'opaque' ? r.covered : undefined, smooth: true }];
}

/** Horizontal plane at torso parameter t. */
export const hplane = (b: Body, y: number): Plane => ({ origin: [0, y, b.L.torsoZ], normal: Y });

/** Point on a ring at angle a (rings span -PI..PI with `samples` points). */
export function ringAt(ring: Vec3[], a: number): { p: Vec3; out: Vec3; tan: Vec3 } {
  const n = ring.length;
  const j = ((Math.round(((a + Math.PI) / (2 * Math.PI)) * n) % n) + n) % n;
  let c: Vec3 = [0, 0, 0];
  for (const p of ring) c = v3.add(c, v3.scale(p, 1 / n));
  const p = ring[j];
  const tan = v3.norm(v3.sub(ring[(j + 1) % n], ring[(j - 1 + n) % n]));
  const out = v3.norm(v3.sub(p, c));
  return { p, out, tan };
}

/**
 * Hull-lofted skirt (wrappers, tunic skirts, aprons) from yTop down to yBot.
 * Rings never get narrower going down, so the cloth hangs past the legs.
 */
export function skirt(
  b: Body, yTop: number, yBot: number, offset: number, flare: number, arc?: [number, number], samples = 40,
  uv: { uRepeats?: number; tileV?: number } = {},
): PolyMesh | null {
  const src = points(b, (v) => isTrunk(v) || isLegs(v));
  const k = Math.max(3, Math.ceil((yTop - yBot) / cm(3)));
  const rings: Vec3[][] = [];
  let centre: Vec3 | null = null;
  for (let i = 0; i <= k; i++) {
    const y = yTop + ((yBot - yTop) * i) / k;
    const r = hullRing(src, hplane(b, y), { slab: cm(2.5), samples, offset: offset + flare * (yTop - y), arc });
    if (!r) return null;
    if (!centre) {
      centre = [0, 0, 0];
      const full = hullRing(src, hplane(b, y), { slab: cm(2.5), samples: 16, offset: 0 })!;
      for (const p of full) centre = v3.add(centre, v3.scale(p, 1 / full.length));
    }
    if (rings.length) {
      const prev = rings[rings.length - 1];
      for (let j = 0; j < r.length; j++) {
        const d: Vec3 = [r[j][0] - centre[0], 0, r[j][2] - centre[2]];
        const pd: Vec3 = [prev[j][0] - centre[0], 0, prev[j][2] - centre[2]];
        const rl = v3.len(d), pl = v3.len(pd);
        if (rl < pl) r[j] = [centre[0] + (d[0] / (rl || 1)) * pl, r[j][1], centre[2] + (d[2] / (rl || 1)) * pl];
      }
    }
    rings.push(r);
  }
  return orientOutward(
    loftRings(rings, { closedAround: !arc, tileU: 0.3, tileV: uv.tileV ?? 0.3, uRepeats: uv.uRepeats }),
    [0, (yTop + yBot) / 2, b.L.torsoZ],
  );
}

/** Solid band around a limb at parameter t. */
export function limbBand(b: Body, region: number, side: number, t: number, width: number, thick: number, offset: number, tileU = 0.1): PolyMesh | null {
  const [a, c] = b.axis(region, side);
  const origin = v3.lerp(a, c, t);
  const pts = b.verts(region, side).map((v) => b.p(v));
  return solidBand(pts, { origin, normal: v3.sub(c, a) }, width, thick, offset, { samples: 20, tileU, slab: cm(1.5) });
}

/** Limb ring (for placing beads / fringe) at parameter t. */
export function limbRing(b: Body, region: number, side: number, t: number, offset: number, samples = 24) {
  const [a, c] = b.axis(region, side);
  const pts = b.verts(region, side).map((v) => b.p(v));
  return { ring: hullRing(pts, { origin: v3.lerp(a, c, t), normal: v3.sub(c, a) }, { slab: cm(1.2), samples, offset }), dir: v3.norm(v3.sub(c, a)) };
}

/** Diagonal strap plane from a shoulder (side s) to the opposite hip. */
export function strapPlane(b: Body, s: number, shoulderBias = 0.55): Plane {
  const neck = b.joint('neck01____head');
  const sh = b.joint(`upperarm01${s > 0 ? '.L' : '.R'}____head`);
  const top = v3.add(v3.lerp(neck, sh, shoulderBias), [0, cm(4), 0]);
  const hip: Vec3 = [-s * Math.abs(sh[0]) * 0.9, torsoY(b, 0.15), b.L.torsoZ];
  const mid = v3.lerp(top, hip, 0.5);
  return { origin: mid, normal: v3.norm(v3.cross(v3.sub(top, hip), Z)) };
}

export const strapPoints = (b: Body, s: number) =>
  points(b, (v) => isTrunk(v) || (v.region === REGION.upperarm && v.side === s && v.t < 0.3));

/** Beads (or shells) along a polyline, coloured from a palette texture. */
export function beads(ring: Vec3[], closed: boolean, spacing: number, r: Vec3, colors: number, centre: Vec3): PolyMesh | null {
  const parts: PolyMesh[] = [];
  for (const { p, tangent, i } of along(ring, spacing, closed)) {
    const out = v3.norm(v3.sub(p, centre));
    const f = frameOf(p, out, tangent);
    const cell = (i % colors) + 0.5;
    parts.push(ellipsoid({ o: f.o, x: f.y, y: f.x, z: f.z }, r, [cell / colors, 0.5], 6, 4));
  }
  return merge(parts);
}

/** Briefs under wrappers, skirts and aprons (always on for under-18 characters). */
export function briefsUnder(g: GCtx): GPart[] {
  if (!g.underwear) return [];
  return shellPart(g, {
    covers: (v) => (isTrunk(v) && v.t < 0.12) || (v.region === REGION.upperleg && v.t < 0.1),
    offset: cm(0.3), tile: 0.2,
  }, cloth(g, 'Briefs', { pattern: 'solid', color: '#4a3424', color2: '#000000' }));
}
