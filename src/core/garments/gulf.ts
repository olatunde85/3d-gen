/**
 * Gulf Arab dress: the thobe (an ankle-length robe with a stand collar, a short buttoned placket and
 * long sleeves with cuffs, hanging straight from the chest) and the keffiyeh (ghutra) with its agal:
 * the cloth covers the crown and forehead, falls beside the face and over the shoulders, the front
 * corners on the chest and a long point down the back; the agal is a doubled black cord round the
 * head.
 */
import { compact, type PolyMesh } from '../geometry';
import { pchip, type Vec3 } from '../math';
import { cm, REGION, type Body, type VInfo } from './body';
import { ankle, blendToHull, dressPts, hang, knee, legsUnder, loosePart, part } from './drape';
import { clamp, cloth, hplane, isTrunk, isUpper, limbBand, mat, points, shell, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { boundaryChain, cord, hullRing, loftRings, merge, orientOutward, rayRing, v3 } from './ring';
import { placket } from './shirts';

/**
 * Cut a fitted top (a shell, with `ref`) at height y and lay its bottom edge on the hull ring a
 * hanging skirt starts with there (`offset` off the trunk and legs), so the two meet edge to edge.
 */
function joinSkirt(b: Body, m: PolyMesh, y: number, offset: number): PolyMesh {
  const P = m.positions, ref = m.ref;
  // (The trunk only: the sleeves hang below the waist in the A-pose.)
  const cut = compact(m, (_, c) => {
    let cy = 0, trunk = true;
    for (const v of c) [cy, trunk] = [cy + P[v * 3 + 1] / c.length, trunk && !!ref && ref[v] >= 0 && isTrunk(b.info[ref[v]])];
    return !trunk || cy >= y;
  });
  const ring = hullRing(dressPts(b), hplane(b, y), { slab: cm(2.5), samples: 72, offset });
  if (!ring || !cut.ref) return cut;
  const Q = new Float32Array(cut.positions), centre: Vec3 = [0, y, b.L.torsoZ];
  for (const p of boundaryChain(cut, (q) => q[1] < y + cm(3) && Math.abs(q[0]) < b.L.shoulderX)) {
    // Every vertex at that point (the chain gives positions).
    for (let i = 0; i < Q.length / 3; i++) {
      if (Q[i * 3] !== p[0] || Q[i * 3 + 1] !== p[1] || Q[i * 3 + 2] !== p[2]) continue;
      const r = cut.ref[i];
      if (r < 0 || !isTrunk(b.info[r])) continue;
      const d = v3.norm([p[0] - centre[0], 0, p[2] - centre[2]]);
      const rr = rayRing(ring, centre, d);
      if (rr !== null) Q.set([centre[0] + d[0] * rr, y, centre[2] + d[2] * rr], i * 3);
    }
  }
  return { ...cut, positions: Q };
}

/** A soft rolled hem along a hanging skirt's bottom edge (at height `hem`). */
function hemCord(skirt: PolyMesh, hem: number): PolyMesh | null {
  const edge = boundaryChain(skirt, (p) => p[1] < hem + cm(1));
  return edge.length > 8 ? cord(edge, cm(0.3), false, 6) : null;
}

function thobe(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, sx = b.L.shoulderX;
  const m = cloth(g, 'Thobe', st, { roughness: 0.82 });
  // Round neckline close to the neck (a little lower at the front).
  const neck = (v: VInfo) => (v.ax / (0.36 * sx)) ** 2 + ((1.02 - v.tt) / (Math.abs(v.tth) < Math.PI / 2 ? 0.07 : 0.035)) ** 2 < 1;
  const yTop = torsoY(b, 0.36), hem = ankle(b) - cm(2.5);
  const OFF = cm(1.6);
  const top = shell(g, {
    covers: (v) => ((isUpper(v) && v.tt >= 0.3) || v.region === REGION.upperarm || (v.region === REGION.lowerarm && v.t < 0.9)) && !neck(v),
    // Loose: easy over the body, roomy sleeves narrowing to the cuffs; close at the neck.
    offset: (v) =>
      v.region === REGION.upperarm ? cm(1.6 + 0.4 * v.t)
      : v.region === REGION.lowerarm ? cm(2.0 - 1.1 * v.t)
      : cm(1.5) * (1 - 0.6 * clamp((v.tt - 0.86) / 0.12, 0, 1)),
    // (The rim at the waist turns in, hidden inside the skirt.)
    tile: 0.3, relax: 6, hemDepth: cm(0.3),
  });
  if (!top) return [];
  // The upper part meets the skirt exactly (no seam on white cloth): eased out onto the skirt's
  // hull, cut at the skirt's top and its bottom edge laid on the skirt's top ring.
  top.mesh = joinSkirt(b, blendToHull(b, top.mesh, dressPts(b), torsoY(b, 0.55), yTop, OFF), yTop, OFF);
  const skirt = hang(b, dressPts(b), yTop, hem, { offset: OFF, shrink: (y) => (y > knee(b) ? 0.03 : 0), flare: 0.004, samples: 72 });
  // Stand collar: rising 2 cm from the neckline's edge, leaning in to the neck.
  const edge = boundaryChain(top.mesh, (p) => p[1] > torsoY(b, 0.85) && Math.abs(p[0]) < 0.6 * sx);
  let collar: PolyMesh | null = null;
  if (edge.length > 8) {
    let line = edge;
    for (let it = 0; it < 4; it++) line = line.map((p, i) => (i === 0 || i === line.length - 1 ? p : v3.scale(v3.add(v3.add(line[i - 1], v3.scale(p, 2)), line[i + 1]), 0.25)));
    const nc: Vec3 = [0, 0, 0];
    const neckV = points(b, (v) => v.region === REGION.neck);
    for (const q of neckV) for (let k = 0; k < 3; k++) nc[k] += q[k] / neckV.length;
    // From the neckline's (inner) edge out over the cut, then up 2 cm, 4 mm off the neck.
    const neckR = (p: Vec3, y: number) => {
      const d = v3.norm([p[0] - nc[0], 0, p[2] - nc[2]]);
      const h = hullRing(neckV, hplane(b, y), { slab: cm(1), samples: 64, offset: cm(0.4) });
      const r = h && rayRing(h, [nc[0], y, nc[2]], d);
      return r ? v3.madd([nc[0], y, nc[2]], d, r) : p;
    };
    const ring = (f: (p: Vec3) => Vec3) => line.map(f);
    const out = (p: Vec3, k: number, up: number): Vec3 => {
      const d = v3.norm([p[0] - nc[0], 0, p[2] - nc[2]]);
      return [p[0] + d[0] * k, p[1] + up, p[2] + d[2] * k];
    };
    const rings = [ring((p) => out(p, 0, -cm(0.3))), ring((p) => out(p, cm(1.3), cm(0.4))), ring((p) => v3.lerp(out(p, cm(1.3), cm(1.2)), neckR(p, p[1] + cm(1.2)), 0.5)), ring((p) => neckR(p, p[1] + cm(2.2)))];
    collar = orientOutward(loftRings(rings, { closedAround: false, tileU: 0.2, tileV: 0.1 }), [nc[0], b.L.neckY - cm(4), nc[2]]);
    collar = merge([collar, cord(rings[3], cm(0.15), false, 5)]);
  }
  // Cuffs over the sleeves' ends (their cut edges run at a slant across the forearm).
  const cuffs = merge([1, -1].map((s) => limbBand(b, REGION.lowerarm, s, 0.84, cm(7), cm(0.35), cm(1.25))));
  return [
    { mesh: top.mesh, material: m, hides: top.covered, smooth: true },
    ...loosePart(b, skirt, { ...m, doubleSided: true }, 0.35, 0.35, legsUnder(g, hem)),
    // A turned hem round the bottom edge.
    ...loosePart(b, skirt && hemCord(skirt, hem), m, 0.35, 0.35),
    ...part(collar, { ...m, doubleSided: true }),
    ...part(cuffs, m),
    ...placket(g, top.mesh, m, { ttV: 0.95, buttons: 3, spacing: cm(5), placketTo: 0.72, buttonColor: '#ece8de' }),
  ];
}

/** Keffiyeh and agal. */
function keffiyeh(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, sx = b.L.shoulderX;
  const m = { ...cloth(g, 'Keffiyeh', st, { roughness: 0.85 }), doubleSided: true };
  const head = points(b, (v) => v.region === REGION.head);
  let hz = 0;
  for (const p of head) hz += p[2] / head.length;
  // What the cloth falls over: the head, neck and shoulders (not the arms), and the top worn.
  const src = [
    ...points(b, (v) => v.region === REGION.head || v.region === REGION.neck || (isTrunk(v) && v.ax < 0.95 * sx)),
    // (The top's shoulders too, out past the body's: the cloth lies over them.)
    ...(g.worn ?? []).filter((p) => Math.abs(p[0]) < 1.25 * sx && p[1] > torsoY(b, 0.3)),
  ];
  const yCrown = b.L.crownY + cm(0.2), yBrow = b.L.chinY + (b.L.crownY - b.L.chinY) * 0.68;
  const frontHem = torsoY(b, 0.66), backHem = torsoY(b, 0.42), shoulderY = b.L.neckY - cm(3);
  const yBot = backHem - cm(7);
  // The body's surface (head, neck, shoulders and the top worn) per centimetre of height.
  const hulls = new Map<number, Vec3[] | null>();
  const hullAt = (y: number) => {
    const k = Math.round(y / cm(1));
    if (!hulls.has(k)) hulls.set(k, hullRing(src, hplane(b, k * cm(1)), { slab: cm(1.6), samples: 128, offset: cm(1.2) }));
    return hulls.get(k)!;
  };
  const bodyR = (y: number, d: Vec3) => {
    const h = hullAt(y);
    return h ? rayRing(h, [0, y, hz], d) ?? 0 : 0;
  };
  // The head's widest extent at each angle above the brow: the cloth falls from there.
  const crownCache = new Map<number, number>();
  const fallR = (a: number) => {
    const k = Math.round(a * 40);
    if (!crownCache.has(k)) {
      const d: Vec3 = [Math.sin(k / 40), 0, Math.cos(k / 40)];
      let r = 0;
      for (let y = yBrow; y < yCrown - cm(4); y += cm(1)) r = Math.max(r, bodyR(y, d));
      crownCache.set(k, r);
    }
    return crownCache.get(k)!;
  };
  // The cloth's surface at height y and angle a round the head's axis (0 = front): on the head
  // above the brow; below it falls from the head's width, filling out toward the chin in soft folds,
  // and lies over the shoulders and chest where they are wider.
  const at = (y: number, a: number): Vec3 => {
    const d: Vec3 = [Math.sin(a), 0, Math.cos(a)];
    let r = bodyR(y, d);
    if (y < yBrow) {
      const drop = clamp((yBrow - y) / (yBrow - b.L.chinY), 0, 1);
      const fold = cm(1.1) * drop * Math.sin(a * 9 + Math.sin(a * 3) * 1.5);
      r = Math.max(r, fallR(a) + cm(2.6) * drop ** 0.7 + fold);
    }
    return v3.madd([0, y, hz], d, r);
  };
  // Cap: crown to brow, all round (its front is the folded edge across the forehead).
  const M = 72, capRows: Vec3[][] = [];
  for (let i = 0; i <= 10; i++) {
    const y = yCrown + (yBrow - yCrown) * (i / 10) ** 0.8;
    capRows.push(Array.from({ length: M + 1 }, (_, j) => at(y, -Math.PI + (2 * Math.PI * j) / M)));
  }
  let c0: Vec3 = [0, 0, 0];
  for (const p of capRows[0]) c0 = v3.add(c0, v3.scale(p, 1 / capRows[0].length));
  const cap = orientOutward(loftRings([capRows[0].map(() => c0), ...capRows], { closedAround: false, tileU: 0.3, tileV: 0.3 }), [0, (yCrown + yBrow) / 2, hz]);
  // Drape: from the brow down, open at the front (beside the face, then over the chest). Columns s
  // run from the left front edge round the back to the right; each hangs to its own hem: the front
  // corners on the chest, over the shoulders at the sides, a long point down the back.
  const open = (y: number) => (y > b.L.chinY ? 1.0 : 1.0 + (0.55 - 1.0) * clamp((b.L.chinY - y) / (b.L.chinY - frontHem), 0, 1) ** 0.6);
  const hemAt = pchip([0.5, 0.95, 1.45, 1.95, 2.5, Math.PI], [frontHem, frontHem + cm(4), shoulderY, shoulderY - cm(4), backHem, yBot]);
  const C = 96, R = 40, drapeRows: Vec3[][] = [];
  for (let i = 0; i <= R; i++) {
    const row: Vec3[] = [];
    for (let j = 0; j <= C; j++) {
      const s = j / C;
      const aHem = 0.55 + (2 * Math.PI - 1.1) * s, ah = Math.min(aHem, 2 * Math.PI - aHem);
      const y = yBrow + (hemAt(ah) - yBrow) * (i / R);
      const phi = open(y), a = phi + (2 * Math.PI - 2 * phi) * s;
      row.push(at(y, a));
    }
    drapeRows.push(row);
  }
  const drape = orientOutward(loftRings(drapeRows, { closedAround: false, tileU: 0.3, tileV: 0.3 }), [0, b.L.neckY, hz]);
  // Rolled edges: across the forehead, down the front edges and round the hem.
  const brow = capRows[capRows.length - 1].filter((p) => p[2] > hz && Math.abs(Math.atan2(p[0], p[2] - hz)) < 1.02);
  const edges = merge([
    cord(brow, cm(0.35), false, 6),
    cord(drapeRows.map((r) => r[0]), cm(0.3), false, 6),
    cord(drapeRows.map((r) => r[C]), cm(0.3), false, 6),
    cord(drapeRows[R], cm(0.3), false, 6),
  ]);
  // Agal: a doubled black cord round the head at the top of the forehead, a little lower at the back.
  const capPts: Vec3[] = [];
  for (const r of capRows) capPts.push(...r);
  const yA = yBrow + cm(2.2);
  const agal = merge([0, cm(1.5)].map((dy) => {
    const ring = hullRing(capPts, { origin: [0, yA + dy, hz], normal: v3.norm([0, 1, 0.12]) }, { slab: cm(1.2), samples: 72, offset: cm(0.75) - dy * 0.12 });
    return ring && cord([...ring, ring[0]], cm(0.7), false, 10);
  }));
  // Skinning: the cap, agal and the cloth beside the face follow the head; below the chin the cloth
  // follows the shoulders and chest (within the torso, not the arms).
  const headAt: Vec3 = [0, (b.L.crownY + b.L.chinY) / 2, hz];
  const look = (mesh: PolyMesh): Float32Array => {
    const P = mesh.positions, out = new Float32Array(P.length);
    for (let i = 0; i < P.length; i += 3) {
      const y = P[i + 1], w = clamp((b.L.chinY - y) / (b.L.chinY - shoulderY), 0, 1);
      const body: Vec3 = [clamp(P[i], -0.45 * sx, 0.45 * sx), y, P[i + 2] * 0.6 + b.L.torsoZ * 0.4];
      out.set(v3.lerp(headAt, body, w), i);
    }
    return out;
  };
  const black = mat('Agal', null, { color: '#121212', roughness: 0.6 });
  const clothMesh = merge([cap, drape, edges])!;
  return [
    { mesh: clothMesh, material: m, skinAt: look(clothMesh), headwear: true, hidesHair: true },
    ...(agal ? [{ mesh: agal, material: black, skinAt: look(agal) }] : []),
  ];
}

export const GULF: GarmentDef[] = [
  { id: 'thobe', label: 'Thobe (white robe)', slot: 'top', patterns: ['linen', 'solid'], color: '#f4f2ec', color2: '#e3dfd4', build: thobe },
  { id: 'keffiyeh', label: 'Keffiyeh & agal', slot: 'hat', patterns: ['shemagh', 'solid'], color: '#c4202a', color2: '#f4f1ea', build: keffiyeh },
];
