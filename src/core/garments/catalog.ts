/**
 * Procedural garment catalog: tops, bottoms, footwear and accessories built
 * on the morphed body (see body.ts / shell.ts / ring.ts, helpers in kit.ts).
 * Everything is in MakeHuman decimetres; human.ts converts to metres with the
 * rest of the mesh.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import type { Material } from '../mesh';
import { cm, noise3, REGION } from './body';
import {
  beads, briefsUnder, clamp, cloth, hplane, isTrunk, isUpper, leatherStyle, limbBand, limbRing, mat, points, ringAt, shell, shellPart,
  skirt, strapPlane, strapPoints, torsoY, GOLD, STEEL, Y, Z, type GarmentDef, type GarmentStyle, type GCtx, type GPart,
} from './kit';
import { along, card, cord, ellipsoid, frameOf, hullRing, loftRings, merge, orientOutward, roundedBox, solidBand, v3, type Plane } from './ring';
import { buildShell } from './shell';
import { featherTexture, makePattern, palette, type Pattern } from './textures';
import { HEELS } from './heels';
import { WRIST } from './wrist';
import { YORUBA } from './yoruba';

export type { GarmentDef, GarmentStyle, GCtx, GPart, Slot } from './kit';

const MAASAI_BEADS = ['#d62828', '#f4f1ea', '#1d4fbf', '#f2a516', '#2a8c4a', '#f4f1ea', '#111111'];

/** Uniform shirt (tucked in, collar, epaulettes in the accent colour), short or long sleeved. */
function uniformShirt(g: GCtx, st: GarmentStyle, long: boolean): GPart[] {
  const b = g.body;
  const tn = cm(2.2) / (b.L.neckY - b.L.hipY);
  const m = cloth(g, 'Uniform shirt', st);
  const body = shellPart(g, {
    // Short sleeves end above the elbow (loose at the cuff); long sleeves reach the wrist.
    covers: (v) => (isTrunk(v) && v.t > 0.2) || (v.region === REGION.neck && v.t < 1 + tn) ||
      (v.region === REGION.upperarm && (long || v.t < 0.58)) || (long && v.region === REGION.lowerarm && v.t < 0.93),
    offset: (v) => cm(1.0) + (!long && v.region === REGION.upperarm ? cm(1.1) * clamp(v.t / 0.58, 0, 1) : 0), tile: 0.3, relax: 3,
  }, m);
  // Epaulettes (accent colour) on the shoulder tops, placed on the shirt's outer surface.
  const P = body[0]?.mesh.positions ?? new Float32Array();
  const trunk: Vec3[] = [];
  for (let i = 0; i < P.length; i += 3) trunk.push([P[i], P[i + 1], P[i + 2]]);
  const straps: PolyMesh[] = [];
  // Highest shirt point across the shoulder at lateral distance x (on the shoulder's crest).
  const topAt = (x: number): Vec3 | null => {
    let top: Vec3 | null = null;
    for (const q of trunk) if (Math.abs(q[0] - x) < cm(1.2) && Math.abs(q[2] - b.L.torsoZ) < cm(6) && (!top || q[1] > top[1])) top = q;
    return top;
  };
  for (const sgn of [1, -1]) {
    const a = topAt(0.45 * b.L.shoulderX * sgn), c = topAt(0.88 * b.L.shoulderX * sgn);
    if (!a || !c) continue;
    // Lie along the sloping shoulder line, just on top of the shirt.
    const along = v3.norm(v3.sub(c, a));
    let up = v3.norm(v3.cross(Z, along));
    if (up[1] < 0) up = v3.scale(up, -1);
    const mid = v3.add(v3.scale(v3.add(a, c), 0.5), v3.scale(up, cm(0.3)));
    straps.push(roundedBox(frameOf(mid, up, along), [cm(2.2), v3.len(v3.sub(c, a)) / 2, cm(0.25)], 0.5));
  }
  return [
    ...body,
    ...(straps.length ? [{ mesh: merge(straps)!, material: mat('Epaulettes', null, { color: st.color2, roughness: 0.5, metalness: 0.3 }) }] : []),
  ];
}

// --- Garments ---------------------------------------------------------------------


