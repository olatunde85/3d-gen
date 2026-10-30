/**
 * Wrist and hand accessories: bangles, gold and silver bracelet watches, bead bracelets, a gold
 * signet ring and leather gloves.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION, type Body } from './body';
import { clamp, cloth, limbBand, limbRing, mat, shell, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { along, cord, ellipsoid, frameOf, hullRing, merge, roundedBox, v3 } from './ring';

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

/**
 * Gold signet ring on the right ring finger: a band round the finger's first joint, sized to the
 * finger, with a flat oval face on its back.
 */
function signetRing(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, s = -1;
  const a = b.joint('finger4-1.R____head'), c = b.joint('finger4-1.R____tail');
  const dir = v3.norm(v3.sub(c, a)), o = v3.lerp(a, c, 0.45);
  // The finger's surface round that point: hand vertices close to the bone there.
  const near = b.verts(REGION.hand, s).map((v) => b.p(v)).filter((p) => {
    const d = v3.sub(p, o), along = v3.dot(d, dir);
    return Math.abs(along) < cm(0.4) && v3.len(v3.madd(d, dir, -along)) < cm(1.1);
  });
  const ring = hullRing(near, { origin: o, normal: dir }, { slab: cm(0.4), samples: 32, offset: cm(0.12) });
  if (!ring) return [];
  const up = dorsal(b, s);
  let top = ring[0];
  for (const p of ring) if (v3.dot(v3.sub(p, o), up) > v3.dot(v3.sub(top, o), up)) top = p;
  const face = ellipsoid(frameOf(v3.madd(top, up, cm(0.12)), up, dir), [cm(0.55), cm(0.45), cm(0.14)], [0.5, 0.5], 12, 5);
  const mesh = merge([cord([...ring, ring[0]], cm(0.13), false, 8), face])!;
  const at = new Float32Array(mesh.positions.length);
  for (let i = 0; i < at.length; i += 3) at.set(o, i);
  return [{ mesh, material: metal(st.color, 'Gold ring'), skinAt: at }];
}

/**
 * Leather gloves: fitted over the hands and up over the wrists, a little fuller at the cuff, with a
 * seam line along the back of each hand.
 */
function gloves(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const m = cloth(g, 'Gloves', st, { roughness: 0.38 });
  const r = shell(g, {
    covers: (v) => v.region === REGION.hand || (v.region === REGION.lowerarm && v.t > 0.82),
    offset: (v) => (v.region === REGION.lowerarm ? cm(0.25) + cm(0.25) * clamp((0.92 - v.t) / 0.1, 0, 1) : cm(0.12)),
    tile: 0.08, relax: 1, hemDepth: cm(0.2),
  });
  if (!r) return [];
  const cuffs = merge([1, -1].map((s) => limbBand(b, REGION.lowerarm, s, 0.83, cm(0.9), cm(0.15), cm(0.45))));
  return [{ mesh: r.mesh, material: m, hides: r.covered, smooth: true }, ...(cuffs ? [{ mesh: cuffs, material: m }] : [])];
}

export const WRIST: GarmentDef[] = [
  { id: 'gloves', label: 'Leather gloves', slot: 'acc', patterns: ['nappa', 'leather'], color: '#121212', color2: '#000000', build: gloves },
  { id: 'gold_ring', label: 'Gold signet ring', slot: 'acc', patterns: ['solid'], color: '#d9a441', color2: '#000000', build: signetRing },
  { id: 'bangles', label: 'Bangles', slot: 'acc', patterns: ['solid'], color: '#d9a441', color2: '#000000', build: bangles },
  { id: 'watch_gold', label: 'Gold watch', slot: 'acc', patterns: ['solid'], color: '#d9a441', color2: '#f4efe4', build: (g, st) => braceletWatch(g, st, 'Gold watch') },
  { id: 'watch_silver', label: 'Silver watch', slot: 'acc', patterns: ['solid'], color: '#c9ccd1', color2: '#1b2433', build: (g, st) => braceletWatch(g, st, 'Silver watch') },
  { id: 'wrist_beads', label: 'Wrist beads', slot: 'acc', patterns: ['solid'], color: '#c8322a', color2: '#d9a441', build: wristBeads },
];
