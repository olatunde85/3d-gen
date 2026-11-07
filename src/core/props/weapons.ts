/**
 * Procedural weapon props, modelled in metres in a "weapon frame":
 *   firearms: origin at the centre of the pistol grip, +Z down the barrel, +Y up, +X left
 *   blades:   origin at the centre of the handle, +Y along the blade, +Z toward the edge
 * human.ts maps this frame onto the WeaponR socket (see rig/socket.ts).
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import type { Material } from '../mesh';
import { frameOf, loftRings, merge, orientOutward, roundedBox } from '../garments/ring';

export const WEAPONS = ['none', 'rifle', 'pistol', 'sword', 'knife', 'grenade'] as const;
export type WeaponId = (typeof WEAPONS)[number];
export const WEAPON_LABELS: Record<WeaponId, string> = {
  none: 'None', rifle: 'Assault rifle', pistol: 'Pistol', sword: 'Sword', knife: 'Combat knife', grenade:'Grenade (prop)',
};
export const isFirearm = (w: WeaponId) => w === 'rifle' || w === 'pistol';

export interface WeaponPart {
  mesh: PolyMesh;
  material: Material;
}

const mat = (name: string, color: string, roughness: number, metalness: number): Material => ({
  name, color, roughness, metalness, alpha: 'opaque', doubleSided: false,
});
const GUNMETAL = mat('Gunmetal', '#2c2e31', 0.42, 0.75);
const POLYMER = mat('Polymer', '#1b1c1e', 0.75, 0.0);
const STEEL = mat('Blade steel', '#c9cdd3', 0.22, 1.0);
const LEATHER = mat('Grip leather', '#3a2416', 0.7, 0.0);
const BRASS = mat('Brass', '#b08d57', 0.35, 0.9);

/** Rounded box centred at c with half sizes h, optionally tilted about X by `pitch` degrees. */
function box(c: Vec3, h: Vec3, pitch = 0, round = 0): PolyMesh {
  const a = (pitch * Math.PI) / 180;
  const f = frameOf(c, [0, -Math.sin(a), Math.cos(a)], [0, Math.cos(a), Math.sin(a)]);
  // frameOf builds x from up x forward; ensure x = +X for consistent winding.
  return roundedBox({ o: f.o, x: [1, 0, 0], y: f.y, z: f.z }, h, round);
}

/** Capped cylinder from a to b. */
function cylinder(a: Vec3, b: Vec3, r: number, sides = 12): PolyMesh {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(...d);
  const t: Vec3 = [d[0] / L, d[1] / L, d[2] / L];
  const ref: Vec3 = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm([t[1] * ref[2] - t[2] * ref[1], t[2] * ref[0] - t[0] * ref[2], t[0] * ref[1] - t[1] * ref[0]]);
  const w: Vec3 = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
  const ring = (c: Vec3, rr: number) =>
    Array.from({ length: sides }, (_, j) => {
      const th = (j / sides) * Math.PI * 2;
      return [0, 1, 2].map((k) => c[k] + (u[k] * Math.cos(th) + w[k] * Math.sin(th)) * rr) as Vec3;
    });
  const tube = loftRings([ring(a, r), ring(b, r)], { closedAround: true, uRepeats: 1, tileV: 0.1 });
  const cap = (c: Vec3, flip: boolean): PolyMesh => {
    const pts = ring(c, r);
    const idx = [...Array(sides).keys()];
    return {
      positions: Float32Array.from(pts.flat()), faceSizes: Uint8Array.from([sides]),
      faceVerts: Uint32Array.from(flip ? idx.reverse() : idx), faceUVs: new Uint32Array(sides), uvs: Float32Array.from([0.5, 0.5]),
    };
  };
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return orientOutward(merge([tube, cap(a, true), cap(b, false)])!, mid);
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Blade: diamond cross-section lofted along +Y, tapering to a point. */
function blade(y0: number, y1: number, width: number, thick: number, singleEdge = false, sides = 1): PolyMesh {
  const rings: Vec3[][] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const y = y0 + (y1 - y0) * s;
    // Width profile: straight, then a curved taper into the tip over the last 25%.
    const taper = s < 0.75 ? 1 - 0.15 * s : (1 - 0.15 * 0.75) * Math.sqrt(Math.max(0.0001, 1 - (s - 0.75) / 0.25));
    const w = width * taper * sides, tk = thick * (0.4 + 0.6 * taper);
    const back = singleEdge ? -w * 0.15 : -w;
    rings.push([[0, y, w], [tk, y, 0], [0, y, back], [-tk, y, 0]]);
  }
  return orientOutward(loftRings(rings, { closedAround: true, uRepeats: 1, tileV: 0.2 }), [0, (y0 + y1) / 2, 0]);
}