export const GARMENTS: GarmentDef[] = [
  // ---------------- Tops
  {
    id: 'tank_top', label: 'Tank top', slot: 'top', patterns: ['solid', 'khaki', 'camo', 'tattered'], color: '#3f6b5a', color2: '#2a2a2a',
    build: (g, st) => {
      const sx = g.body.L.shoulderX;
      return shellPart(g, {
        // Body up to the chest line, plus two straps over the shoulders.
        covers: (v) => isUpper(v) && v.tt >= 0.16 && (v.tt < 0.74 || Math.abs(v.ax - 0.6 * sx) < 0.2 * sx),
        offset: cm(0.5), tile: 0.2, relax: 4,
      }, cloth(g, 'Tank top', st));
    },
  },
  {
    id: 'fatigue_shirt', label: 'Fatigue shirt', slot: 'top', patterns: ['camo', 'solid', 'khaki'], color: '#5b6b3a', color2: '#8a7d55',
    build: (g, st) => {
      const tn = cm(2.5) / (g.body.L.neckY - g.body.L.hipY);
      return shellPart(g, {
        covers: (v) => (isTrunk(v) && v.t > 0.14) || (v.region === REGION.neck && v.t < 1 + tn) || v.region === REGION.upperarm || (v.region === REGION.lowerarm && v.t < 0.93),
        offset: cm(1.0), tile: 0.3, relax: 3,
      }, cloth(g, 'Fatigue shirt', st));
    },
  },
  {
    id: 'uniform_shirt', label: 'Uniform shirt (short sleeves)', slot: 'top', patterns: ['solid', 'khaki', 'camo'], color: '#16181d', color2: '#2a2c31',
    build: (g, st) => uniformShirt(g, st, false),
  },
  {
    id: 'uniform_shirt_long', label: 'Uniform shirt (long sleeves)', slot: 'top', patterns: ['solid', 'khaki', 'camo'], color: '#16181d', color2: '#2a2c31',
    build: (g, st) => uniformShirt(g, st, true),
  },
  {
    id: 'techwear_jacket', label: 'Techwear jacket', slot: 'top', patterns: ['techwear', 'solid'], color: '#1b1d22', color2: '#00e5ff',
    build: (g, st) => {
      const tn = cm(5.5) / (g.body.L.neckY - g.body.L.hipY);
      return shellPart(g, {
        covers: (v) => (isTrunk(v) && v.t > 0.02) || (v.region === REGION.neck && v.t < 1 + tn) || v.region === REGION.upperarm || (v.region === REGION.lowerarm && v.t < 0.97),
        offset: (v) => cm(1.3) + (isTrunk(v) ? cm(0.8) * clamp(0.5 - v.t, 0, 0.5) : 0), tile: 0.35,
      }, cloth(g, 'Techwear jacket', st));
    },
  },
  {
    id: 'tattered_shirt', label: 'Tattered shirt', slot: 'top', patterns: ['tattered', 'solid'], color: '#8a7a5c', color2: '#000000',
    build: (g, st) =>
      shellPart(g, {
        covers: (v, p) => {
          const n = noise3(p[0] * 4, p[1] * 4, p[2] * 4);
          return (isUpper(v) && v.tt > 0.12 + 0.12 * n && !(v.tt > 0.82 && Math.abs(v.tth) < 0.7 && v.ax < 0.4)) || (v.region === REGION.upperarm && v.t < 0.3 + 0.25 * n);
        },
        offset: cm(0.9), tile: 0.3,
      }, cloth(g, 'Tattered shirt', st), false).map((p) => ({ ...p, material: { ...p.material, doubleSided: true } })),
  },
  {
    id: 'tunic', label: 'Sleeveless tunic', slot: 'top', patterns: ['asooke', 'kente', 'ankara', 'solid', 'leather'], color: '#2c3e7a', color2: '#d9b25f',
    build: (g, st) => {
      const b = g.body;
      const m = cloth(g, 'Tunic', st);
      const top = shell(g, {
        covers: (v) => isUpper(v) && v.tt >= 0.3 && !(v.tt > 0.86 && v.ax < 0.42 * b.L.shoulderX) && !(v.tt > 0.76 && v.ax > 0.8 * b.L.shoulderX),
        offset: cm(0.9), tile: 0.25, relax: 4,
      });
      const knee = b.joint('lowerleg01.L____head')[1];
      const sk = skirt(b, torsoY(b, 0.34), b.L.hipY - (b.L.hipY - knee) * 0.45, cm(1.4), 0.06);
      return [
        ...(top ? [{ mesh: top.mesh, material: m, hides: top.covered, smooth: true }] : []),
        ...(sk ? [{ mesh: sk, material: { ...m, doubleSided: true } }] : []),
      ];
    },
  },
  {
    id: 'long_tunic', label: 'Woven tunic (buba)', slot: 'top', patterns: ['asooke', 'kente', 'ankara', 'solid'], color: '#5a1e3c', color2: '#e0c070',
    build: (g, st) => {
      const b = g.body;
      const m = cloth(g, 'Woven tunic', st);
      const top = shell(g, {
        covers: (v) => (isUpper(v) && v.tt >= 0.3 && !(v.tt > 0.86 && v.ax < 0.42 * b.L.shoulderX)) || v.region === REGION.upperarm || (v.region === REGION.lowerarm && v.t < 0.12),
        offset: (v) => (v.region === REGION.upperarm || v.region === REGION.lowerarm ? cm(1.8) : cm(1.4)), tile: 0.25, relax: 5,
      });
      const knee = b.joint('lowerleg01.L____head')[1];
      const sk = skirt(b, torsoY(b, 0.34), b.L.hipY - (b.L.hipY - knee) * 0.7, cm(1.9), 0.08);
      return [
        ...(top ? [{ mesh: top.mesh, material: m, hides: top.covered, smooth: true }] : []),
        ...(sk ? [{ mesh: sk, material: { ...m, doubleSided: true } }] : []),
      ];
    },
  },

  // ---------------- Bottoms
  {
    id: 'briefs', label: 'Briefs', slot: 'bottom', patterns: ['solid'], color: '#3a3a3a', color2: '#000000',
    build: (g, st) => shellPart(g, {
      covers: (v) => (isTrunk(v) && v.t < 0.12) || (v.region === REGION.upperleg && v.t < 0.1),
      offset: cm(0.3), tile: 0.2,
    }, cloth(g, 'Briefs', st)),
  },
  {
    id: 'cargo_shorts', label: 'Cargo shorts', slot: 'bottom', patterns: ['khaki', 'camo', 'solid'], color: '#a8916a', color2: '#6b5a3a',
    build: (g, st) => {
      const m = cloth(g, 'Cargo shorts', st);
      const parts = shellPart(g, {
        covers: (v) => (isTrunk(v) && v.t < 0.24) || (v.region === REGION.upperleg && v.t < 0.55),
        offset: (v) => cm(0.6) + (v.region === REGION.upperleg ? cm(1.0) * v.t : 0), tile: 0.25,
      }, m);
      return [...parts, ...cargoPockets(g, 0.4, m)];
    },
  },
  {
    id: 'fatigue_pants', label: 'Fatigue pants', slot: 'bottom', patterns: ['camo', 'khaki', 'solid'], color: '#5b6b3a', color2: '#8a7d55',
    build: (g, st) => {
      const m = cloth(g, 'Fatigue pants', st);
      return [...shellPart(g, {
        covers: (v) => (isTrunk(v) && v.t < 0.26) || v.region === REGION.upperleg || (v.region === REGION.lowerleg && v.t < 0.85),
        offset: cm(0.9), tile: 0.3,
      }, m), ...cargoPockets(g, 0.55, m)];
    },
  },
  {
    id: 'uniform_trousers', label: 'Uniform trousers', slot: 'bottom', patterns: ['solid', 'khaki', 'camo'], color: '#16181d', color2: '#c9a24a',
    build: (g, st) => shellPart(g, {
      covers: (v) => (isTrunk(v) && v.t < 0.26) || v.region === REGION.upperleg || (v.region === REGION.lowerleg && v.t < 0.9),
      offset: (v) => cm(0.8) + (v.region === REGION.lowerleg ? cm(0.6) * v.t : 0), tile: 0.3,
    }, cloth(g, 'Uniform trousers', st)),
  },
  {
    id: 'techwear_pants', label: 'Techwear pants', slot: 'bottom', patterns: ['techwear', 'solid'], color: '#202228', color2: '#00e5ff',
    build: (g, st) => {
      const m = cloth(g, 'Techwear pants', st);
      const b = g.body;
      const straps = merge([1, -1].flatMap((s) => [limbBand(b, REGION.upperleg, s, 0.5, cm(2.2), cm(0.35), cm(1.1)), limbBand(b, REGION.upperleg, s, 0.62, cm(2.2), cm(0.35), cm(1.1))]));
      return [
        ...shellPart(g, {
          covers: (v) => (isTrunk(v) && v.t < 0.26) || v.region === REGION.upperleg || (v.region === REGION.lowerleg && v.t < 0.95),
          offset: cm(0.8), tile: 0.35,
        }, m),
        ...(straps ? [{ mesh: straps, material: mat('Straps', g.texture('leather_#151515', () => makePattern('leather', '#151515', '#000000')), { roughness: 0.5 }) }] : []),
      ];
    },
  },
  {
    id: 'tattered_pants', label: 'Tattered pants', slot: 'bottom', patterns: ['tattered', 'solid', 'khaki'], color: '#6b5d48', color2: '#000000',
    build: (g, st) => shellPart(g, {
      covers: (v, p) => (isTrunk(v) && v.t < 0.24) || v.region === REGION.upperleg || (v.region === REGION.lowerleg && v.t < 0.55 + 0.25 * noise3(p[0] * 5, p[1] * 5, p[2] * 5)),
      offset: (v) => cm(0.8) + (v.region === REGION.lowerleg ? cm(0.8) * v.t : 0), tile: 0.3,
    }, { ...cloth(g, 'Tattered pants', st), doubleSided: true }, false),
  },
  {
    id: 'trousers', label: 'Loose trousers (sokoto)', slot: 'bottom', patterns: ['asooke', 'solid', 'ankara', 'kente'], color: '#5a1e3c', color2: '#e0c070',
    build: (g, st) => shellPart(g, {
      covers: (v) => (isTrunk(v) && v.t < 0.26) || v.region === REGION.upperleg || (v.region === REGION.lowerleg && v.t < 0.93),
      offset: (v) => cm(1.0) + (v.region === REGION.lowerleg ? cm(1.2) * v.t : v.region === REGION.upperleg ? cm(0.6) : 0), tile: 0.25,
    }, cloth(g, 'Trousers', st)),
  },
  {
    id: 'wrapper_long', label: 'Wrapper (ankle length)', slot: 'bottom', patterns: ['ankara', 'kente', 'asooke', 'shuka', 'solid'], color: '#e05a1a', color2: '#1d3f8f',
    build: (g, st) => wrapper(g, st, 'long'),
  },
  {
    id: 'wrapper_knee', label: 'Wrapper (knee length)', slot: 'bottom', patterns: ['shuka', 'ankara', 'kente', 'asooke', 'solid', 'hide'], color: '#c81e1e', color2: '#1a2a6a',
    build: (g, st) => wrapper(g, st, 'knee'),
  },
  {
    id: 'hide_aprons', label: 'Hide aprons (isinene & ibheshu)', slot: 'bottom', patterns: ['hide', 'leopard', 'leather'], color: '#5a3a22', color2: '#1a1410',
    build: (g, st) => {
      const b = g.body;
      const knee = b.joint('lowerleg01.L____head')[1];
      const top = torsoY(b, 0.2);
      const m = { ...cloth(g, 'Hide aprons', st), doubleSided: true, roughness: 0.8 };
      const front = skirt(b, top, b.L.hipY - (b.L.hipY - knee) * 0.5, cm(1.2), 0.04, [-0.85, 0.85], 16);
      const back = skirt(b, top, knee + cm(2), cm(1.2), 0.05, [Math.PI - 1.3, Math.PI + 1.3], 20);
      const band = solidBand(points(b, isTrunk), hplane(b, top + cm(1)), cm(3), cm(0.5), cm(1.2), { samples: 40, tileU: 0.1 });
      return [
        ...(front ? [{ mesh: front, material: m }] : []),
        ...(back ? [{ mesh: back, material: m }] : []),
        ...(band ? [{ mesh: band, material: cloth(g, 'Waist cord', leatherStyle('#3a2414')) }] : []),
        ...briefsUnder(g),
      ];
    },
  },

  {
    id: 'loincloth', label: 'Loincloth (front & back panels)', slot: 'bottom', patterns: ['adire', 'kente', 'asooke', 'ankara', 'leather', 'hide', 'solid'],
    color: '#13234f', color2: '#3b9cff',
    build: (g, st) => {
      const b = g.body;
      const knee = b.joint('lowerleg01.L____head')[1];
      const trunk = points(b, isTrunk);
      const dark = mat('Loincloth trim', g.texture(`solid_${st.color}_dark`, () => makePattern('solid', '#0d1426', '#000000')), { roughness: 0.7 });
      const orange = mat('Loincloth stripe', null, { color: '#d2692d', roughness: 0.6 });
      const panelPattern: Pattern = st.pattern === 'adire' ? 'adire_panel' : st.pattern;
      const body = cloth(g, 'Loincloth', st);
      const panel: Material = { ...cloth(g, 'Loincloth panels', { ...st, pattern: panelPattern }), doubleSided: true };
      const band = (t: number, width: number, thick: number, off: number) =>
        solidBand(trunk, hplane(b, torsoY(b, t)), width, thick, off, { samples: 56, tileU: 0.18 });
      // Layered waist roll: dark roll, orange stripe, patterned band, dark roll.
      const rolls = merge([band(0.3, cm(3), cm(1.5), cm(1.1)), band(0.135, cm(2.4), cm(1.3), cm(1.2))]);
      const stripe = band(0.262, cm(0.7), cm(0.35), cm(2.2));
      const sash = band(0.2, cm(4.6), cm(0.9), cm(1.4));
      const top = torsoY(b, 0.15);
      const frontLen = (b.L.hipY - knee) * 0.62 + (top - b.L.hipY);
      const backLen = top - (knee + cm(5));
      const wings = skirt(b, top, top - cm(9), cm(1.5), 0.06, [-1.35, 1.35], 30, { tileV: 0.3 });
      const front = skirt(b, top, top - frontLen, cm(2.3), 0.015, [-0.4, 0.4], 8, { uRepeats: 1, tileV: frontLen * 0.1 });
      const back = skirt(b, top, top - backLen, cm(2.0), 0.035, [Math.PI - 1.1, Math.PI + 1.1], 18, { uRepeats: 1, tileV: backLen * 0.1 });
      // Long side tails hanging from the waist roll.
      const ring = hullRing(trunk, hplane(b, torsoY(b, 0.13)), { slab: cm(2), samples: 64, offset: cm(2.4) });
      const tails: PolyMesh[] = [];
      if (ring)
        for (const a of [1.45, 1.75, -1.45, -1.75]) {
          const r = ringAt(ring, a);
          tails.push(card(r.p, v3.norm(v3.add([0, -1, 0], v3.scale(r.out, 0.08))), r.tan, cm(Math.abs(a) > 1.6 ? 40 : 34), cm(3.2), 0.8, 6));
        }
      return [
        ...(rolls ? [{ mesh: rolls, material: dark }] : []),
        ...(stripe ? [{ mesh: stripe, material: orange }] : []),
        ...(sash ? [{ mesh: sash, material: body }] : []),
        ...(wings ? [{ mesh: wings, material: { ...body, name: 'Loincloth hip panels', color: '#7c86a0', doubleSided: true } }] : []),
        ...(front ? [{ mesh: front, material: panel }] : []),
        ...(back ? [{ mesh: back, material: panel }] : []),
        ...(tails.length ? [{ mesh: merge(tails)!, material: { ...dark, doubleSided: true } }] : []),
        ...briefsUnder(g),
      ];
    },
  },

  // ---------------- Accessories
  {
    id: 'belt', label: 'Leather belt', slot: 'acc', patterns: ['leather'], color: '#4a2f1a', color2: '#000000',
    build: (g, st) => belt(g, st, cm(4), false),
  },
  {
    id: 'utility_belt', label: 'Utility belt', slot: 'acc', patterns: ['leather', 'khaki'], color: '#3d2b1c', color2: '#000000',
    build: (g, st) => belt(g, st, cm(5), true),
  },
  {
    id: 'waist_sash', label: 'Waist sash', slot: 'acc', patterns: ['kente', 'asooke', 'solid', 'ankara', 'shuka'], color: '#b31b1b', color2: '#f2c14e',
    build: (g, st) => {
      const b = g.body;
      const y = torsoY(b, 0.3);
      const m = { ...cloth(g, 'Waist sash', st), doubleSided: true };
      const off = cm(1.6) + (g.layered.bottom || g.layered.top ? cm(1.2) : 0);
      const band = solidBand(points(b, isTrunk), hplane(b, y), cm(9), cm(0.6), off, { samples: 48, tileU: 0.2, steps: 3 });
      const ring = hullRing(points(b, isTrunk), hplane(b, y - cm(2)), { slab: cm(2), samples: 48, offset: off + cm(0.7) });
      const tails: PolyMesh[] = [];
      if (ring) {
        const knot = ringAt(ring, 1.35);
        for (const [dx, len] of [[-0.6, 32], [0.7, 26]] as const) {
          const base = v3.madd(knot.p, knot.tan, cm(dx * 4));
          tails.push(card(base, v3.norm(v3.add([0, -1, 0], v3.scale(knot.out, 0.12))), knot.tan, cm(len), cm(8), 0.85, 6));
        }
      }
      return [...(band ? [{ mesh: band, material: m }] : []), ...(tails.length ? [{ mesh: merge(tails)!, material: m }] : [])];
    },
  },
  {
    id: 'shoulder_drape', label: 'Shoulder drape (shuka)', slot: 'acc', patterns: ['shuka', 'kente', 'ankara', 'solid'], color: '#c81e1e', color2: '#1a2a6a',
    build: (g, st) => {
      const b = g.body;
      const pl = strapPlane(b, 1, 0.75);
      const pts = strapPoints(b, 1);
      const rings: Vec3[][] = [];
      const off = cm(1.6) + (g.layered.top ? cm(1.4) : 0);
      for (let k = 0; k <= 5; k++) {
        const r = hullRing(pts, { ...pl, origin: v3.madd(pl.origin, pl.normal, (k / 5 - 0.5) * cm(22)) }, { slab: cm(2), samples: 56, offset: off + cm(0.2) * k });
        if (r) rings.push(r);
      }
      if (rings.length < 2) return [];
      return [{ mesh: orientOutward(loftRings(rings, { closedAround: true, tileU: 0.3, tileV: 0.3 }), pl.origin), material: { ...cloth(g, 'Shoulder drape', st), doubleSided: true } }];
    },
  },
  {
    id: 'crossed_straps', label: 'Crossed leather straps', slot: 'acc', patterns: ['leather'], color: '#3d2414', color2: '#000000',
    build: (g, st) => {
      const b = g.body;
      const base = cm(1.1) + (g.layered.top ? cm(1.6) : 0);
      const m = cloth(g, 'Crossed straps', st);
      const straps = merge([1, -1].map((s, i) => solidBand(strapPoints(b, s), strapPlane(b, s), cm(4.5), cm(0.45), base + i * cm(0.5), { samples: 56, tileU: 0.15 })));
      return straps ? [{ mesh: straps, material: m }] : [];
    },
  },
  {
    id: 'amulet_bandolier', label: 'Amulet bandolier', slot: 'acc', patterns: ['leather'], color: '#4a2a14', color2: '#000000',
    build: (g, st) => {
      const b = g.body;
      const base = cm(0.9) + (g.layered.top ? cm(1.1) : 0);
      const pl = strapPlane(b, -1);
      const pts = strapPoints(b, -1);
      const strap = solidBand(pts, pl, cm(3.5), cm(0.4), base, { samples: 56, tileU: 0.15 });
      const ring = hullRing(pts, pl, { slab: cm(1.5), samples: 72, offset: base + cm(1.1) });
      const pouches: PolyMesh[] = [];
      if (ring) for (const a of [-0.9, -0.55, -0.2, 0.15, 0.5]) {
        const r = ringAt(ring, a);
        pouches.push(roundedBox(frameOf(r.p, r.out, r.tan), [cm(1.4), cm(1.9), cm(0.6)]));
      }
      const m = cloth(g, 'Amulet bandolier', st);
      return [...(strap ? [{ mesh: strap, material: m }] : []), ...(pouches.length ? [{ mesh: merge(pouches)!, material: cloth(g, 'Amulets', leatherStyle('#6b4426')) }] : [])];
    },
  },
  {
    id: 'leather_armor', label: 'Leather armor', slot: 'acc', patterns: ['leather'], color: '#5a3820', color2: '#000000',
    build: (g, st) => {
      const off = g.layered.top ? cm(2.4) : cm(1.2);
      const m = cloth(g, 'Leather armor', st, { roughness: 0.5 });
      const chest = shell(g, {
        covers: (v) => isUpper(v) && v.tt >= 0.42 && (v.tt < 0.76 || Math.abs(v.ax - 0.62 * g.body.L.shoulderX) < 0.2 * g.body.L.shoulderX),
        offset: off, tile: 0.25, relax: 6,
      });
      const pauldron = shell(g, {
        covers: (v) => v.side > 0 && ((v.region === REGION.upperarm && v.t < 0.42) || (v.region === REGION.torso && v.t > 0.86 && Math.abs(v.theta) > 0.9 && Math.abs(v.theta) < 2.2)),
        offset: off + cm(1.2), tile: 0.2,
      });
      return [
        ...(chest ? [{ mesh: chest.mesh, material: m, hides: g.layered.top ? undefined : chest.covered, smooth: true }] : []),
        ...(pauldron ? [{ mesh: pauldron.mesh, material: cloth(g, 'Pauldron', leatherStyle('#3e2614'), { roughness: 0.45 }), smooth: true }] : []),
      ];
    },
  },
  {
    id: 'tactical_vest', label: 'Tactical vest', slot: 'acc', patterns: ['molle', 'camo', 'solid'], color: '#5d5a3c', color2: '#8a7d55',
    build: (g, st) => {
      const b = g.body;
      const m = cloth(g, 'Tactical vest', st, { roughness: 0.8 });
      const vest = shell(g, {
        covers: (v) => isUpper(v) && v.tt >= 0.2 && (v.tt < 0.76 || Math.abs(v.ax - 0.62 * b.L.shoulderX) < 0.2 * b.L.shoulderX),
        offset: cm(2.4), tile: 0.3, relax: 8,
      });
      const pouches: PolyMesh[] = [];
      for (const [t, angles] of [[0.42, [-0.5, 0, 0.5]], [0.32, [-1.5, 1.5]]] as const) {
        const ring = hullRing(points(b, isTrunk), hplane(b, torsoY(b, t)), { slab: cm(2.5), samples: 64, offset: cm(4.2) });
        if (ring) for (const a of angles) {
          const r = ringAt(ring, a);
          pouches.push(roundedBox(frameOf(r.p, r.out, Y), [cm(4.2), cm(5.5), cm(1.8)]));
        }
      }
      return [
        ...(vest ? [{ mesh: vest.mesh, material: m, smooth: true }] : []),
        ...(pouches.length ? [{ mesh: merge(pouches)!, material: m }] : []),
      ];
    },
  },
  {
    id: 'reflective_vest', label: 'Reflective vest (hi-vis)', slot: 'acc', patterns: ['solid'], color: '#c6e82a', color2: '#d9dee4',
    build: (g, st) => {
      const b = g.body;
      const vest = shell(g, {
        covers: (v) => isUpper(v) && v.tt >= 0.22 && (v.tt < 0.72 || Math.abs(v.ax - 0.62 * b.L.shoulderX) < 0.2 * b.L.shoulderX),
        offset: cm(1.8), tile: 0.3, relax: 8,
      });
      // Two reflective bands around the body.
      const trunk = points(b, isTrunk);
      const bands = [0.4, 0.58].map((t) => solidBand(trunk, hplane(b, torsoY(b, t)), cm(4.5), cm(0.15), cm(1.95), { samples: 72, slab: cm(2) }));
      return [
        ...(vest ? [{ mesh: vest.mesh, material: cloth(g, 'Reflective vest', st, { roughness: 0.7 }), smooth: true }] : []),
        ...(bands.some(Boolean) ? [{ mesh: merge(bands)!, material: mat('Reflective tape', null, { color: st.color2, roughness: 0.25, metalness: 0.55 }) }] : []),
      ];
    },
  },
  {
    id: 'beret', label: 'Beret', slot: 'acc', patterns: ['solid'], color: '#16181d', color2: '#c9a24a',
    build: (g, st) => {
      const b = g.body;
      // Pulled down to the character's right, flat crown, leather rim and a badge over the left eye.
      const r = shell(g, {
        covers: (v) => v.region === REGION.head && (Math.abs(v.theta) < 1.1 ? v.t > 0.76 : v.t > 0.64),
        offset: (v) => cm(0.9) + cm(2.6) * clamp((v.t - 0.72) * 4, 0, 1) * (1 - 0.55 * Math.sin(v.theta)), tile: 0.2, relax: 4,
      });
      const head = points(b, (v) => v.region === REGION.head);
      const rimY = b.L.crownY - (b.L.crownY - b.L.chinY) * 0.27;
      const rim = solidBand(head, { origin: [0, rimY, b.L.headZ], normal: Y }, cm(1.4), cm(0.35), cm(0.7), { samples: 48, slab: cm(1.2) });
      const front = hullRing(head, { origin: [0, rimY + cm(2.2), b.L.headZ], normal: Y }, { slab: cm(1.5), samples: 48, offset: cm(1.4) });
      const badge = front ? roundedBox(frameOf(ringAt(front, 0.35).p, ringAt(front, 0.35).out, Y), [cm(1.2), cm(1.5), cm(0.3)], 0.6) : null;
      return [
        ...(r ? [{ mesh: r.mesh, material: cloth(g, 'Beret', st, { roughness: 0.95 }), headwear: true, smooth: true }] : []),
        ...(rim ? [{ mesh: rim, material: mat('Beret rim', null, { color: '#0e0e0e', roughness: 0.5 }) }] : []),
        ...(badge ? [{ mesh: badge, material: mat('Badge', null, { color: st.color2, roughness: 0.3, metalness: 0.85 }) }] : []),
      ];
    },
  },
  {
    id: 'bead_collar', label: 'Beaded collar', slot: 'acc', patterns: ['beadbands'], color: '#d62828', color2: '#1d4fbf',
    build: (g) => {
      const b = g.body;
      const n = v3.norm([0, 1, 0.5]);
      const origin: Vec3 = [0, b.L.neckY - cm(0.5), b.L.torsoZ];
      const pts = points(b, (v) => isTrunk(v) || (v.region === REGION.neck && v.t < 1.15) || (v.region === REGION.upperarm && v.t < 0.15));
      const rings: Vec3[][] = [];
      for (let k = 0; k <= 7; k++) {
        const r = hullRing(pts, { origin: v3.madd(origin, n, -k * cm(1.5)), normal: n }, { slab: cm(1.2), samples: 64, offset: cm(0.7) + k * cm(0.12) });
        if (r) rings.push(r);
      }
      if (rings.length < 2) return [];
      const tex = g.texture('beadbands', () => makePattern('beadbands', '#000000', '#000000'));
      return [{ mesh: orientOutward(loftRings(rings, { closedAround: true, uRepeats: 3, tileV: 0.105 }), origin), material: mat('Beaded collar', tex, { roughness: 0.3, doubleSided: true }) }];
    },
  },
  {
    id: 'bead_necklace', label: 'Bead necklaces', slot: 'acc', patterns: ['solid'], color: '#d62828', color2: '#f2a516',
    build: (g) => necklace(g, 'beads'),
  },
  {
    id: 'cowrie_necklace', label: 'Cowrie-shell necklace', slot: 'acc', patterns: ['solid'], color: '#efe6d2', color2: '#3d2414',
    build: (g) => necklace(g, 'cowrie'),
  },
  {
    id: 'amulets', label: 'Protective charms', slot: 'acc', patterns: ['leather'], color: '#5a3820', color2: '#000000',
    build: (g, st) => {
      const b = g.body;
      const n = v3.norm([0, 1, 0.65]);
      const origin = v3.madd([0, b.L.neckY - cm(0.5), b.L.torsoZ], n, -cm(9));
      const pts = points(b, (v) => isTrunk(v) || (v.region === REGION.neck && v.t < 1.1));
      const off = cm(0.6) + (g.layered.top ? cm(1.6) : 0);
      const ring = hullRing(pts, { origin, normal: n }, { slab: cm(1.2), samples: 64, offset: off });
      if (!ring) return [];
      const pouches: PolyMesh[] = [];
      for (const a of [-0.35, 0, 0.35]) {
        const r = ringAt(ring, a);
        pouches.push(roundedBox(frameOf(v3.madd(v3.madd(r.p, Y, -cm(2.2)), r.out, cm(0.6)), r.out, Y), [cm(1.5), cm(2.0), cm(0.6)]));
      }
      // Charm on the left upper arm too.
      const arm = limbBand(b, REGION.upperarm, 1, 0.3, cm(1.6), cm(0.35), cm(0.3));
      const leather = cloth(g, 'Charms', st);
      return [
        { mesh: cord(ring, cm(0.18), true), material: mat('Cord', null, { color: '#2a1a10', roughness: 0.8 }) },
        { mesh: merge([...pouches, arm])!, material: leather },
      ];
    },
  },
  {
    id: 'arm_cuffs', label: 'Brass arm cuffs', slot: 'acc', patterns: ['solid'], color: '#d9a441', color2: '#000000',
    build: (g) => {
      const b = g.body;
      const m = merge([1, -1].flatMap((s) => [
        limbBand(b, REGION.upperarm, s, 0.36, cm(3.5), cm(0.35), cm(0.25)),
        limbBand(b, REGION.upperarm, s, 0.47, cm(1.2), cm(0.35), cm(0.25)),
        limbBand(b, REGION.lowerarm, s, 0.86, cm(5), cm(0.35), cm(0.3)),
      ]));
      return m ? [{ mesh: m, material: mat('Brass', null, GOLD) }] : [];
    },
  },
  {
    id: 'bead_armbands', label: 'Beaded arm bands', slot: 'acc', patterns: ['beadbands'], color: '#d62828', color2: '#000000',
    build: (g) => {
      const b = g.body;
      const tex = g.texture('beadbands', () => makePattern('beadbands', '#000000', '#000000'));
      const m = merge([1, -1].flatMap((s) => [
        limbBand(b, REGION.upperarm, s, 0.38, cm(3), cm(0.5), cm(0.2), 0.06),
        limbBand(b, REGION.lowerarm, s, 0.9, cm(3.5), cm(0.5), cm(0.25), 0.06),
      ]));
      return m ? [{ mesh: m, material: mat('Beaded bands', tex, { roughness: 0.3 }) }] : [];
    },
  },
  {
    id: 'cowrie_armbands', label: 'Cowrie arm bands', slot: 'acc', patterns: ['solid'], color: '#efe6d2', color2: '#000000',
    build: (g) => {
      const b = g.body;
      const shells: PolyMesh[] = [];
      for (const s of [1, -1]) {
        const { ring } = limbRing(b, REGION.upperarm, s, 0.38, cm(0.6), 32);
        const band = limbBand(b, REGION.upperarm, s, 0.38, cm(1.4), cm(0.3), cm(0.2));
        if (band) shells.push(band);
        if (ring) {
          const c = b.joint(`upperarm01${s > 0 ? '.L' : '.R'}____head`);
          const m = beads(ring, true, cm(1.8), [cm(0.9), cm(0.6), cm(0.45)], 1, v3.lerp(c, b.joint(`lowerarm01${s > 0 ? '.L' : '.R'}____head`), 0.38));
          if (m) shells.push(m);
        }
      }
      return shells.length ? [{ mesh: merge(shells)!, material: mat('Cowries', null, { color: '#efe6d2', roughness: 0.25 }) }] : [];
    },
  },
  {
    id: 'arm_guards', label: 'Leather arm guards', slot: 'acc', patterns: ['leather'], color: '#4a2c16', color2: '#000000',
    build: (g, st) => shellPart(g, {
      covers: (v) => v.region === REGION.lowerarm && v.t > 0.22 && v.t < 0.92,
      offset: cm(0.8) + (g.layered.top ? cm(1.0) : 0), tile: 0.12,
    }, cloth(g, 'Arm guards', st, { roughness: 0.5 })),
  },
  {
    id: 'fur_bands', label: 'Fur arm & leg bands', slot: 'acc', patterns: ['solid'], color: '#f2efe8', color2: '#000000',
    build: (g, st) => {
      const b = g.body;
      const furTex = g.texture(`fur_${st.color}`, () => makePattern('fur', st.color, st.color));
      const bands: PolyMesh[] = [], fringe: PolyMesh[] = [];
      for (const s of [1, -1])
        for (const [region, t, len] of [[REGION.upperarm, 0.3, 14], [REGION.lowerleg, 0.14, 20]] as const) {
          const band = limbBand(b, region, s, t, cm(4), cm(1.2), cm(0.4));
          if (band) bands.push(band);
          const { ring, dir } = limbRing(b, region, s, t, cm(1.2), 16);
          if (ring) for (const { p, tangent } of along(ring, cm(1.6), true)) fringe.push(card(p, v3.norm(v3.add(dir, [0, -0.3, 0])), tangent, cm(len), cm(3.2), 0.6, 2));
        }
      const fur = mat('Fur', furTex, { roughness: 0.9, doubleSided: true });
      return [
        ...(bands.length ? [{ mesh: merge(bands)!, material: mat('Fur bands', g.texture('hide_white', () => makePattern('hide', '#e8e2d6', '#d8d0c0')), { roughness: 0.95 }) }] : []),
        ...(fringe.length ? [{ mesh: merge(fringe)!, material: fur }] : []),
      ];
    },
  },
  {
    id: 'feather_headband', label: 'Fur headband & feathers', slot: 'acc', patterns: ['leopard', 'hide', 'leather'], color: '#c8902f', color2: '#1a1410',
    build: (g, st) => {
      const b = g.body;
      const head = points(b, (v) => v.region === REGION.head);
      const y = b.L.chinY + 0.7 * (b.L.crownY - b.L.chinY);
      const pl: Plane = { origin: [0, y, b.L.headZ], normal: v3.norm([0, 1, -0.3]) };
      const band = solidBand(head, pl, cm(4), cm(1.1), cm(0.5), { samples: 40, tileU: 0.15 });
      const ring = hullRing(head, pl, { slab: cm(1.2), samples: 40, offset: cm(2) });
      const feathers: PolyMesh[] = [];
      if (ring)
        for (const a of [1.25, -1.25, 2.6]) {
          const r = ringAt(ring, a);
          const dir = v3.norm(v3.add(v3.add(Y, v3.scale(r.out, 0.35)), [0, 0, -0.55]));
          feathers.push(card(v3.madd(r.p, Y, -cm(1)), dir, r.tan, cm(17), cm(7), 0.45, 4));
        }
      return [
        ...(band ? [{ mesh: band, material: cloth(g, 'Headband', st, { roughness: 0.9 }) }] : []),
        ...(feathers.length ? [{ mesh: merge(feathers)!, material: mat('Feathers', g.texture('feather', () => featherTexture('#f4f1ea', '#111111')), { roughness: 0.8, doubleSided: true }) }] : []),
      ];
    },
  },
  {
    id: 'bead_headband', label: 'Beaded headband', slot: 'acc', patterns: ['beadbands'], color: '#d62828', color2: '#000000',
    build: (g) => {
      const b = g.body;
      const head = points(b, (v) => v.region === REGION.head);
      const y = b.L.chinY + 0.78 * (b.L.crownY - b.L.chinY);
      const band = solidBand(head, { origin: [0, y, b.L.headZ], normal: v3.norm([0, 1, -0.15]) }, cm(2.4), cm(0.5), cm(0.6), { samples: 40, uRepeats: 2 });
      return band ? [{ mesh: band, material: mat('Beaded headband', g.texture('beadbands', () => makePattern('beadbands', '#000000', '#000000')), { roughness: 0.3 }) }] : [];
    },
  },
  {
    id: 'fila_cap', label: 'Fila cap', slot: 'acc', patterns: ['asooke', 'kente', 'ankara', 'solid'], color: '#5a1e3c', color2: '#e0c070',
    build: (g, st) => {
      const r = shell(g, {
        covers: (v) => v.region === REGION.head && (Math.abs(v.theta) < 1.1 ? v.t > 0.74 : v.t > 0.62),
        offset: (v) => cm(1.3) + cm(3) * clamp((v.t - 0.8) * 5, 0, 1) * (v.theta > 0 ? 1.2 : 0.8), tile: 0.2,
      });
      return r ? [{ mesh: r.mesh, material: cloth(g, 'Fila cap', st), headwear: true, smooth: true }] : [];
    },
  },
  {
    id: 'helmet', label: 'Combat helmet', slot: 'acc', patterns: ['camo', 'solid', 'molle'], color: '#59603a', color2: '#7d7a55',
    build: (g, st) => {
      const b = g.body;
      const r = shell(g, {
        covers: (v) => v.region === REGION.head && (Math.abs(v.theta) < 1.2 ? v.t > 0.7 : v.t > 0.5),
        offset: cm(2.6), tile: 0.2,
      });
      const head = points(b, (v) => v.region === REGION.head);
      const strap = solidBand(head, { origin: [0, (b.L.chinY + b.L.crownY) / 2, b.L.headZ - cm(1)], normal: Z }, cm(1.4), cm(0.25), cm(0.3), { samples: 40, slab: cm(1) });
      return [
        ...(r ? [{ mesh: r.mesh, material: cloth(g, 'Helmet', st, { roughness: 0.75 }), headwear: true, smooth: true }] : []),
        ...(strap ? [{ mesh: strap, material: mat('Chin strap', null, { color: '#1e1e1a', roughness: 0.7 }) }] : []),
      ];
    },
  },
  {
    id: 'visor', label: 'Holo visor', slot: 'acc', patterns: ['solid'], color: '#00e5ff', color2: '#000000',
    build: (g, st) => {
      const b = g.body;
      const head = points(b, (v) => v.region === REGION.head);
      const y = b.L.chinY + 0.56 * (b.L.crownY - b.L.chinY);
      const band = solidBand(head, { origin: [0, y, b.L.headZ], normal: Y }, cm(4.2), cm(0.25), cm(1.8), { samples: 28, arc: [-1.35, 1.35], slab: cm(2) });
      const frame = solidBand(head, { origin: [0, y + cm(2.4), b.L.headZ], normal: Y }, cm(0.8), cm(0.5), cm(1.9), { samples: 36, slab: cm(1.5) });
      return [
        ...(band ? [{ mesh: band, material: mat('Visor', null, { color: st.color, emissive: st.color, roughness: 0.1, alpha: 'blend', opacity: 0.55, doubleSided: true }) }] : []),
        ...(frame ? [{ mesh: frame, material: mat('Visor frame', null, { color: '#15171c', roughness: 0.3, metalness: 0.6 }) }] : []),
      ];
    },
  },
  {
    id: 'neon_accents', label: 'Neon accents', slot: 'acc', patterns: ['solid'], color: '#ff2bd6', color2: '#00e5ff',
    build: (g, st) => {
      const b = g.body;
      const over = g.layered.top ? cm(1.6) : cm(0.3);
      const rings = merge([1, -1].flatMap((s) => [
        limbBand(b, REGION.lowerarm, s, 0.88, cm(0.8), cm(0.3), over),
        limbBand(b, REGION.upperarm, s, 0.5, cm(0.8), cm(0.3), over),
      ]));
      const collar = solidBand(points(b, (v) => isTrunk(v) || v.region === REGION.neck), { origin: [0, b.L.neckY + cm(1), b.L.torsoZ], normal: v3.norm([0, 1, 0.35]) }, cm(0.8), cm(0.3), over + cm(0.6), { samples: 40, slab: cm(1.2) });
      const chest = solidBand(strapPoints(b, -1), strapPlane(b, -1, 0.4), cm(0.8), cm(0.3), over + cm(0.2), { samples: 40, arc: [-1.2, 1.2] });
      return [
        ...(rings || collar ? [{ mesh: merge([rings, collar])!, material: mat('Neon A', null, { color: st.color, emissive: st.color, roughness: 0.3 }) }] : []),
        ...(chest ? [{ mesh: chest, material: mat('Neon B', null, { color: st.color2, emissive: st.color2, roughness: 0.3 }) }] : []),
      ];
    },
  },
  {
    id: 'goggles', label: 'Goggles (on forehead)', slot: 'acc', patterns: ['leather'], color: '#2e2116', color2: '#000000',
    build: (g, st) => {
      const b = g.body;
      const head = points(b, (v) => v.region === REGION.head);
      const y = b.L.chinY + 0.8 * (b.L.crownY - b.L.chinY);
      const pl: Plane = { origin: [0, y, b.L.headZ], normal: v3.norm([0, 1, -0.25]) };
      const strap = solidBand(head, pl, cm(2.4), cm(0.4), cm(0.9), { samples: 40, tileU: 0.1 });
      const ring = hullRing(head, pl, { slab: cm(1.2), samples: 64, offset: cm(1.8) });
      const cups: PolyMesh[] = [], lenses: PolyMesh[] = [];
      if (ring) for (const a of [-0.36, 0.36]) {
        const r = ringAt(ring, a);
        const fwd = v3.norm(v3.add(r.out, [0, 0.35, 0]));
        cups.push(roundedBox(frameOf(r.p, fwd, Y), [cm(2.1), cm(1.9), cm(0.9)]));
        lenses.push(ellipsoid(frameOf(v3.madd(r.p, fwd, cm(1)), fwd, Y), [cm(1.8), cm(1.6), cm(0.4)], [0.5, 0.5]));
      }
      return [
        ...(strap ? [{ mesh: strap, material: cloth(g, 'Goggle strap', st) }] : []),
        ...(cups.length ? [{ mesh: merge(cups)!, material: mat('Goggle frame', null, { color: '#6b5a3a', roughness: 0.4, metalness: 0.7 }) }] : []),
        ...(lenses.length ? [{ mesh: merge(lenses)!, material: mat('Goggle lens', null, { color: '#d98a2b', roughness: 0.05, metalness: 0.2 }) }] : []),
      ];
    },
  },
  {
    id: 'arm_wraps', label: 'Cloth arm wraps', slot: 'acc', patterns: ['tattered', 'solid', 'khaki'], color: '#b3a68a', color2: '#000000',
    build: (g, st) => {
      const b = g.body;
      const wraps: PolyMesh[] = [];
      for (const s of [1, -1]) {
        const [a, c] = b.axis(REGION.lowerarm, s);
        const d = v3.norm(v3.sub(c, a));
        const tilt = v3.norm(v3.add(d, v3.scale(Z, 0.3)));
        const pts = b.verts(REGION.lowerarm, s).map((v) => b.p(v)).concat(b.verts(REGION.hand, s).map((v) => b.p(v)));
        for (let k = 0; k < 6; k++) {
          const w = solidBand(pts, { origin: v3.lerp(a, c, 0.4 + k * 0.11), normal: tilt }, cm(3), cm(0.25), cm(0.4) + k * cm(0.02), { samples: 18, slab: cm(1.2) });
          if (w) wraps.push(w);
        }
      }
      return wraps.length ? [{ mesh: merge(wraps)!, material: { ...cloth(g, 'Arm wraps', st), doubleSided: true } }] : [];
    },
  },
  {
    id: 'watch', label: 'Wrist watch', slot: 'acc', patterns: ['solid'], color: '#1a1a1a', color2: '#000000',
    build: (g) => {
      const b = g.body;
      const strap = limbBand(b, REGION.lowerarm, 1, 0.95, cm(1.8), cm(0.25), cm(0.15));
      const { ring } = limbRing(b, REGION.lowerarm, 1, 0.95, cm(0.6), 24);
      if (!ring) return [];
      let top = ring[0];
      for (const p of ring) if (p[1] > top[1]) top = p;
      const [a, c] = b.axis(REGION.lowerarm, 1);
      const out = v3.norm(v3.sub(top, v3.lerp(a, c, 0.95)));
      const face = roundedBox(frameOf(top, out, v3.sub(c, a)), [cm(1.7), cm(1.7), cm(0.45)]);
      return [
        ...(strap ? [{ mesh: strap, material: mat('Watch strap', null, { color: '#1a1a1a', roughness: 0.5 }) }] : []),
        { mesh: face, material: mat('Watch', null, STEEL) },
      ];
    },
  },
  ...YORUBA,
  ...WRIST,
  HEELS,
];

