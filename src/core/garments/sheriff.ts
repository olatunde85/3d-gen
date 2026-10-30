import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION } from './body';
import { cloth, isTrunk, mat, points, shell, torsoY, Z, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, frameOf, hullRing, loftRings, merge, roundedBox, v3 } from './ring';

const GOLD = '#d1ae61';

function badge(center: Vec3, normal: Vec3): PolyMesh {
  const f = frameOf(center, normal, [0, 1, 0]);
  const outline: Vec3[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 === 0 ? cm(2.0) : cm(1.65);
    outline.push(v3.add(center, v3.add(v3.scale(f.x, Math.cos(a) * r), v3.scale(f.y, Math.sin(a) * r))));
  }
  const half = cm(0.18), positions: number[] = [...v3.madd(center, normal, half), ...v3.madd(center, normal, -half)];
  positions.push(...outline.flatMap((p) => [...v3.madd(p, normal, half)]), ...outline.flatMap((p) => [...v3.madd(p, normal, -half)]));
  const sizes: number[] = [];
  const faceVerts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const next = (i + 1) % 10;
    sizes.push(3, 3, 4, 4);
    faceVerts.push(0, 2 + i, 2 + next, 1, 12 + next, 12 + i, 2 + i, 2 + next, 12 + next, 12 + i, 2 + i, 12 + i, 12 + next, 2 + next);
  }
  return { positions: Float32Array.from(positions), faceSizes: Uint8Array.from(sizes), faceVerts: Uint32Array.from(faceVerts), faceUVs: new Uint32Array(faceVerts.length), uvs: new Float32Array(2) };
}

function sheriffShirt(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const fabric = cloth(g, 'Sheriff uniform shirt', st, { roughness: 0.8 });
  const shirt = shell(g, {
    covers: (v) => (isTrunk(v) && v.tt >= 0.14) || (v.region === REGION.neck && v.t < 1.08) || (v.region === REGION.upperarm && v.t < 0.42),
    offset: (v) => cm(0.9) + (v.region === REGION.upperarm ? cm(0.7) * v.t : 0), tile: 0.25, relax: 3,
  });
  if (!shirt) return [];
  const addPatches: PolyMesh[] = [];
  const buttons: PolyMesh[] = [];
  const surfacePoint = (x: number, y: number, lift: number): Vec3 => {
    let best: Vec3 | null = null, dBest = Infinity;
    for (let i = 0; i < shirt.mesh.positions.length; i += 3) {
      const dx = shirt.mesh.positions[i] - x, dy = shirt.mesh.positions[i + 1] - y, d = dx * dx + dy * dy;
      if (d < dBest) { dBest = d; best = [shirt.mesh.positions[i], shirt.mesh.positions[i + 1], shirt.mesh.positions[i + 2] + lift]; }
    }
    return best ?? [x, y, b.L.torsoZ + cm(12)];
  };
  const yChest = torsoY(b, 0.73), sx = b.L.shoulderX;
  // Two flap pockets with pointed flaps, plus a clean vertical button placket.
  for (const side of [-1, 1]) {
    const x = side * sx * 0.34;
    const pocketAt = surfacePoint(x, yChest - cm(4.2), cm(1.2));
    const flapAt = surfacePoint(x, yChest - cm(0.3), cm(1.8));
    const pocket = roundedBox(frameOf(pocketAt, [0, 0, 1], [0, 1, 0]), [cm(4.1), cm(3.2), cm(0.3)], 0.1);
    const flap = roundedBox(frameOf(flapAt, [0, 0, 1], [0, 1, 0]), [cm(4.3), cm(1.1), cm(0.3)], 0.12);
    addPatches.push(pocket, flap);
  }
  const midX = 0;
  for (let y = yChest + cm(9); y < torsoY(b, 0.98); y += cm(5.5)) {
    buttons.push(roundedBox(frameOf(surfacePoint(midX, y, cm(1.5)), [0, 0, 1], [0, 1, 0]), [cm(0.5), cm(0.5), cm(0.3)], 0.35));
  }
  // Distinct sheriff star on the left chest, mounted above the pocket.
  const badgeX = -sx * 0.35, badgeY = yChest + cm(4.2);
  const starAt = surfacePoint(badgeX, badgeY, cm(1.8));
  const star = badge(starAt, [0, 0, 1]);
  const details: GPart[] = [
    ...(addPatches.length ? [{ mesh: merge(addPatches)!, material: mat('Uniform pocket flaps', null, { color: st.color, roughness: 0.7 }) }] : []),
    { mesh: star, material: mat('Sheriff star badge', null, { color: GOLD, roughness: 0.28, metalness: 0.8 }) },
    ...(buttons.length ? [{ mesh: merge(buttons)!, material: mat('Uniform shirt buttons', null, { color: '#30261b', roughness: 0.4, metalness: 0.35 }) }] : []),
  ];
  const epaulettes: PolyMesh[] = [];
  const shirtPositions = shirt.mesh.positions;
  const topAt = (x: number): Vec3 | null => {
    let top: Vec3 | null = null;
    for (let i = 0; i < shirtPositions.length; i += 3) {
      const p: Vec3 = [shirtPositions[i], shirtPositions[i + 1], shirtPositions[i + 2]];
      if (Math.abs(p[0] - x) < cm(1.2) && Math.abs(p[2] - b.L.torsoZ) < cm(6) && (!top || p[1] > top[1])) top = p;
    }
    return top;
  };
  for (const side of [-1, 1]) {
    const a = topAt(0.45 * sx * side), c = topAt(0.88 * sx * side);
    if (!a || !c) continue;
    const along = v3.norm(v3.sub(c, a));
    let up = v3.norm(v3.cross(Z, along));
    if (up[1] < 0) up = v3.scale(up, -1);
    const mid = v3.add(v3.scale(v3.add(a, c), 0.5), v3.scale(up, cm(0.3)));
    epaulettes.push(roundedBox(frameOf(mid, up, along), [cm(2.2), v3.len(v3.sub(c, a)) / 2, cm(0.25)], 0.5));
  }
  const chestSeams: PolyMesh[] = [];
  for (const side of [-1, 1]) {
    const x = side * sx * 0.34;
    const seam = [[x - cm(4.1), yChest - cm(7.5)], [x - cm(4.1), yChest - cm(1)], [x + cm(4.1), yChest - cm(1)], [x + cm(4.1), yChest - cm(7.5)]]
      .map(([px, py]) => surfacePoint(px, py, cm(1.8)));
    chestSeams.push(cord(seam, cm(0.12), false, 4));
  }
  return [
    { mesh: shirt.mesh, material: fabric, hides: shirt.covered, smooth: true },
    ...details,
    ...(epaulettes.length ? [{ mesh: merge(epaulettes)!, material: mat('Sheriff uniform epaulettes', null, { color: '#34352d', roughness: 0.5, metalness: 0.3 }) }] : []),
    ...(chestSeams.length ? [{ mesh: merge(chestSeams)!, material: mat('Pocket stitching', null, { color: '#806d55', roughness: 0.8 }) }] : []),
  ];
}

