/**
 * Wrist accessories: bangles, gold and silver bracelet watches, and bead bracelets.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION, type Body } from './body';
import { limbRing, mat, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { along, cord, ellipsoid, frameOf, merge, roundedBox, v3 } from './ring';

/** A loop round the wrist (side s), `t` along the forearm, standing `gap` off the skin. */
function wristLoop(b: Body, s: number, t: number, gap: number): { ring: Vec3[]; centre: Vec3; dir: Vec3 } | null {
  const { ring, dir } = limbRing(b, REGION.lowerarm, s, t, gap, 40);
  if (!ring) return null;
  const [a, c] = b.axis(REGION.lowerarm, s);
  return { ring, centre: v3.lerp(a, c, t), dir };
}

const metal = (color: string, name: string) => mat(name, null, { color, roughness: 0.22, metalness: 0.95 });

/** Back of the hand's direction at wrist s (anatomical: from the forearm and thumb directions). */
function dorsal(b: Body, s: number): Vec3 {
  const [a, c] = b.axis(REGION.lowerarm, s);
  const side = s > 0 ? '.L' : '.R';
  const thumb = v3.sub(b.joint(`finger1-2${side}____head`), b.joint(`wrist${side}____head`));
  return v3.scale(v3.norm(v3.cross(v3.norm(v3.sub(c, a)), thumb)), -s);
}

/** Thin round bangles on the right wrist (the watch and beads go on the left), hanging loose. */
function bangles(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const rings: PolyMesh[] = [];
  for (const [s, ts] of [[-1, [0.85, 0.89, 0.93]]] as const)
    for (const [i, t] of ts.entries()) {
      const l = wristLoop(b, s, t, cm(0.55) + i * cm(0.05));
      if (l) rings.push(cord(l.ring, cm(0.22), true, 8));
    }
  return rings.length ? [{ mesh: merge(rings)!, material: metal(st.color, 'Bangles') }] : [];
}

/** Bracelet watch on the left wrist: link band and a round face with a bezel. */
function braceletWatch(g: GCtx, st: GarmentStyle, label: string): GPart[] {
  const b = g.body;
  const l = wristLoop(b, 1, 0.94, cm(0.15));
  if (!l) return [];
  const links: PolyMesh[] = [];
  for (const { p } of along(l.ring, cm(0.42), true)) {
    const out = v3.norm(v3.sub(p, l.centre));
    links.push(roundedBox(frameOf(v3.madd(p, out, cm(0.12)), out, l.dir), [cm(0.3), cm(0.85), cm(0.14)], 0.5));
  }
  // Face on the back of the wrist.
  const back = dorsal(b, 1);
  let top = l.ring[0];
  for (const p of l.ring) if (v3.dot(v3.sub(p, l.centre), back) > v3.dot(v3.sub(top, l.centre), back)) top = p;
  const out = v3.norm(v3.sub(top, l.centre));
  const f = frameOf(v3.madd(top, out, cm(0.3)), out, l.dir);
  const bezel = ellipsoid(f, [cm(1.5), cm(1.5), cm(0.36)], [0.5, 0.5], 40, 8);
  const face = ellipsoid(frameOf(v3.madd(top, out, cm(0.52)), out, l.dir), [cm(1.22), cm(1.22), cm(0.14)], [0.5, 0.5], 40, 6);
  // Hands at ten past ten.
  const hc = v3.madd(top, out, cm(0.68));
  const hand = (a: number, len: number) => {
    const d = v3.add(v3.scale(f.y, Math.cos(a)), v3.scale(f.x, Math.sin(a)));
    return roundedBox(frameOf(v3.madd(hc, d, len / 2), out, d), [cm(0.07), len / 2, cm(0.03)], 0);
  };
  return [
    { mesh: merge([...links, bezel, hand(-1.05, cm(0.8)), hand(1.05, cm(1.05))])!, material: metal(st.color, label) },
    { mesh: face, material: mat('Watch face', null, { color: st.color2, roughness: 0.15, metalness: 0.2 }) },
  ];
}

/** Bead bracelets: two strands on the left forearm, above the watch. */
function wristBeads(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const beads: PolyMesh[] = [], spacers: PolyMesh[] = [];
  for (const [t, r] of [[0.74, cm(0.42)], [0.79, cm(0.36)]] as const) {
    const l = wristLoop(b, 1, t, cm(0.3) + r);
    if (!l) continue;
    for (const { p, tangent, i } of along(l.ring, r * 2.05, true)) {
      const out = v3.norm(v3.sub(p, l.centre));
      const f = frameOf(p, out, tangent);
      const spacer = i % 8 === 7;
      (spacer ? spacers : beads).push(ellipsoid({ o: f.o, x: f.y, y: f.x, z: f.z }, spacer ? [r * 0.7, r * 0.55, r * 0.7] : [r, r, r], [0.5, 0.5], 8, 5));
    }
  }
  return [
    ...(beads.length ? [{ mesh: merge(beads)!, material: mat('Wrist beads', null, { color: st.color, roughness: 0.3 }) }] : []),
    ...(spacers.length ? [{ mesh: merge(spacers)!, material: metal(st.color2, 'Bead spacers') }] : []),
  ];
}

export const WRIST: GarmentDef[] = [
  { id: 'bangles', label: 'Bangles', slot: 'acc', patterns: ['solid'], color: '#d9a441', color2: '#000000', build: bangles },
  { id: 'watch_gold', label: 'Gold watch', slot: 'acc', patterns: ['solid'], color: '#d9a441', color2: '#f4efe4', build: (g, st) => braceletWatch(g, st, 'Gold watch') },
  { id: 'watch_silver', label: 'Silver watch', slot: 'acc', patterns: ['solid'], color: '#c9ccd1', color2: '#1b2433', build: (g, st) => braceletWatch(g, st, 'Silver watch') },
  { id: 'wrist_beads', label: 'Wrist beads', slot: 'acc', patterns: ['solid'], color: '#c8322a', color2: '#d9a441', build: wristBeads },
];