// --- Shared builders -------------------------------------------------------------


function wrapper(g: GCtx, st: GarmentStyle, length: 'long' | 'knee'): GPart[] {
  const b = g.body;
  const knee = b.joint('lowerleg01.L____head')[1];
  const ankle = b.joint('foot.L____head')[1];
  const yTop = torsoY(b, 0.34);
  const yBot = length === 'long' ? ankle + (knee - ankle) * 0.18 : knee - cm(4);
  const off = cm(1.6) + (g.layered.bottom ? cm(1) : 0);
  const m: Material = { ...cloth(g, 'Wrapper', st), doubleSided: true };
  const main = skirt(b, yTop, yBot, off, 0.03);
  // Overlapping front flap gives the wrapped look.
  const flap = skirt(b, yTop, yBot, off + cm(0.35), 0.03, [0.1, 1.15], 14);
  const roll = solidBand(points(b, isTrunk), hplane(b, yTop - cm(1.5)), cm(4), cm(1), off + cm(0.4), { samples: 48, tileU: 0.3 });
  return [
    ...(main ? [{ mesh: main, material: m }] : []),
    ...(flap ? [{ mesh: flap, material: m }] : []),
    ...(roll ? [{ mesh: roll, material: m }] : []),
    ...briefsUnder(g),
  ];
}

