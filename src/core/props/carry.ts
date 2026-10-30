/**
 * Props carried in the left hand (bags), modelled in metres in a "carry frame": origin at the
 * grip (where the handles pass through the fingers), +Y up, +Z the character's forward, +X the
 * character's left (away from the body for the left hand). The prop hangs straight down along -Y.
 * human.ts fits this frame to the hand in the relaxed arms-down pose and binds it to the hand bone.
 */
import { cord, loftRings, merge, orientOutward, v3 } from '../garments/ring';
import { makePattern, shade, type Pattern, type TexOut } from '../garments/textures';
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import type { Material } from '../mesh';

/**
 * Bags: carried in the hand (built here), or worn (the backpack, a garment with slot 'bag', built
 * with the clothes).
 */
export const CARRIED = ['none', 'straw_tote', 'handbag', 'briefcase', 'backpack'] as const;
export type CarryId = (typeof CARRIED)[number];
export const CARRY_LABELS: Record<CarryId, string> = { none: 'None', straw_tote: 'Straw tote', handbag: 'Structured handbag', briefcase: 'Leather briefcase', backpack: 'Canvas backpack' };
/** Bags worn on the body rather than carried in the hand. */
export const WORN_BAGS: readonly CarryId[] = ['backpack'];

export interface BagStyle {
  pattern: Pattern;
  color: string;
  color2: string;
}

/**
 * Finishes and colours offered for each bag carried in the hand (first finish = default), chosen
 * like a garment's and kept in the params' `garmentStyles` under the bag's id.
 */
export const CARRY_STYLES: Record<Exclude<CarryId, 'none' | 'backpack'>, { patterns: Pattern[]; color: string; color2: string; colorLabels: [string, string] }> = {
  straw_tote: { patterns: ['straw'], color: '#cfae74', color2: '#8a6a3a', colorLabels: ['Straw', 'Trim'] },
  handbag: { patterns: ['nappa', 'patent', 'leather'], color: '#ece3d3', color2: '#d9b25a', colorLabels: ['Leather', 'Hardware'] },
  briefcase: { patterns: ['nappa', 'leather'], color: '#3a2214', color2: '#c9a45a', colorLabels: ['Leather', 'Hardware'] },
};

/** A carried bag's style from the params' saved styles (falling back to its defaults). */
export function carryStyle(id: keyof typeof CARRY_STYLES, styles: Record<string, { pattern?: string; color?: string; color2?: string }>): BagStyle {
  const def = CARRY_STYLES[id], o = styles[id] ?? {};
  const pattern = def.patterns.find((x) => x === o.pattern) ?? def.patterns[0];
  return { pattern, color: o.color ?? def.color, color2: o.color2 ?? def.color2 };
}

export interface CarryPart {
  mesh: PolyMesh;
  material: Material;
}

/** Registers a generated texture and returns its file name (see GCtx.texture). */
export type TextureFn = (key: string, make: () => TexOut) => { map: string; normalMap?: string; alpha: boolean };

/** Rounded-rectangle outline (superellipse) in the horizontal plane at height y. */
function outline(y: number, w: number, d: number, n = 48, k = 5): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    // Width runs front to back (along +Z), depth sideways (along +X): the bag hangs flat beside the leg.
    out.push([Math.sign(s) * Math.abs(s) ** (2 / k) * (d / 2), y, Math.sign(c) * Math.abs(c) ** (2 / k) * (w / 2)]);
  }
  return out;
}

/** Bag leather in the style's finish (patent glossy). */
function leatherOf(texture: TextureFn, name: string, st: BagStyle, roughness: number, doubleSided: boolean): Material {
  const t = texture(`${st.pattern}_${st.color}`, () => makePattern(st.pattern, st.color, st.color));
  return { name, color: '#ffffff', roughness: st.pattern === 'patent' ? 0.15 : roughness, metalness: 0, map: t.map, normalMap: t.normalMap, alpha: 'opaque', doubleSided };
}

