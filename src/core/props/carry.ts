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

export const CARRIED = ['none', 'straw_tote'] as const;
export type CarryId = (typeof CARRIED)[number];
export const CARRY_LABELS: Record<CarryId, string> = { none: 'None', straw_tote: 'Straw tote' };

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

export function buildCarry(id: CarryId, texture: TextureFn): CarryPart[] {
  switch (id) {
    case 'none':
      return [];
    case 'straw_tote':
      return strawTote(texture);
  }
}
