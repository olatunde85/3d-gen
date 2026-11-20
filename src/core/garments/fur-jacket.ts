/** Open leather coat with a broad shearling collar and lapels. */
import type { Vec3 } from '../math';
import { cm, REGION, type VInfo } from './body';
import { cloth, isTrunk, points, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { hullRing, loftRings, v3 } from './ring';
import { cutShell } from './shell';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

function openFront(v: VInfo): number {
  // The gap persists from neck to hem; the black shirt stays visible beneath it.
  return Math.abs(v.theta) - (0.33 + 0.09 * Math.max(0, v.tt));
}

function coatField(v: VInfo): number {
  if (isTrunk(v)) return Math.min(v.tt - 0.13, 1.03 - v.tt, openFront(v));
  if (v.region === REGION.upperarm) return 1;
  if (v.region === REGION.lowerarm) return 0.94 - v.t;
  return -1;
}

function furField(v: VInfo): number {
  if (!isTrunk(v)) return -1;
  const a = Math.abs(v.theta);
  // Wide panels beside the opening flow up into the shoulder and rear collar.
  const outer = 0.49 + 0.52 * smooth((v.tt - 0.30) / 0.55);
  const lapel = Math.min(v.tt - 0.31, outer - a, a - (0.37 + 0.08 * Math.max(0, v.tt)));
  const acrossBack = smooth((a - 0.70) / (Math.PI - 0.70));
  const shoulder = Math.min(v.tt - (0.83 - 0.09 * acrossBack), a - 0.70, 1.03 - v.tt);
  return Math.max(lapel, shoulder);
}

function collarRoll(g: GCtx): ReturnType<typeof loftRings> | null {
  const b = g.body;
  const y = torsoY(b, 0.91);
  const ring = hullRing(points(b, v => isTrunk(v)),
    { origin: [0, y, b.L.torsoZ], normal: [0, 1, 0] },
    { slab: cm(3), samples: 72, offset: cm(2.0), arc: [0.65, Math.PI * 2 - 0.65] });
  if (!ring) return null;
  const centre: Vec3 = [0, y, b.L.torsoZ];
  const rings: Vec3[][] = Array.from({ length: 16 }, () => []);
  for (let j = 0; j < ring.length; j++) {
    const p = ring[j];
    const a = 0.65 + (Math.PI * 2 - 1.3) * j / (ring.length - 1);
    const back = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) / Math.PI;
    const dir = v3.norm([p[0] - centre[0], 0, p[2] - centre[2]]);
    const end = smooth(j / 8) * smooth((ring.length - 1 - j) / 8);
    const radialRadius = 0.15 + 4.3 * end;
    const riseRadius = 0.15 + 2.6 * end;
    for (let i = 0; i < rings.length; i++) {
      const t = i * Math.PI * 2 / rings.length;
      const radial = 3.9 * end + radialRadius * Math.cos(t);
      const rise = 0.5 + 4.5 * back + riseRadius * Math.sin(t);
      rings[i].push([
        p[0] + dir[0] * cm(radial),
        y + cm(rise),
        p[2] + dir[2] * cm(radial),
      ]);
    }
  }
  return loftRings(rings, { closedAround: false, closedAcross: true, tileU: 0.14, tileV: 0.12 });
}

function furJacket(g: GCtx, st: GarmentStyle): GPart[] {
  const coat = cutShell(g.body, g.faceVerts, {
    field: coatField, offset: cm(2.8), tile: 0.22, relax: 5, edgeSmooth: 3,
  });
  if (!coat) return [];
  const leather = cloth(g, 'Open leather coat', st, { roughness: 0.55, doubleSided: true });
  const fur = cloth(g, 'Full shearling collar and lapels', {
    pattern: 'shearling', color: st.color2, color2: '#8e755d',
  }, { roughness: 0.98, doubleSided: true });
  const result: GPart[] = [{ mesh: coat.mesh, material: leather, hides: coat.covered, smooth: true }];
  const lapels = cutShell(g.body, g.faceVerts, {
    field: furField, offset: cm(4.2), tile: 0.13, relax: 5, edgeSmooth: 4,
  });
  if (lapels) result.push({ mesh: lapels.mesh, material: fur, smooth: true });
  const roll = collarRoll(g);
  if (roll) result.push({ mesh: roll, material: { ...fur, name: 'Raised shearling collar' }, smooth: true });
  return result;
}

export const FUR_JACKET: GarmentDef = {
  id: 'fur_jacket', label: 'Fur-collar leather coat', slot: 'jacket',
  patterns: ['leather', 'solid'], color: '#352920', color2: '#c9ab86', build: furJacket,
};