/** Polished hardware in the style's second colour. */
const metal = (name: string, color: string): Material => ({ name, color, roughness: 0.24, metalness: 1, alpha: 'opaque', doubleSided: false });

/** Woven straw tote: tapered body, flat base, rolled rim and two handles meeting at the grip. */
function strawTote(texture: TextureFn, st: BagStyle): CarryPart[] {
  const handle = 0.15, H = 0.3, Wt = 0.34, Wb = 0.27, D = 0.12;
  // The bag hangs a little outward of the grip so it clears the thigh.
  const off = D * 0.35;
  const top = -handle;
  const rings: Vec3[][] = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    // Slight belly halfway down, as a soft woven bag sags.
    const belly = 1 + 0.04 * Math.sin(Math.PI * t);
    rings.push(outline(top - H * t, (Wt + (Wb - Wt) * t) * belly, D * (1 - 0.2 * t) * belly).map((p) => [p[0] + off, p[1], p[2]] as Vec3));
  }
  const body = orientOutward(loftRings(rings, { closedAround: true, tileU: 0.008, tileV: 0.008 }), [off, top - H / 2, 0]);
  // Base: a flat cap.
  const last = rings[rings.length - 1];
  let c: Vec3 = [0, 0, 0];
  for (const p of last) c = v3.add(c, v3.scale(p, 1 / last.length));
  const base = orientOutward(loftRings([last, last.map((p) => v3.lerp(p, c, 0.98))], { closedAround: true, uRepeats: 4, tileV: 0.008 }), [c[0], c[1] + 1, c[2]]);
  const rim = cord([...rings[0], rings[0][0]], 0.008, false, 8);
  // Handles: each from the rim's long sides, rising to meet in the hand.
  const handles: PolyMesh[] = [];
  for (const sgn of [1, -1]) {
    const a: Vec3 = [off + sgn * D * 0.5, top, -Wt * 0.24], b: Vec3 = [off + sgn * D * 0.5, top, Wt * 0.24];
    const g: Vec3 = [sgn * 0.006, 0, 0];
    handles.push(cord([a, v3.lerp(a, g, 0.55), v3.add(g, [0, 0, -0.02]), v3.add(g, [0, 0, 0.02]), v3.lerp(b, g, 0.55), b], 0.006, false, 8));
  }
  // (The gaps between the straw strips are a darker shade of it.)
  const straw = texture(`straw_${st.color}`, () => makePattern('straw', st.color, shade(st.color, 0.6)));
  const strawMat: Material = { name: 'Straw', color: '#ffffff', roughness: 0.85, metalness: 0, map: straw.map, normalMap: straw.normalMap, alpha: 'opaque', doubleSided: true };
  const trim: Material = { name: 'Tote trim', color: st.color2, roughness: 0.6, metalness: 0, alpha: 'opaque', doubleSided: false };
  return [
    { mesh: merge([body, base])!, material: strawMat },
    { mesh: merge([rim, ...handles])!, material: trim },
  ];
}

/**
 * Structured top-handle handbag: a boxy body widening a little to its base, a flap over the top and
 * down the outer face with piped edges, a gold turn-lock clasp, and a rolled leather handle on gold
 * mounts, held in the hand.
 */