function sheriffTrousers(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const fabric = cloth(g, 'Sheriff uniform trousers', st, { roughness: 0.86 });
  const trousers = shell(g, {
    covers: (v) => (isTrunk(v) && v.tt < 0.46) || v.region === REGION.upperleg || (v.region === REGION.lowerleg && v.t < 0.96),
    offset: (v) => cm(0.85) + (v.region === REGION.upperleg || v.region === REGION.lowerleg ? cm(0.5) : 0), tile: 0.22, relax: 4,
  });
  if (!trousers) return [];
  const outerAt = (side: number, y: number): Vec3 | null => {
    let best: Vec3 | null = null, bestScore = -Infinity;
    for (let i = 0; i < trousers.mesh.positions.length; i += 3) {
      const p: Vec3 = [trousers.mesh.positions[i], trousers.mesh.positions[i + 1], trousers.mesh.positions[i + 2]];
      if (Math.abs(p[1] - y) > cm(3.5)) continue;
      // Prefer the outer seam at the requested height, with a small penalty for vertical distance.
      const score = side * p[0] - Math.abs(p[1] - y) * 0.35;
      if (!best || score > bestScore) { best = p; bestScore = score; }
    }
    return best ? [best[0] + side * cm(0.35), y, best[2]] : null;
  };
  const stripe: PolyMesh[] = [];
  // Narrow gold outer-seam stripes on both legs, laid against the trouser shell.
  for (const side of [-1, 1]) {
    const ankleY = b.joint(`foot${side > 0 ? '.L' : '.R'}____head`)[1];
    // Stop at the top of the boot shaft, leaving a small clean break before the shoe.
    const bootTopY = ankleY + (b.joint(`lowerleg01${side > 0 ? '.L' : '.R'}____head`)[1] - ankleY) * 0.14;
    const lo = bootTopY + cm(1.0);
    // Let the pinstripe disappear just underneath the duty belt so there is no visible gap.
    const hi = torsoY(b, 0.2) + cm(1.5);
    const path: Vec3[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48, y = lo + (hi - lo) * t;
      const p = outerAt(side, y);
      if (p) path.push(p);
    }
    if (path.length > 3) stripe.push(cord(path, cm(0.8), false, 6));
  }
  return [
    { mesh: trousers.mesh, material: fabric, hides: trousers.covered, smooth: true },
    ...(stripe.length ? [{ mesh: merge(stripe)!, material: mat('Trouser gold side stripes', null, { color: GOLD, roughness: 0.6, metalness: 0.15 }) }] : []),
  ];
}

