/**
 * Mouth shading painted into the skin overlay: the inner lips and the inside of the mouth are in
 * shadow, so they don't glow when the mouth opens.
 */
import { REGION, type Body } from '../garments/body';
import { smoothstep, type Vec3 } from '../math';
import type { Layer, Paint } from './overlay';

/**
 * Shade inside the lips and the mouth: real mouths are shadowed inside, but the inner lips and
 * corners are otherwise lit like the outer face and glow when the mouth opens. Only surfaces that
 * face into the mouth (normals pointing back or up/down into it) are shaded, never the outer skin.
 */
export function mouthShadeLayer(base: Body): Layer {
  const dark = [26, 12, 10] as const;
  // Inner-mouth vertices of the base mesh: in the mouth box, facing away from the front.
  const inner: Vec3[] = [];
  const C = base.coords, N = base.normals;
  for (let v = 0; v < base.regions.length; v++) {
    if (base.regions[v] !== REGION.head) continue;
    const x = Math.abs(C[v * 3]), y = C[v * 3 + 1], z = C[v * 3 + 2];
    if (x > 0.26 || y < 6.58 || y > 6.74 || z < 1.0) continue;
    const nl = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1;
    if (N[v * 3 + 2] / nl < 0.15) inner.push([C[v * 3], y, z]);
  }
  return {
    key: 'mouth-shade-2',
    bounds: [-0.3, 6.56, 0.9, 0.3, 6.76, 99],
    regions: [REGION.head],
    paint(p): Paint {
      let d = Infinity;
      for (const q of inner) {
        const e = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (e < d) d = e;
      }
      const a = 1 - smoothstep(0.006, 0.02, Math.sqrt(d));
      return a > 0 ? [dark[0], dark[1], dark[2], a * 0.8] : null;
    },
  };
}
