/**
 * Props carried in the left hand (bags), modelled in metres in a "carry frame": origin at the
 * grip (where the handles pass through the fingers), +Y up, +Z the character's forward, +X the
 * character's left (away from the body for the left hand). The prop hangs straight down along -Y.
 * human.ts fits this frame to the hand in the relaxed arms-down pose and binds it to the hand bone.
 */
import { cord, loftRings, merge, orientOutward, v3 } from '../garments/ring';
import { makePattern, type TexOut } from '../garments/textures';
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import type { Material } from '../mesh';

/**
 * Bags: carried in the hand (built here), or worn (the backpack, a garment with slot 'bag', built
 * with the clothes).
 */
export const CARRIED = ['none', 'straw_tote', 'handbag', 'backpack'] as const;
export type CarryId = (typeof CARRIED)[number];
export const CARRY_LABELS: Record<CarryId, string> = { none: 'None', straw_tote: 'Straw tote', handbag: 'Structured handbag', backpack: 'Canvas backpack' };
/** Bags worn on the body rather than carried in the hand. */
export const WORN_BAGS: readonly CarryId[] = ['backpack'];

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

/** Woven straw tote: tapered body, flat base, rolled rim and two handles meeting at the grip. */
function strawTote(texture: TextureFn): CarryPart[] {
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
  const straw = texture('straw_#cfae74', () => makePattern('straw', '#cfae74', '#7a5c30'));
  const strawMat: Material = { name: 'Straw', color: '#ffffff', roughness: 0.85, metalness: 0, map: straw.map, normalMap: straw.normalMap, alpha: 'opaque', doubleSided: true };
  const trim: Material = { name: 'Tote trim', color: '#8a6a3a', roughness: 0.6, metalness: 0, alpha: 'opaque', doubleSided: false };
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
function handbag(texture: TextureFn, color = '#ece3d3'): CarryPart[] {
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
  const leatherTex = texture(`nappa_${color}`, () => makePattern('nappa', color, color));
  const leather: Material = { name: 'Handbag leather', color: '#ffffff', roughness: 0.42, metalness: 0, map: leatherTex.map, normalMap: leatherTex.normalMap, alpha: 'opaque', doubleSided: true };
  const gold: Material = { name: 'Handbag hardware', color: '#d9b25a', roughness: 0.22, metalness: 1, alpha: 'opaque', doubleSided: false };
  return [
    { mesh: merge([body, flap, piping, strap])!, material: leather },
    { mesh: merge([plate, lock, mounts])!, material: gold },
  ];
}

export function buildCarry(id: CarryId, texture: TextureFn): CarryPart[] {
  switch (id) {
    case 'none':
      return [];
    case 'straw_tote':
      return strawTote(texture);
    case 'handbag':
      return handbag(texture);
    default:
      return [];
  }
}