function handbag(texture: TextureFn, st: BagStyle): CarryPart[] {
  const handle = 0.11, H = 0.19, Wt = 0.22, Wb = 0.25, Dt = 0.075, Db = 0.095;
  // Hangs a little outward of the grip, clear of the thigh.
  const off = Db * 0.45, top = -handle;
  const ring = (y: number, w: number, d: number) => outline(y, w, d, 64, 7).map((p) => [p[0] + off, p[1], p[2]] as Vec3);
  const rings: Vec3[][] = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    rings.push(ring(top - H * t, Wt + (Wb - Wt) * t, Dt + (Db - Dt) * t));
  }
  // Closed: a slightly domed top and a flat base.
  const cap = (r: Vec3[], dy: number) => {
    let c: Vec3 = [0, 0, 0];
    for (const p of r) c = v3.add(c, v3.scale(p, 1 / r.length));
    return [r.map((p) => v3.add(v3.lerp(p, c, 0.6), [0, dy * 0.7, 0])), r.map((p) => v3.add(v3.lerp(p, c, 0.99), [0, dy, 0]))];
  };
  const [t1, t2] = cap(rings[0], 0.004), [b1, b2] = cap(rings[10], 0);
  const body = orientOutward(loftRings([t2, t1, ...rings, b1, b2], { closedAround: true, tileU: 0.06, tileV: 0.06 }), [off, top - H / 2, 0]);
  // Flap: over the top from the inner edge and down the outer face to 55% of the height, 3 mm proud,
  // its lower corners rounded.
  const flapRows: Vec3[][] = [];
  const Z = 24;
  for (let j = 0; j <= Z; j++) {
    const z = -Wt / 2 * 1.01 + (Wt * 1.01 * j) / Z;
    const e = Math.abs(z) / (Wt / 2);
    // How far down the outer face this column reaches (rounded off at the corners).
    const depth = H * 0.55 - 0.03 * Math.max(0, (e - 0.8) / 0.2) ** 2;
    const col: Vec3[] = [];
    for (let i = 0; i <= 8; i++) col.push([off - Dt / 2 + (Dt * i) / 8, top + 0.007, z]);
    for (let i = 1; i <= 10; i++) {
      const t = i / 10, y = top - depth * t, d = Dt + (Db - Dt) * ((top - y) / H);
      col.push([off + d / 2 + 0.003 + 0.002 * Math.sin(Math.PI * Math.min(1, i / 2)), y, z]);
    }
    flapRows.push(col);
  }
  const flap = orientOutward(loftRings(flapRows, { closedAround: false, tileU: 0.06, tileV: 0.06 }), [off - 0.02, top - 0.05, 0]);
  const piping = merge([cord(flapRows.map((c) => c[c.length - 1]), 0.0025, false, 6), cord(flapRows[0], 0.0025, false, 6), cord(flapRows[Z], 0.0025, false, 6)]);
  // Clasp: a gold plate on the flap near its edge, with a turn-lock on it.
  const fy = top - H * 0.5, fx = off + (Dt + (Db - Dt) * 0.5) / 2 + 0.006;
  const plate = orientOutward(loftRings([0, 0.004].map((dx) => outline(0, 0.05, 0.026, 32, 4).map((p) => [fx + dx, fy + p[0], p[2]] as Vec3)), { closedAround: true, uRepeats: 1, tileV: 0.01 }), [fx - 0.01, fy, 0]);
  const lock = cord([0, 1, 2, 3, 4, 5, 6, 7, 8].map((k): Vec3 => [fx + 0.007, fy + 0.008 * Math.sin((k / 8) * Math.PI * 2), 0.008 * Math.cos((k / 8) * Math.PI * 2)]), 0.0025, false, 8);
  // Handle: a rolled leather arch from two mounts on the top up through the hand.
  const mz = Wt * 0.27, arch: Vec3[] = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16, a = Math.PI * t;
    // (Its peak passes through the palm, a little above the grip.)
    arch.push([off * (1 - Math.sin(a)) + 0.004 * Math.sin(a), top + 0.006 + (handle + 0.012) * Math.sin(a) ** 0.85, -mz * Math.cos(a)]);
  }
  const strap = cord(arch, 0.0065, false, 10);
  const mounts = merge([-1, 1].map((sg) => cord([0, 1, 2, 3, 4, 5, 6, 7, 8].map((k): Vec3 => [off + 0.009 * Math.cos((k / 8) * Math.PI * 2), top + 0.012 + 0.009 * Math.sin((k / 8) * Math.PI * 2), sg * mz]), 0.0022, false, 6)));
  return [
    { mesh: merge([body, flap, piping, strap])!, material: leatherOf(texture, 'Handbag leather', st, 0.42, true) },
    { mesh: merge([plate, lock, mounts])!, material: metal('Handbag hardware', st.color2) },
  ];
}

