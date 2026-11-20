/** Loose shorts with a thin, open leg hem and gathered drawstring waistband. */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION } from './body';
import { clamp, cloth, isTrunk, mat, shell, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, ellipsoid, frameOf, loftRings, merge, orientOutward, v3 } from './ring';

function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (shift: number) => Math.round(((n >> shift) & 255) * factor);
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

function waistDetails(g: GCtx, st: GarmentStyle, waist: Vec3[]): GPart[] {
  if (waist.length < 12) return [];
  const b = g.body, centreZ = b.L.torsoZ;
  const lift = (p: Vec3, amount: number, down = 0): Vec3 => {
    const r = Math.hypot(p[0], p[2] - centreZ) || 1;
    return [p[0] + p[0] / r * amount, p[1] - down, p[2] + (p[2] - centreZ) / r * amount];
  };
  const outerTop = waist.map(p => lift(p, cm(0.25)));
  const outerBottom = waist.map(p => lift(p, cm(0.5), cm(3.0)));
  const innerBottom = waist.map(p => lift(p, cm(0.2), cm(3.0)));
  const innerTop = waist.map(p => lift(p, cm(0.03)));
  const midY = waist.reduce((sum, p) => sum + p[1], 0) / waist.length;
  const band = orientOutward(loftRings([outerTop, outerBottom, innerBottom, innerTop],
    { closedAround: true, closedAcross: true, tileU: 0.12, tileV: 0.05 }), [0, midY, centreZ]);

  const ribs: PolyMesh[] = [];
  for (const t of [0.28, 0.52, 0.76]) {
    const ring = outerTop.map((p, i) => v3.lerp(p, outerBottom[i], t));
    ribs.push(cord(ring, cm(0.035), true, 5));
  }
  const front = waist.reduce((best, p) => p[2] - Math.abs(p[0]) * 0.4 > best[2] - Math.abs(best[0]) * 0.4 ? p : best);
  const z = front[2] + cm(0.75), knotY = front[1] - cm(1.0);
  const bow: PolyMesh[] = [ellipsoid(frameOf([0, knotY, z], [0, 0, 1], [0, 1, 0]),
    [cm(0.45), cm(0.38), cm(0.25)], [0.5, 0.5], 10, 6)];
  for (const side of [-1, 1]) {
    bow.push(cord([
      [0, knotY, z], [side * cm(1.5), knotY + cm(0.7), z + cm(0.15)],
      [side * cm(3.3), knotY + cm(0.4), z + cm(0.15)],
      [side * cm(3.5), knotY - cm(0.8), z + cm(0.1)],
      [side * cm(1.6), knotY - cm(0.7), z + cm(0.1)],
    ], cm(0.16), true, 6));
    bow.push(cord([
      [side * cm(0.35), knotY - cm(0.1), z],
      [side * cm(0.75), knotY - cm(3.5), z + cm(0.2)],
      [side * cm(0.55), knotY - cm(7.5 + (side > 0 ? 1 : 0)), z + cm(0.35)],
    ], cm(0.17), false, 6));
  }
  return [
    { mesh: band, material: mat('Loose shorts elastic waistband', null, { color: st.color, roughness: 0.96 }), smooth: true },
    ...(ribs.length ? [{ mesh: merge(ribs)!, material: mat('Loose shorts gathered stitching', null,
      { color: shade(st.color, 0.94), roughness: 0.96 }), smooth: true }] : []),
    // An untucked resort shirt covers this waistband. Leave the cords inside it instead of
    // drawing them through the shirt front; other tops still show the tied drawstring.
    ...(g.layered.topId === 'tropical_short_shirt' ? [] : [{ mesh: merge(bow)!, material: mat('Loose shorts white drawstring', null,
      { color: '#f8f7ef', roughness: 0.98 }), smooth: true }]),
  ];
}

function buildLooseShorts(g: GCtx, st: GarmentStyle): GPart[] {
  const fabric = shell(g, {
    covers: v => (isTrunk(v) && v.tt < 0.23) || (v.region === REGION.upperleg && v.t < 0.72),
    offset: v => cm(1.6) + (v.region === REGION.upperleg ? cm(1.8) * clamp(v.t / 0.72, 0, 1) : 0),
    tile: 0.2, relax: 5, edgeRelax: 18, preserveEdgeRadius: true, hemDepth: cm(0.3), edgeLoops: true,
  });
  if (!fabric) return [];
  // The thigh should remain visible inside the open hem. Opaque cloth hides it from outside.
  const covered = Uint8Array.from(fabric.covered);
  for (let f = 0; f < covered.length; f++) {
    if (!covered[f]) continue;
    const q = g.faceVerts.subarray(f * 4, f * 4 + 4);
    if ([...q].every(v => g.body.regions[v] === REGION.upperleg && g.body.info[v].t > 0.44)) covered[f] = 0;
  }
  const waist = (fabric.edgeLoops ?? []).reduce<Vec3[]>((best, loop) => {
    const height = (points: Vec3[]) => points.reduce((sum, p) => sum + p[1], 0) / points.length;
    return !best.length || height(loop) > height(best) ? loop : best;
  }, []);
  return [
    { mesh: fabric.mesh, material: cloth(g, 'Loose shorts fabric', st, { roughness: 0.95, doubleSided: true }), hides: covered, smooth: true },
    ...waistDetails(g, st, waist),
  ];
}

export const LOOSE_SHORTS: GarmentDef = {
  id: 'resort_shorts', label: 'Loose shorts', slot: 'bottom',
  patterns: ['linen', 'solid', 'tropical'], color: '#e3d5b6', color2: '#c9b68f', build: buildLooseShorts,
};
