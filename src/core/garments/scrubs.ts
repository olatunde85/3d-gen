/**
 * A medical scrub top and a stethoscope. The scrub top is a loose, hip-length pull-on top with a V-neck, short sleeves,
 * and two lower patch pockets; the stethoscope lies round the back of the neck with its ends hanging
 * down the chest, the earpieces on one side and the chest piece on the other.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION, type Body, type VInfo } from './body';
import { isTrunk, mat, points, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, ellipsoid, frameOf, merge, v3 } from './ring';
import { cutShell } from './shell';
import { Caster } from './project';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** Positive below the neckline: a V at the front, a shallow scoop at the back. */
const neckline = (v: VInfo) => {
  const a = Math.abs(v.theta);
  const front = 0.76 + 0.2 * a;
  return Math.min(1.01, a < Math.PI / 2 ? front : 1.01) - v.tt;
};

/** Where the top goes, with a level hem across the hips (cut by height, not by the body's regions). */
function scrubField(b: Body) {
  const hem = b.L.hipY + cm(1);
  return (v: VInfo, p: Vec3) => {
    if (isTrunk(v)) return Math.min(neckline(v) * 4, (p[1] - hem) / cm(2.5));
    if (v.region === REGION.upperarm) return (0.42 - v.t) * 3;
    return -1;
  };
}

/** Loose and boxy: well off the body, more so towards the hem and the sleeve ends. */
const looseOffset = (v: VInfo) => v.region === REGION.upperarm ? cm(2) + cm(1.8) * clamp01(v.t / 0.42) : cm(2.2) + cm(2.2) * smooth((0.55 - v.tt) / 0.55);

/**
 * The tip of each breast: the frontmost point of the chest on each side. Loose cloth is drawn in a little there, so it
 * lies over the bust without picking up the nipple beneath.
 */
function bustTips(b: Body): Vec3[] {
  const tips: Vec3[] = [];
  for (const side of [-1, 1]) {
    let best: Vec3 | null = null;
    for (const p of points(b, v => isTrunk(v) && v.tt > 0.5 && v.tt < 0.9))
      if (p[0] * side > cm(3) && (!best || p[2] > best[2])) best = p;
    if (best) tips.push(best);
  }
  return tips;
}

function scrubTop(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, field = scrubField(b), tips = bustTips(b);
  const loose = (v: VInfo, p: Vec3) => looseOffset(v) - cm(1.1) * Math.max(0, ...tips.map(t => smooth(1 - Math.hypot(p[0] - t[0], p[1] - t[1], p[2] - t[2]) / cm(2.6))));
  const fabric = mat('Scrub top', null, { color: st.color, roughness: 0.9, doubleSided: true });
  const top = cutShell(b, g.faceVerts, {
    field,
    // Loose: further from the body at the hem and down the sleeves, so it hangs over the trousers.
    offset: loose, tile: 0.24, relax: 16, edgeSmooth: 4,
  });
  if (!top) return [];
  const parts: GPart[] = [{ mesh: top.mesh, material: fabric, hides: top.covered, smooth: true }];

  // Patch pockets: two low on the front, cut to shape on the top so they follow it.
  const sx = b.L.shoulderX;
  const front = (p: Vec3) => p[2] > b.L.torsoZ;
  const pocket = (name: string, shape: (p: Vec3) => number) => {
    const r = cutShell(b, g.faceVerts, {
      field: (v, p) => Math.min(field(v, p), front(p) ? shape(p) : -1),
      offset: (v, p) => loose(v, p) + cm(0.18), tile: 0.2, relax: 16, edgeSmooth: 1,
    });
    if (r) parts.push({ mesh: r.mesh, material: { ...fabric, name, color: st.color2 }, smooth: true });
  };
  const rect = (p: Vec3, x0: number, x1: number, y0: number, y1: number) => Math.min(p[0] - x0, x1 - p[0], p[1] - y0, y1 - p[1]);
  pocket('Scrub top lower pockets', p => rect([Math.abs(p[0]), p[1], p[2]], sx * 0.22, sx * 0.62, b.L.hipY + cm(6), b.L.hipY + cm(17)));
  return parts;
}