/**
 * Leather briefcase: a slim attache with rounded edges (its long side front to back beside the
 * leg), a seam round the lid, piped edges, two brass latches and a lock, and a rolled handle on
 * brass loops, held in the hand.
 */
function briefcase(texture: TextureFn, st: BagStyle): CarryPart[] {
  const handle = 0.07, H = 0.32, W = 0.44, D = 0.085;
  const off = D * 0.55, top = -handle;
  // A rounded slab: outline in the side plane (z along W, y down H), extruded across X by D.
  const ring = (x: number, inset: number) => outline(0, W - 2 * inset, H - 2 * inset, 64, 9).map((p) => [off + x, top - H / 2 + p[0], p[2]] as Vec3);
  const ds = [-D / 2, -D / 2 + 0.004, D / 2 - 0.004, D / 2];
  const rings = [ring(ds[0], 0.006), ring(ds[1], 0), ring(ds[2], 0), ring(ds[3], 0.006)];
  const capOf = (r: Vec3[]) => {
    let c: Vec3 = [0, 0, 0];
    for (const q of r) c = v3.add(c, v3.scale(q, 1 / r.length));
    return r.map(() => c);
  };
  const body = orientOutward(loftRings([capOf(rings[0]), ...rings, capOf(rings[3])], { closedAround: true, tileU: 0.08, tileV: 0.08 }), [off, top - H / 2, 0]);
  // Lid seam round the sides, and piping round both faces' edges.
  const seam = cord([...ring(D * 0.12, -0.0015), ring(D * 0.12, -0.0015)[0]], 0.0018, false, 5);
  const piping = merge([ring(ds[1], -0.001), ring(ds[2], -0.001)].map((r) => cord([...r, r[0]], 0.0025, false, 6)));
  // Handle: a rolled arch on two loops on the top edge.
  const mz = 0.06, arch: Vec3[] = [];
  for (let k = 0; k <= 14; k++) {
    const a = (Math.PI * k) / 14;
    // (Its top passes through the closed hand, a little above the grip.)
    arch.push([off * (1 - Math.sin(a) * 0.85), top + 0.004 + (handle + 0.03) * Math.sin(a) ** 0.8, -mz * Math.cos(a)]);
  }
  const strap = cord(arch, 0.007, false, 10);
  const loops = merge([-1, 1].map((sg) => cord([0, 1, 2, 3, 4, 5, 6, 7, 8].map((k): Vec3 => [off + 0.008 * Math.cos((k / 8) * Math.PI * 2), top + 0.006 + 0.008 * Math.sin((k / 8) * Math.PI * 2), sg * mz]), 0.0025, false, 6)));
  // Latches on the top edge of the outer face, either side of the handle, and the lock between.
  const outer = off + D / 2 + 0.002;
  const plate = (z: number, w: number, h: number) => orientOutward(loftRings([0, 0.003].map((dx) => outline(0, w, h, 24, 4).map((p) => [outer + dx, top - 0.02 + p[0], z + p[2]] as Vec3)), { closedAround: true, uRepeats: 1, tileV: 0.01 }), [outer - 0.01, top - 0.02, z]);
  const hardware = merge([plate(-0.13, 0.035, 0.022), plate(0.13, 0.035, 0.022), plate(0, 0.02, 0.016), loops]);
  return [
    { mesh: merge([body, seam, piping, strap])!, material: leatherOf(texture, 'Briefcase leather', st, 0.4, false) },
    { mesh: hardware!, material: metal('Briefcase hardware', st.color2) },
  ];
}

export function buildCarry(id: CarryId, texture: TextureFn, styles: Parameters<typeof carryStyle>[1]): CarryPart[] {
  switch (id) {
    case 'straw_tote':
      return strawTote(texture, carryStyle(id, styles));
    case 'handbag':
      return handbag(texture, carryStyle(id, styles));
    case 'briefcase':
      return briefcase(texture, carryStyle(id, styles));
    default:
      return [];
  }
}