export interface WeaponFit {
  /** Distance down the barrel (m) where the support hand holds a rifle. */
  supportZ?: number;
}

export function buildWeapon(id: WeaponId, fit: WeaponFit = {}): WeaponPart[] {
  switch (id) {
    case 'none':
      return [];
    case 'rifle': {
      const hz = Math.min(0.42, Math.max(0.16, fit.supportZ ?? 0.3)); // where the support hand holds the handguard (see SUPPORT_MIN/MAX)
      const rail = 0.085;
      return [
        {
          mesh: merge([
            box([0, 0.055, 0.04], [0.021, 0.028, 0.12]), // receiver
            box([0, rail, 0.05], [0.012, 0.006, 0.13], 0, 1), // top rail
            box([0, 0.06, hz + 0.02], [0.022, 0.024, 0.15]), // handguard
            box([0, 0.045, -0.13], [0.018, 0.026, 0.06]), // buffer tube / stock join
            box([0, 0.035, -0.24], [0.02, 0.045, 0.07], -6), // stock
            box([0, 0.105, 0.16], [0.006, 0.02, 0.006]), // front sight post
            box([0, 0.1, -0.03], [0.012, 0.014, 0.012]), // rear sight
          ])!,
          material: GUNMETAL,
        },
        {
          mesh: merge([
            box([0, -0.008, -0.004], [0.014, 0.052, 0.021], 18, 1), // pistol grip (bottom behind the trigger)
            box([0, -0.07, 0.085], [0.012, 0.07, 0.03], -12), // magazine (curves forward)
            box([0, 0.015, 0.04], [0.003, 0.012, 0.03]), // trigger guard
            box([0, 0.035, -0.31], [0.022, 0.05, 0.012], -6), // butt pad
          ])!,
          material: POLYMER,
        },
        {
          mesh: merge([
            cylinder([0, 0.06, hz + 0.17], [0, 0.06, hz + 0.37], 0.009), // barrel
            cylinder([0, 0.06, hz + 0.37], [0, 0.06, hz + 0.42], 0.013), // muzzle device
          ])!,
          material: GUNMETAL,
        },
      ];
    }
    case 'pistol':
      return [
        { mesh: merge([box([0, 0.062, 0.06], [0.013, 0.017, 0.095]), box([0, 0.08, 0.15], [0.003, 0.004, 0.004])])!, material: GUNMETAL },
        {
          mesh: merge([
            box([0, 0.0, -0.005], [0.015, 0.055, 0.023], 16, 1), // grip
            box([0, 0.038, 0.06], [0.012, 0.01, 0.06]), // frame
            box([0, 0.02, 0.045], [0.003, 0.012, 0.028]), // trigger guard
          ])!,
          material: POLYMER,
        },
      ];
    case 'grenade':
      return [
        {mesh:merge([cylinder([0,-.04,0],[0,.025,0],.033,20),cylinder([0,.025,0],[0,.047,0],.023,16)])!,material:mat('Grenade shell','#536045',.78,.15)},
        {mesh:merge([box([.025,.025,0],[.006,.045,.012],-8),box([0,.055,0],[.027,.005,.013])])!,material:GUNMETAL},
        {mesh:cylinder([-.023,.043,0],[-.023,.07,0],.005,10),material:STEEL},
      ];
    case 'sword':
      return [
        { mesh: blade(0.085, 0.86, 0.022, 0.0045), material: STEEL },
        { mesh: merge([box([0, 0.078, 0], [0.012, 0.009, 0.1]), box([0, -0.078, 0], [0.018, 0.016, 0.018], 0, 2)])!, material: BRASS },
        { mesh: cylinder([0, -0.065, 0], [0, 0.07, 0], 0.016, 10), material: LEATHER },
      ];
    case 'knife':
      return [
        { mesh: blade(0.07, 0.25, 0.017, 0.003, true, 1), material: STEEL },
        { mesh: box([0, 0.064, 0], [0.01, 0.006, 0.03]), material: GUNMETAL },
        { mesh: cylinder([0, -0.055, 0], [0, 0.06, 0], 0.014, 10), material: POLYMER },
      ];
  }
}
