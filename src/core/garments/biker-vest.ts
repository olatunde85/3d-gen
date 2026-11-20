/**
 * Sleeveless, buttonless leather biker vest: open down the front, cut at the arm roots, a collar that lies flat around the
 * back of the neck and runs into narrow front facings, piped edges, a flapped chest pocket and a patch on each front panel,
 * and a large club patch across the back.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, type VInfo } from './body';
import { cloth, isTrunk, mat, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, merge } from './ring';
import { cutShell } from './shell';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** Positive on the vest's side of the front opening: the panels hang a hand's width apart, wider at the neck. */
const opening = (v: VInfo) => Math.abs(v.theta) - (0.25 + 0.33 * smooth((v.tt - 0.6) / 0.4));

/**
 * Where the vest goes: the trunk below the neck, open down the front, to the arm roots.
 */
function vestField(v: VInfo): number {
  if (isTrunk(v)) return Math.min((v.tt - 0.13) * 4, (1.02 - v.tt) * 4, opening(v) * 3);
  return -1;
}

function bikerVest(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, field = (v: VInfo, _p: Vec3) => vestField(v);
  const body = cutShell(b, g.faceVerts, { field, offset: (v: VInfo) => cm(2.4) + cm(1.1) * smooth((0.32 - v.tt) / 0.19), tile: 0.24, relax: 5, edgeSmooth: 4, edgeLoops: true });
  if (!body) return [];
  const leather = cloth(g, 'Biker vest leather', st, { roughness: 0.5, doubleSided: true });
  const parts: GPart[] = [{ mesh: body.mesh, material: leather, hides: body.covered, smooth: true }];

  // Collar and facings: a second layer of leather lying on the vest, around the back of the neck and down each edge.
  const collar = cutShell(b, g.faceVerts, {
    field: (v, p) => {
      const inside = field(v, p);
      if (inside < 0) return -1;
      const facing = Math.min(0.15 - opening(v), v.tt - 0.58);
      const back = v.tt - 0.9 - 0.04 * smooth((0.9 - Math.abs(v.theta)) / 0.4);
      return Math.min(inside, Math.max(facing, back));
    },
    offset: cm(2.75), tile: 0.2, relax: 5, edgeSmooth: 4, edgeLoops: true,
  });
  if (collar) parts.push({ mesh: collar.mesh, material: { ...leather, name: 'Biker vest collar and facings' }, smooth: true });

  // Piping along every edge of the vest and collar.
  const piping = mat('Biker vest edge piping', null, { color: '#151312', roughness: 0.45 });
  const edges: PolyMesh[] = [];
  for (const loop of [...(body.edgeLoops ?? []), ...(collar?.edgeLoops ?? [])]) if (loop.length > 7) edges.push(cord(loop, cm(0.2), true, 6));
  if (edges.length) parts.push({ mesh: merge(edges)!, material: piping });

  // Pockets, flaps and patches: thin leather and felt layers cut to shape on the vest, so they follow its surface.
  const layer = (name: string, shape: (p: Vec3) => number, offset: number, material: typeof leather, piped = false, edgeSmooth = 4, thread = piping) => {
    const r = cutShell(b, g.faceVerts, { field: (v, p) => Math.min(field(v, p), shape(p)), offset, tile: 0.12, relax: 5, edgeSmooth, edgeLoops: piped });
    if (!r) return;
    parts.push({ mesh: r.mesh, material: { ...material, name }, smooth: true });
    if (piped) parts.push({ mesh: merge((r.edgeLoops ?? []).filter(l => l.length > 7).map(l => cord(l, cm(0.14), true, 5)))!, material: { ...thread, name: `${name} stitching` } });
  };
  const front = (p: Vec3) => p[2] > b.L.torsoZ;
  /** Positive inside a rounded rectangle on one side of the chest. */
  const panel = (p: Vec3, x0: number, x1: number, y0: number, y1: number) =>
    front(p) ? Math.min(Math.abs(p[0]) - x0, x1 - Math.abs(p[0]), p[1] - y0, y1 - p[1]) : -1;
  const sx = b.L.shoulderX;
  layer('Biker vest chest pockets', p => panel(p, sx * 0.3, sx * 0.72, torsoY(b, 0.5), torsoY(b, 0.66)), cm(2.75), leather, true);
  layer('Biker vest pocket flaps', p => {
    const centre = sx * 0.51, half = sx * 0.23, ax = Math.abs(p[0]);
    // A flap with a shallow point at the middle of its lower edge.
    const bottom = torsoY(b, 0.6) - cm(1.2) * Math.max(0, 1 - Math.abs(ax - centre) / half);
    return front(p) ? Math.min(ax - (centre - half), centre + half - ax, p[1] - bottom, torsoY(b, 0.675) - p[1]) : -1;
  }, cm(3.2), leather, true);
  const badge = mat('Biker vest patches', null, { color: st.color2, roughness: 0.92 });
  layer('Biker vest front patches', p => front(p) ? 1 - Math.hypot((Math.abs(p[0]) - sx * 0.52) / cm(3.3), (p[1] - torsoY(b, 0.4)) / cm(2.7)) : -1, cm(2.95),
    mat('Biker vest front patches', null, { color: '#6e1f1c', roughness: 0.92 }), true, 4, { ...badge, roughness: 0.8 });

  // The club patch across the back: a top rocker arched over a round centre emblem, and a bottom rocker under it.
  const hub: Vec3 = [0, torsoY(b, 0.5), 0];
  const behind = (p: Vec3) => p[2] < b.L.torsoZ;
  const rocker = (p: Vec3, up: boolean, spread: number) => {
    const dx = p[0], dy = p[1] - hub[1], r = Math.hypot(dx, dy), a = Math.abs(Math.atan2(dx, up ? dy : -dy));
    return behind(p) ? Math.min(r - cm(9.2), cm(13.2) - r, (spread - a) * cm(10)) : -1;
  };
  layer('Biker vest club patch', p => behind(p) ? Math.max(
    cm(6.8) - Math.hypot(p[0], p[1] - hub[1]),
    rocker(p, true, 0.95),
    rocker(p, false, 0.62),
  ) : -1, cm(2.7), badge);
  layer('Biker vest club emblem', p => behind(p) ? Math.min(cm(5) - Math.hypot(p[0], p[1] - hub[1]), Math.hypot(p[0], p[1] - hub[1]) - cm(2.8)) : -1, cm(2.85), { ...leather });
  return parts;
}

export const BIKER_VEST: GarmentDef = {
  id: 'biker_vest', label: 'Biker leather vest', slot: 'jacket', preserveUnderJacket: true,
  patterns: ['leather', 'solid'], color: '#25201e', color2: '#aa8e6b', build: bikerVest,
};