function belt(g: GCtx, st: GarmentStyle, width: number, utility: boolean): GPart[] {
  const b = g.body;
  const y = torsoY(b, 0.2);
  const off = cm(1.2) + (g.layered.bottom ? cm(0.6) : 0);
  const pts = points(b, isTrunk);
  const band = solidBand(pts, hplane(b, y), width, cm(0.5), off, { samples: 48, tileU: 0.1 });
  const ring = hullRing(pts, hplane(b, y), { slab: cm(2), samples: 64, offset: off + cm(0.5) });
  const parts: GPart[] = band ? [{ mesh: band, material: cloth(g, utility ? 'Utility belt' : 'Belt', st, { roughness: 0.5 }) }] : [];
  if (ring) {
    const f = ringAt(ring, 0);
    parts.push({ mesh: roundedBox(frameOf(f.p, f.out, Y), [cm(2.6), cm(2.0), cm(0.35)]), material: mat('Buckle', null, STEEL) });
    if (utility) {
      const pouches = [-1.0, -1.7, 1.0, 1.7, Math.PI].map((a) => {
        const r = ringAt(ring, a);
        return roundedBox(frameOf(v3.madd(v3.madd(r.p, r.out, cm(1.2)), Y, -cm(1.5)), r.out, Y), [cm(3.2), cm(4.2), cm(1.6)]);
      });
      parts.push({ mesh: merge(pouches)!, material: cloth(g, 'Pouches', st, { roughness: 0.6 }) });
    }
  }
  return parts;
}