/** Chaikin smoothing of an open path, keeping its ends. */
function soften(path: Vec3[], passes = 2): Vec3[] {
  let p = path;
  for (let k = 0; k < passes; k++) {
    const out: Vec3[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) out.push(v3.add(v3.scale(p[i], 0.75), v3.scale(p[i + 1], 0.25)), v3.add(v3.scale(p[i], 0.25), v3.scale(p[i + 1], 0.75)));
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

function stethoscope(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const neck = points(b, v => v.region === REGION.neck);
  const nz = neck.reduce((s, p) => s + p[2], 0) / Math.max(1, neck.length);
  // A smooth oval round the base of the neck, just outside whatever collar is worn there, a little higher at the back.
  const base = neck.filter(p => Math.abs(p[1] - b.L.neckY) < cm(1.2));
  const halfX = Math.max(...base.map(p => Math.abs(p[0]))), backZ = Math.min(...base.map(p => p[2])), frontZ = Math.max(...base.map(p => p[2]));
  const out = (g.worn ?? []).some(p => Math.abs(p[1] - b.L.neckY) < cm(2) && Math.abs(p[0]) < halfX + cm(4)) ? cm(1.6) : cm(0.6);
  const loop = (a: number): Vec3 => {
    const c = Math.cos(a), behind = Math.max(0, -c);
    const z = c > 0 ? nz + (frontZ - nz + out) * c : nz - (nz - backZ + out + cm(0.6)) * behind;
    return [(halfX + out) * Math.sin(a), b.L.neckY + cm(0.6) + cm(2.2) * behind - cm(1.6) * Math.max(0, c), z];
  };
  const back: Vec3[] = [];
  for (let i = 0; i <= 36; i++) back.push(loop(1.45 + (Math.PI * 2 - 2.9) * i / 36));

  // Each end then hangs down the chest, lying on whatever is worn.
  const worn = merge((g.topParts ?? []).map(p => p.mesh));
  const surface = worn ? new Caster(worn, null, () => true, 'front') : new Caster(b, g.faceVerts, () => true, 'front');
  const hang = (start: Vec3, length: number, inward: number): { path: Vec3[]; end: Vec3; normal: Vec3 } => {
    const path: Vec3[] = [];
    let normal: Vec3 = [0, 0, 1], end = start;
    for (let d = cm(2); d <= length; d += cm(1.5)) {
      const t = d / length, x = start[0] * (1 - inward * smooth(t)), y = start[1] - d;
      const hit = surface.hit(x, y);
      end = hit ? v3.madd(hit.p, hit.n, cm(0.5)) : [x, y, start[2]];
      if (hit) normal = hit.n;
      path.push(end);
    }
    return { path, end, normal };
  };
  // From the sides of the neck each end runs forward over the collarbone and down the chest.
  const start = (p: Vec3): Vec3 => [p[0] * 0.92, p[1] - cm(2), p[2]];
  const left = hang(start(back[0]), cm(19), 0.25), right = hang(start(back[back.length - 1]), cm(29), 0.35);
  const tube = soften([...left.path.reverse(), ...back, ...right.path], 5);
  const rubber = mat('Stethoscope tubing', null, { color: st.color, roughness: 0.55 });
  const metal = mat('Stethoscope metal', null, { color: '#c9ccd1', metalness: 0.9, roughness: 0.28 });
  const parts: GPart[] = [{ mesh: cord(tube, cm(0.33), false, 8), material: rubber }];

  // Earpieces: two steel tubes splitting from the left end, with soft ear tips.
  const steel: PolyMesh[] = [], tips: PolyMesh[] = [];
  for (const s of [-1, 1]) {
    const mid = v3.add(left.end, [s * cm(2.2), -cm(5.5), cm(0.7)]);
    const tip = v3.add(left.end, [s * cm(2.8), -cm(9.5), cm(1)]);
    steel.push(cord(soften([left.end, mid, tip], 2), cm(0.14), false, 6));
    tips.push(ellipsoid(frameOf(tip, left.normal, [0, 1, 0]), [cm(0.6), cm(0.7), cm(0.6)], [0.5, 0.5], 10, 6));
  }
  // The chest piece on the right end: a round steel bell with a pale diaphragm facing out.
  const head = v3.madd(right.end, right.normal, cm(0.4));
  steel.push(ellipsoid(frameOf(head, right.normal, [0, 1, 0]), [cm(2), cm(2), cm(0.7)], [0.5, 0.5], 20, 10));
  parts.push({ mesh: merge(steel)!, material: { ...metal, doubleSided: true } });
  parts.push({ mesh: merge([...tips, ellipsoid(frameOf(v3.madd(head, right.normal, cm(0.45)), right.normal, [0, 1, 0]), [cm(1.6), cm(1.6), cm(0.3)], [0.5, 0.5], 18, 8)])!,
    material: mat('Stethoscope ear tips and diaphragm', null, { color: '#e9ebee', roughness: 0.5, doubleSided: true }) });
  return parts;
}

export const SCRUB_TOP: GarmentDef = {
  id: 'scrub_top', label: 'Scrub top (V-neck, short sleeves)', slot: 'top', patterns: ['solid'], color: '#1f9aa2', color2: '#1c8f97',
  colorLabels: ['Fabric', 'Pockets'], build: scrubTop,
};

export const STETHOSCOPE: GarmentDef = {
  id: 'stethoscope', label: 'Stethoscope', slot: 'acc', patterns: ['solid'], color: '#17181b', color2: '#c9ccd1',
  colorLabels: ['Tubing', 'Metal'], build: stethoscope,
};
