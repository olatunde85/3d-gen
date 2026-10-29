/**
 * Suits: a single-breasted jacket worn open over any top, and pressed trousers. The jacket has
 * padded shoulders, wide notch lapels lying on the chest from the neck down to the top button, a
 * collar round the back of the neck, and a skirt hanging over the seat with rounded front
 * corners, two buttons on the wearer's right front, flap pockets and a breast welt. The trousers
 * hang straight from the seat with pressed creases, breaking on the shoe.
 */
import type { PolyMesh } from '../geometry';
import { smoothstep, type Vec3 } from '../math';
import { cm, REGION, type VInfo } from './body';
import { blendToHull, crotchY, dressPts, hangRings, hideMask, looseSkin, part, seatOverLegs, soleY, wideLeg } from './drape';
import { clamp, cloth, isTrunk, isUpper, mat, points, shell, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { Caster, gridMesh, liftGrid, OUTWARD } from './project';
import { cord, ellipsoid, frameOf, loftRings, merge, orientOutward, solidBand, v3 } from './ring';

/** Point on a full hull ring (sample j at angle -PI + 2 PI j / n, 0 = front) at angle a. */
function ringAtAngle(ring: Vec3[], a: number): Vec3 {
  const n = ring.length, f = ((a + Math.PI) / (2 * Math.PI)) * n, i = Math.floor(f);
  return v3.lerp(ring[((i % n) + n) % n], ring[(((i + 1) % n) + n) % n], f - i);
}

/** Angle (0..PI, toward side s) where a full ring's front first reaches x = s * xc. */
function edgeAngle(ring: Vec3[], s: number, xc: number): number {
  let lo = 0, hi = Math.PI * 0.9;
  for (let it = 0; it < 24; it++) {
    const mid = (lo + hi) / 2;
    if (ringAtAngle(ring, s * mid)[0] * s < xc) lo = mid;
    else hi = mid;
  }
  return s * hi;
}

/**
 * A grid of points laid on a surface by casting at it: rows i (0..R) and columns j (0..C) map to
 * (x, y) by `at`; a ray that misses reuses its neighbour.
 */
function castGrid(cast: Caster, R: number, C: number, at: (i: number, j: number) => [number, number], fallbackZ: number): Vec3[][] {
  const grid: Vec3[][] = [];
  for (let i = 0; i <= R; i++) {
    const row: Vec3[] = [];
    for (let j = 0; j <= C; j++) {
      const [x, y] = at(i, j);
      const hit = cast.hit(x, y);
      const prev = row[row.length - 1] ?? grid[grid.length - 1]?.[j];
      row.push(hit ? hit.p : prev ?? [x, y, fallbackZ]);
    }
    grid.push(row);
  }
  return grid;
}

/** A flat patch (lapel, pocket flap) from a cast grid, lifted off the surface, with a rolled edge along `edge` (grid indices). */
function patch(grid: Vec3[][], lift: number, edge: (lifted: Vec3[][]) => Vec3[], edgeR: number): PolyMesh[] {
  const R = grid.length - 1, C = grid[0].length - 1;
  const lifted = liftGrid(grid, lift, OUTWARD.front, 1);
  const out = [orientOutward(gridMesh(lifted, 0.3), v3.madd(grid[R >> 1][C >> 1], OUTWARD.front, -1))];
  const e = edge(lifted);
  if (e.length > 1) out.push(cord(e, edgeR, false, 6));
  return out;
}

function suitJacket(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, sx = b.L.shoulderX;
  const m = cloth(g, 'Suit jacket', st, { roughness: 0.82 });
  const two = { ...m, doubleSided: true };
  // Low single-button stance: the lapels roll down to the top button; worn open, the fronts hang
  // apart by 2 xb.
  const ttBreak = 0.36, yBreak = torsoY(b, ttBreak);
  const xb = 0.34 * sx, xn = 0.5 * sx;
  const xEdge = (tt: number) => (tt < ttBreak ? xb : xb + (xn - xb) * clamp((tt - ttBreak) / (1 - ttBreak), 0, 1));
  const hemY = crotchY(b) - cm(2);
  const front = (v: VInfo) => Math.abs(v.tth) < Math.PI / 2;
  const opening = (v: VInfo) =>
    front(v) ? v.ax < xEdge(v.tt) : (v.ax / (0.4 * sx)) ** 2 + ((1.03 - v.tt) / 0.05) ** 2 < 1;
  // Padded shoulders: square and a little built up over the shoulder points.
  const pad = (v: VInfo) => (isUpper(v) ? clamp((v.ax / sx - 0.45) / 0.35, 0, 1) * clamp((v.tt - 0.78) / 0.14, 0, 1) : 0);
  const body = 2.3, sleeve = 2.5;
  const top = shell(g, {
    covers: (v) => (isUpper(v) && v.tt >= 0.32 && !opening(v)) || v.region === REGION.upperarm || (v.region === REGION.lowerarm && v.t < 0.93),
    offset: (v) =>
      // Room for a shirt's sleeves above the elbow, narrowing down the forearm.
      v.region === REGION.upperarm ? cm(sleeve + 0.4 * clamp(1 - v.t / 0.25, 0, 1) + 0.3 * clamp((0.85 - v.t) / 0.2, 0, 1))
      : v.region === REGION.lowerarm ? cm(sleeve - 0.4 * v.t)
      : cm(body + 0.7 * pad(v)),
    tile: 0.3, relax: 8, hemDepth: cm(0.35),
  });
  if (!top) return [];
  // Below the chest the jacket hangs straight from the widest point of the seat (and anything
  // worn under it), not following the waist in.
  const src = [...dressPts(b), ...(g.worn ?? [])];
  const skirtOff = cm(2.6), ySkirt = torsoY(b, 0.4);
  top.mesh = blendToHull(b, top.mesh, src, torsoY(b, 0.62), ySkirt, skirtOff);
  const parts: GPart[] = [{ mesh: top.mesh, material: m, hides: top.covered, smooth: true }];

  // Skirt: full hull rings from just above the top button down to the hem, cut open at the front.
  const full = hangRings(b, src, ySkirt + cm(2), hemY, { offset: skirtOff + cm(0.05), samples: 160, step: cm(1.5) });
  const rings: Vec3[][] = [];
  const M = 80, corner = cm(7);
  if (full)
    for (const ring of full) {
      const y = ring[0][1];
      // Rounded front corners: the edges curve back toward the sides near the hem.
      const dh = clamp(corner - (y - hemY), 0, corner);
      const xc = xb + corner - Math.sqrt(corner * corner - dh * dh);
      const aL = edgeAngle(ring, 1, xc), aR = edgeAngle(ring, -1, xc);
      const span = 2 * Math.PI + aR - aL;
      const r: Vec3[] = [];
      for (let k = 0; k < M; k++) r.push(ringAtAngle(ring, aL + (span * k) / (M - 1)));
      rings.push(r);
    }
  const skirt = rings.length > 1 ? orientOutward(loftRings(rings, { closedAround: false, tileU: 0.3, tileV: 0.3 }), [0, (ySkirt + hemY) / 2, b.L.torsoZ]) : null;
  // Finished edges: down each front and round the hem.
  const edges = rings.length > 1 ? merge([
    cord(rings.map((r) => r[0]), cm(0.3), false, 6),
    cord(rings.map((r) => r[M - 1]), cm(0.3), false, 6),
    cord(rings[rings.length - 1], cm(0.3), false, 6),
  ]) : null;
  for (const mesh of [skirt, edges]) if (mesh) parts.push({ mesh, material: two, skinAt: looseSkin(b, mesh, 0.25, 0.2) });

  // Lapels and collar lie on the jacket.
  const jacket = merge([top.mesh, skirt]) ?? top.mesh;
  const cast = new Caster(jacket, null, () => true, 'front');
  const flaps: PolyMesh[] = [];
  const ttNotch = 0.88, W = cm(11);
  for (const s of [1, -1]) {
    // Lapel: rows from the notch (i = 0) down to the top button (i = R); its inner edge is the roll
    // line down the opening; its outer edge runs straight from the button to the lapel's point.
    const R = 14, C = 7;
    const grid = castGrid(cast, R, C, (i, j) => {
      const t = i / R, u = j / C;
      const tt = ttNotch + (ttBreak - ttNotch) * t;
      const xIn = s * (xEdge(tt) - cm(0.6));
      // The top edge slopes down toward the point.
      return [xIn + s * u * W * (1 - t), torsoY(b, tt) - u * cm(1.6) * (1 - t)];
    }, b.L.torsoZ + cm(12));
    flaps.push(...patch(grid, cm(0.5), (l) => [...l.map((row) => row[C]).reverse(), ...l[0].slice(0, C).reverse()], cm(0.28)));
    // The roll line: a soft rounded fold down the lapel's inner edge.
    flaps.push(cord(liftGrid(grid, cm(0.5), OUTWARD.front, 1).map((row) => row[0]), cm(0.4), false, 6));
    // Collar, above the notch: from the lapel's inner edge out 4.5 cm, up to the neck.
    const K = 6;
    const collar = castGrid(cast, K, 4, (i, j) => {
      const t = i / K, u = j / 4;
      const tt = 0.965 + (ttNotch + 0.015 - 0.965) * t;
      const xIn = s * (xEdge(tt) - cm(0.6));
      // The notch: the collar's outer edge stops short of the lapel's point.
      return [xIn + s * u * cm(4.5) * (0.6 + 0.4 * t), torsoY(b, tt) - u * cm(0.8) * t];
    }, b.L.torsoZ + cm(12));
    flaps.push(...patch(collar, cm(0.55), (l) => [...l.map((row) => row[4]).reverse(), ...l[0].slice(0, 4).reverse()], cm(0.25)));
  }
  parts.push(...part(merge(flaps), two));
  // Collar round the back of the neck, over the shirt's.
  const neckPts = points(b, (v) => v.region === REGION.neck || (isTrunk(v) && v.tt > 0.86));
  const band = solidBand(neckPts, { origin: [0, b.L.neckY - cm(1.4), b.L.torsoZ], normal: v3.norm([0, 1, 0.3]) }, cm(4.5), cm(0.45), cm(body + 0.2), {
    samples: 64, slab: cm(1.6), arc: [Math.PI - 2.1, Math.PI + 2.1],
  });
  parts.push(...part(band, m));

  // Buttons on the wearer's right front: the top one at the lapels' break, the other 10 cm below.
  const btn = mat('Suit buttons', null, { color: '#d8c7b8', roughness: 0.35 });
  const btns: PolyMesh[] = [];
  for (const y of [yBreak - cm(1), yBreak - cm(11)]) {
    const hit = cast.hit(-(xb + cm(2)), y);
    if (hit) btns.push(ellipsoid(frameOf(v3.madd(hit.p, OUTWARD.front, cm(0.25)), OUTWARD.front, [0, 1, 0]), [cm(0.9), cm(0.9), cm(0.3)], [0.5, 0.5], 12, 5));
  }
  parts.push(...part(merge(btns), btn));
  // Flap pockets at the hips and a welt on the left breast.
  const pockets: PolyMesh[] = [];
  for (const s of [1, -1]) {
    const cx = s * 0.56 * sx, cy = yBreak - cm(14);
    const grid = castGrid(cast, 3, 8, (i, j) => [cx + (j / 8 - 0.5) * cm(13), cy + (0.5 - i / 3) * cm(5)], b.L.torsoZ + cm(12));
    pockets.push(...patch(grid, cm(0.3), (l) => l[3], cm(0.18)));
  }
  const welt = castGrid(cast, 2, 6, (i, j) => [0.62 * sx + (j / 6 - 0.5) * cm(10), torsoY(b, 0.7) + (j / 6 - 0.5) * cm(1.2) + (0.5 - i / 2) * cm(2.2)], b.L.torsoZ + cm(12));
  pockets.push(...patch(welt, cm(0.25), (l) => l[2], cm(0.12)));
  parts.push(...part(merge(pockets), two));
  return parts;
}

function suitTrousers(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const m = cloth(g, 'Suit trousers', st, { roughness: 0.82 });
  const yTop = crotchY(b) + cm(1.5);
  // Full length, the hem breaking on the shoe.
  const yHem = soleY(b) + cm(4);
  const seatShell = shell(g, {
    covers: (v, p) => (isTrunk(v) && v.t < 0.26) || (v.region === REGION.upperleg && p[1] > yTop - cm(4)),
    offset: cm(1.5), tile: 0.3, relax: 4, hemDepth: cm(0.25),
  });
  const legMat = { ...m, doubleSided: true };
  const parts: GPart[] = [], legs: PolyMesh[] = [];
  for (const s of [1, -1]) {
    // Straight and pressed: a crease down the front and back, few folds.
    const leg = wideLeg(b, s, yTop, yHem, { tile: 0.3, flareFrom: 0.08, crease: cm(0.35), folds: 0.35, hemW: cm(7.6) });
    if (!leg) continue;
    legs.push(leg.mesh);
    parts.push({ mesh: leg.mesh, material: legMat, skinAt: leg.skinAt });
  }
  if (seatShell) {
    seatOverLegs(seatShell.mesh, legs, yTop);
    parts.unshift({ mesh: seatShell.mesh, material: m, hides: seatShell.covered, smooth: true });
    // Waistband round the top.
    const yBand = torsoY(b, 0.235);
    const band = solidBand(points(b, isTrunk), { origin: [0, yBand, b.L.torsoZ], normal: [0, 1, 0] }, cm(3.8), cm(0.3), cm(1.75), { samples: 72, slab: cm(1.2) });
    parts.push(...part(band, m));
    // Fly (a curved seam from the waistband down to the crotch) and two pleats either side,
    // pressed into the front from the waistband and fading into the creases.
    const front = new Caster(seatShell.mesh, null, () => true, 'front');
    const seam = (pts: [number, number][]) => {
      const line: Vec3[] = [];
      for (const [x, y] of pts) {
        const hit = front.hit(x, y);
        if (hit) line.push(v3.madd(hit.p, OUTWARD.front, cm(0.03)));
      }
      return line.length > 2 ? cord(line, cm(0.1), false, 4) : null;
    };
    const yBot = yBand - cm(1.9), yFly = yTop + cm(3);
    const lines: (PolyMesh | null)[] = [];
    const fly: [number, number][] = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, y = yBot + (yFly - yBot) * t;
      // Down the left of the front, curving in to the crotch seam at the bottom.
      fly.push([cm(3.2) * (1 - smoothstep(0.7, 1, t)) + cm(0.2), y]);
    }
    lines.push(seam(fly), seam(Array.from({ length: 11 }, (_, k): [number, number] => [0, yBot + (yTop - yBot) * (k / 10)])));
    for (const s of [1, -1])
      for (const x of [0.32, 0.46]) {
        const x0 = s * x * b.L.shoulderX;
        lines.push(seam(Array.from({ length: 6 }, (_, k): [number, number] => [x0 + s * cm(0.3) * (k / 5), yBot - cm(8) * (k / 5)])));
      }
    parts.push(...part(merge(lines), { ...m, name: 'Suit trousers seams' }));
  }
  const hides = hideMask(g, (v, y) => (v.region === REGION.upperleg || v.region === REGION.lowerleg) && y < yTop - cm(1) && y > yHem + cm(6));
  const first = parts.findIndex((p) => p.material === legMat);
  if (first >= 0) parts[first] = { ...parts[first], hides };
  return parts;
}

export const SUIT: GarmentDef[] = [
  { id: 'suit_jacket', label: 'Suit jacket (open)', slot: 'jacket', patterns: ['linen', 'suiting', 'solid'], color: '#e9b7c0', color2: '#f3d6db', build: suitJacket },
  { id: 'suit_trousers', label: 'Suit trousers', slot: 'bottom', patterns: ['linen', 'suiting', 'solid'], color: '#e9b7c0', color2: '#f3d6db', build: suitTrousers },
];