function cargoPockets(g: GCtx, t: number, m: Material): GPart[] {
  const b = g.body;
  const boxes: PolyMesh[] = [];
  for (const s of [1, -1]) {
    const { ring } = limbRing(b, REGION.upperleg, s, t, cm(1.6), 32);
    if (!ring) continue;
    // outermost point (largest |x|)
    let p = ring[0];
    for (const q of ring) if (Math.abs(q[0]) > Math.abs(p[0])) p = q;
    const [a, c] = b.axis(REGION.upperleg, s);
    const out = v3.norm([p[0] - v3.lerp(a, c, t)[0], 0, 0.15]);
    boxes.push(roundedBox(frameOf(p, out, v3.sub(a, c)), [cm(5.5), cm(7), cm(1.4)]));
  }
  return boxes.length ? [{ mesh: merge(boxes)!, material: m }] : [];
}

function necklace(g: GCtx, kind: 'beads' | 'cowrie'): GPart[] {
  const b = g.body;
  const n = v3.norm([0, 1, kind === 'beads' ? 0.55 : 0.7]);
  const origin: Vec3 = [0, b.L.neckY - cm(0.5), b.L.torsoZ];
  const pts = points(b, (v) => isTrunk(v) || (v.region === REGION.neck && v.t < 1.1) || (v.region === REGION.upperarm && v.t < 0.1));
  const off = cm(0.6) + (g.layered.top ? cm(1.6) : 0);
  const centre: Vec3 = [0, b.L.neckY - cm(10), b.L.torsoZ];
  const parts: PolyMesh[] = [];
  const strands = kind === 'beads' ? [11, 13.5, 16] : [8.5];
  for (const d of strands) {
    const ring = hullRing(pts, { origin: v3.madd(origin, n, -cm(d)), normal: n }, { slab: cm(1.2), samples: 72, offset: off });
    if (!ring) continue;
    const m = kind === 'beads'
      ? beads(ring, true, cm(0.95), [cm(0.45), cm(0.45), cm(0.45)], MAASAI_BEADS.length, centre)
      : beads(ring, true, cm(1.7), [cm(0.95), cm(0.62), cm(0.5)], 1, centre);
    if (m) parts.push(m);
  }
  const mesh = merge(parts);
  if (!mesh) return [];
  return kind === 'beads'
    ? [{ mesh, material: mat('Beads', g.texture('palette_maasai', () => palette(MAASAI_BEADS)), { roughness: 0.25 }) }]
    : [{ mesh, material: mat('Cowries', null, { color: '#efe6d2', roughness: 0.25 }) }];
}