function cowboyHat(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, head = points(b, (v) => v.region === REGION.head);
  const headHeight = b.L.crownY - b.L.chinY;
  // Fit the sweatband around the skull just above the ears; do not float it at the crown vertex.
  const brimY = b.L.chinY + headHeight * 0.73;
  const ring = hullRing(head, { origin: [0, brimY, b.L.headZ], normal: [0, 1, 0] }, { slab: cm(3.0), samples: 64, offset: cm(0.15) });
  if (!ring) return [];
  const centre: Vec3 = [0, 0, b.L.headZ];
  const scaleRing = (base: Vec3[], scale: number, y: number) => base.map((p) => [centre[0] + (p[0] - centre[0]) * scale, y, centre[2] + (p[2] - centre[2]) * scale] as Vec3);
  const brimInner = scaleRing(ring, 1.02, brimY + cm(0.35));
  const brimOuter = ring.map((p) => {
    const a = Math.atan2(p[0], p[2] - b.L.headZ), wide = 1.95;
    return [p[0] * wide, brimY + cm(0.35) + cm(2.8) * Math.sin(a) ** 2 + cm(1.0) * Math.cos(a), b.L.headZ + (p[2] - b.L.headZ) * wide] as Vec3;
  });
  const brim = loftRings([brimInner, brimOuter], { closedAround: true, closedAcross: true, tileU: 0.35, tileV: 0.35 });
  const crownBase = scaleRing(ring, 1.0, brimY + cm(0.45));
  const crownRings = [
    crownBase,
    scaleRing(ring, 1.12, brimY + cm(2.6)),
    scaleRing(ring, 1.08, brimY + cm(7.5)),
    scaleRing(ring, 0.9, brimY + cm(10.5)),
    scaleRing(ring, 0.72, brimY + cm(11.4)),
  ];
  const crownSides = loftRings(crownRings, { closedAround: true, tileU: 0.35, tileV: 0.35 });
  // Close the crown with a small top disk.
  const top = crownRings[crownRings.length - 1], topCenter: Vec3 = [0, brimY + cm(11.4), b.L.headZ];
  const capPos = [...topCenter, ...top.flat()], capVerts: number[] = [], capSizes: number[] = [];
  for (let i = 0; i < top.length; i++) { capSizes.push(3); capVerts.push(0, i + 1, ((i + 1) % top.length) + 1); }
  const cap: PolyMesh = { positions: Float32Array.from(capPos), faceSizes: Uint8Array.from(capSizes), faceVerts: Uint32Array.from(capVerts), faceUVs: new Uint32Array(capVerts.length), uvs: new Float32Array(2) };
  const crownMesh = merge([crownSides, cap])!;
  const sweatBandBottom = scaleRing(ring, 1.045, brimY + cm(0.7));
  const sweatBandTop = scaleRing(ring, 1.085, brimY + cm(2.4));
  const band = loftRings([sweatBandBottom, sweatBandTop], { closedAround: true, closedAcross: true, tileU: 0.15, tileV: 0.04 });
  const hatMaterial = cloth(g, 'Sand felt cowboy hat', st, { roughness: 0.88, doubleSided: true });
  const frontRim = ring.reduce((best, p) => p[2] > best[2] ? p : best, ring[0]);
  const badgeCenter: Vec3 = [0, brimY + cm(1.45), b.L.headZ + (frontRim[2] - b.L.headZ) * 1.06 + cm(0.6)];
  return [
    { mesh: crownMesh, material: hatMaterial, headwear: true, hidesHair: true, smooth: true },
    { mesh: brim, material: hatMaterial, headwear: true, hidesHair: true, smooth: true },
    { mesh: band, material: mat('Hat band', null, { color: '#5a3926', roughness: 0.75 }), headwear: true },
    { mesh: badge(badgeCenter, [0, 0, 1]), material: mat('Hat sheriff badge', null, { color: GOLD, roughness: 0.25, metalness: 0.85 }), headwear: true },
  ];
}

export const SHERIFF: GarmentDef[] = [
  { id: 'sheriff_shirt', label: 'Sheriff uniform shirt', slot: 'top', patterns: ['khaki', 'solid'], color: '#b7a487', color2: '#4c3626', build: sheriffShirt },
  { id: 'sheriff_trousers', label: 'Sheriff uniform trousers', slot: 'bottom', patterns: ['solid', 'khaki'], color: '#34352d', color2: GOLD, build: sheriffTrousers },
  { id: 'cowboy_hat', label: 'Cowboy hat', slot: 'acc', patterns: ['solid', 'leather'], color: '#d3bea0', color2: '#5a3926', build: cowboyHat },
];