// --- Footwear -------------------------------------------------------------------

/** Sandals: a sole slab under each foot plus toe, instep and ankle straps. */
export function sandals(g: GCtx, color = '#5a3820'): GPart[] {
  const b = g.body;
  const soles: PolyMesh[] = [], straps: PolyMesh[] = [];
  for (const s of [1, -1]) {
    const foot = b.verts(REGION.foot, s).map((v) => b.p(v));
    if (!foot.length) continue;
    let minY = Infinity;
    for (const p of foot) minY = Math.min(minY, p[1]);
    const ring = hullRing(foot, { origin: [0, minY, 0], normal: Y }, { slab: cm(40), samples: 28, offset: cm(0.5) });
    if (!ring) continue;
    const top = ring.map((p) => [p[0], minY + cm(0.1), p[2]] as Vec3);
    const bot = ring.map((p) => [p[0], minY - cm(1.4), p[2]] as Vec3);
    const side = loftRings([top, bot], { closedAround: true, tileU: 0.1 });
    const n = ring.length;
    const capVerts = (pts: Vec3[], flip: boolean): PolyMesh => ({
      positions: Float32Array.from(pts.flat()),
      faceSizes: Uint8Array.from([n]),
      faceVerts: Uint32Array.from(flip ? [...Array(n).keys()].reverse() : [...Array(n).keys()]),
      faceUVs: Uint32Array.from([...Array(n).keys()]),
      uvs: Float32Array.from(pts.flatMap((p) => [p[0] * 0.5, p[2] * 0.5])),
    });
    const centre: Vec3 = [ring.reduce((a, p) => a + p[0], 0) / n, minY - cm(0.6), ring.reduce((a, p) => a + p[2], 0) / n];
    soles.push(orientOutward(merge([side, capVerts(top, false), capVerts(bot, true)])!, centre));
    const [fa, fb] = b.axis(REGION.foot, s);
    const fd = v3.sub(fb, fa);
    for (const t of [0.35, 0.95]) {
      const st = solidBand(foot, { origin: v3.lerp(fa, fb, t), normal: fd }, cm(1.6), cm(0.3), cm(0.15), { samples: 20, slab: cm(1.2) });
      if (st) straps.push(st);
    }
    const ankle = b.verts(REGION.lowerleg, s).map((v) => b.p(v)).concat(foot);
    const as = solidBand(ankle, { origin: [fa[0], fa[1] - cm(1.5), fa[2]], normal: Y }, cm(1.5), cm(0.3), cm(0.25), { samples: 20, slab: cm(1.2) });
    if (as) straps.push(as);
  }
  const leather = g.texture(`leather_${color}`, () => makePattern('leather', color, '#000000'));
  return [
    ...(soles.length ? [{ mesh: merge(soles)!, material: mat('Sandal soles', leather, { roughness: 0.6 }), ground: true }] : []),
    ...(straps.length ? [{ mesh: merge(straps)!, material: mat('Sandal straps', leather, { roughness: 0.5 }) }] : []),
  ];
}

/** Boot shafts over the lower leg (worn with the "shoes03" boots asset). */
export function bootShafts(g: GCtx, color = '#1c1a18'): GPart[] {
  const r = buildShell(g.body, g.faceVerts, {
    covers: (v) => v.region === REGION.lowerleg && v.t > 0.5,
    offset: cm(1.45), tile: 0.15,
  });
  return r ? [{ mesh: r.mesh, material: mat('Boot shafts', g.texture(`leather_${color}`, () => makePattern('leather', color, '#000000')), { roughness: 0.45 }), hides: r.covered, smooth: true }] : [];
}

export const garmentById = new Map(GARMENTS.map((x) => [x.id, x]));
