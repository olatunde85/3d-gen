/**
 * Prison jumpsuit, as a top and trousers in the same worn orange twill (worn together as the
 * "Prison jumpsuit" outfit set): an open collar over a button placket, sleeves rolled up above the
 * elbow, "DOC" stencilled on the chest and across the back; loose straight legs rolled up to
 * mid-shin.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import type { Material } from '../mesh';
import { cm, REGION } from './body';
import { crotchY, hideMask, part, seatOverLegs, soleY, wideLeg } from './drape';
import { clamp, cloth, cylinderUVs, isTrunk, isUpper, limbBand, mat, points, shell, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { Caster, gridMesh, liftGrid, OUTWARD } from './project';
import { cord, loftRings, merge, orientOutward, solidBand, v3 } from './ring';
import { placket, vNeck } from './shirts';
import { stencilText } from './textures';

/** A print laid on the front or back of the trunk: a w x h rectangle centred at (x, y), lifted `lift` off `surface`. */
function print(cast: Caster, x: number, y: number, w: number, h: number, lift: number, out: Vec3): PolyMesh | null {
  const R = 6, C = 14, grid: Vec3[][] = [];
  for (let i = 0; i <= R; i++) {
    const row: Vec3[] = [];
    for (let j = 0; j <= C; j++) {
      // Back prints read left to right from behind: mirror x.
      const u = j / C, px = x + (out[2] < 0 ? -1 : 1) * (u - 0.5) * w, py = y + (0.5 - i / R) * h;
      const hit = cast.hit(px, py);
      const prev = row[row.length - 1] ?? grid[grid.length - 1]?.[j];
      if (hit) row.push(hit.p);
      else if (prev) row.push(prev);
      else return null;
    }
    grid.push(row);
  }
  const m = gridMesh(liftGrid(grid, lift, out, 1), 1);
  const c = grid[R >> 1][C >> 1];
  // UVs: 0..1 across and down the print.
  const uvs = new Float32Array(m.uvs.length);
  for (let i = 0, k = 0; i <= R; i++) for (let j = 0; j <= C; j++, k++) uvs.set([j / C, 1 - i / R], k * 2);
  return orientOutward({ ...m, uvs, faceUVs: m.faceVerts }, v3.madd(c, out, -1));
}

function jumpsuitTop(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const m = cloth(g, 'Jumpsuit', st, { roughness: 0.92 });
  const sx = b.L.shoulderX;
  const ease = cm(1.5), sleeveEnd = 0.6;
  // Open collar: a V down the chest; a little lower at the back of the neck.
  const neck = vNeck(b, { ttV: 0.8, vw: 0.42 });
  const top = shell(g, {
    // Down to the waist seam, easing out at the bottom to lie over the trousers' seat.
    covers: (v) => ((isUpper(v) && v.tt >= 0.08) || (v.region === REGION.upperarm && v.t < sleeveEnd)) && !neck(v),
    offset: (v) => (v.region === REGION.upperarm ? ease + cm(0.4) + cm(1.6) * clamp(v.t / sleeveEnd, 0, 1) : ease + cm(0.6) * clamp((0.3 - v.tt) / 0.22, 0, 1)),
    tile: 0.3, relax: 6, hemDepth: cm(0.3),
  });
  if (top) top.mesh = cylinderUVs(top.mesh, 0, b.L.torsoZ, 0.3);
  // The skin stays round the neck and in the V (under the collar and facings): hiding it there
  // leaves holes along the cut.
  const hides = top && Uint8Array.from(top.covered);
  if (hides)
    for (let f = 0; f < hides.length; f++)
      for (let k = 0; k < 4 && hides[f]; k++) {
        const v = b.info[g.faceVerts[f * 4 + k]];
        if (v.region === REGION.neck || (isTrunk(v) && (v.tt > 0.9 || (v.tt > 0.76 && Math.abs(v.tth) < Math.PI / 2 && v.ax < 0.5 * sx)))) hides[f] = 0;
      }
  const parts: GPart[] = top && hides ? [{ mesh: top.mesh, material: m, hides, smooth: true }] : [];
  // Rolled sleeves: a thick roll of cloth at each sleeve's end.
  const rolls = merge([1, -1].map((s) => limbBand(b, REGION.upperarm, s, sleeveEnd - 0.04, cm(3.2), cm(0.7), ease + cm(1.6))));
  parts.push(...part(rolls, m));
  if (!top) return parts;
  // Simple V-neck: a narrow facing folded back down each side of the V, with a soft rolled edge,
  // and a low band round the back of the neck joining them.
  // (Cast only at the front panel: inside the V the rays would reach the back.)
  const P = top.mesh.positions, isFront: boolean[] = [];
  for (let f = 0, c = 0; f < top.mesh.faceSizes.length; c += top.mesh.faceSizes[f++]) {
    let z = 0;
    for (let k = 0; k < top.mesh.faceSizes[f]; k++) z += P[top.mesh.faceVerts[c + k] * 3 + 2] / top.mesh.faceSizes[f];
    isFront.push(z > b.L.torsoZ);
  }
  const front = new Caster(top.mesh, null, (f) => isFront[f], 'front');
  const back = new Caster(top.mesh, null, () => true, 'back');
  const facings: PolyMesh[] = [];
  for (const s of [1, -1]) {
    // Rows down the V, from as high as the front panel reaches (rays above it miss) to its point.
    let ttTop = 1.0;
    while (ttTop > 0.9 && !front.hit(s * (0.42 * sx * clamp((ttTop - 0.8) / 0.2, 0, 1) + cm(3)), torsoY(b, ttTop))) ttTop -= 0.005;
    const R = 14, C = 3, grid: Vec3[][] = [];
    for (let i = 0; i <= R; i++) {
      const t = i / R, tt = ttTop + (0.8 - ttTop) * t, row: Vec3[] = [];
      const edge = 0.42 * sx * clamp((tt - 0.8) / 0.2, 0, 1) + cm(0.6);
      for (let j = 0; j <= C; j++) {
        // From inside the cut edge (covering it) out 3.5 cm, narrowing to the V's point.
        const x = s * (edge - cm(0.9) + (j / C) * cm(3.5) * (1 - 0.6 * t));
        const hit = front.hit(x, torsoY(b, tt));
        const prev = row[row.length - 1] ?? grid[grid.length - 1]?.[j];
        if (hit) row.push(hit.p);
        else if (prev) row.push([x, prev[1], prev[2]]);
        else row.push([x, torsoY(b, tt), b.L.torsoZ + cm(10)]);
      }
      grid.push(row);
    }
    const lifted = liftGrid(grid, cm(0.3), OUTWARD.front, 1);
    facings.push(orientOutward(gridMesh(lifted, 0.3), v3.madd(grid[R >> 1][1], OUTWARD.front, -1)));
    // The fold along the V.
    facings.push(cord(lifted.map((row) => row[0]), cm(0.3), false, 6));
  }
  const neckPts = points(b, (v) => v.region === REGION.neck || (isTrunk(v) && v.tt > 0.9));
  // Tilted so it dips toward the front, where its ends meet the facings' tops (covering the cut).
  const band = solidBand(neckPts, { origin: [0, b.L.neckY - cm(0.8), b.L.torsoZ], normal: v3.norm([0, 1, 0.45]) }, cm(2.8), cm(0.35), ease * 0.8, {
    samples: 48, slab: cm(1.4), arc: [Math.PI - 2.15, Math.PI + 2.15],
  });
  parts.push(...part(merge([...facings, band]), { ...m, doubleSided: true }));
  // Button placket: from the V's point down to the waist.
  parts.push(...placket(g, top.mesh, m, { ttV: 0.8, buttons: 4, spacing: cm(9), placketTo: 0.12, buttonColor: '#d8d2c4' }));
  // "DOC": small on the left chest, large across the upper back.
  const ink = mat('DOC print', g.texture('stencil_DOC_#1c1a18', () => stencilText('DOC', '#1c1a18')), { roughness: 0.8 });
  const chest = print(front, 0.7 * sx, torsoY(b, 0.72), cm(6.5), cm(2.4), cm(0.06), OUTWARD.front);
  const across = print(back, 0, torsoY(b, 0.78), cm(26), cm(9), cm(0.06), OUTWARD.back);
  parts.push(...part(merge([chest, across]), { ...ink, alpha: 'mask' }));
  return parts;
}

/** A rolled cuff round a leg's hem: a thick soft roll of cloth just outside the hem ring. */
function cuff(hem: Vec3[]): PolyMesh {
  let c: Vec3 = [0, 0, 0];
  for (const p of hem) c = v3.add(c, v3.scale(p, 1 / hem.length));
  const ring = (k: number, dy: number) => hem.map((p) => [c[0] + (p[0] - c[0]) * k, p[1] + dy, c[2] + (p[2] - c[2]) * k] as Vec3);
  // Profile: from inside the hem, round over the outside and back in at the top.
  const rings = [ring(0.97, -cm(0.2)), ring(1.06, cm(0.4)), ring(1.1, cm(2)), ring(1.08, cm(3.8)), ring(1.02, cm(4.6)), ring(0.97, cm(4.4))];
  return orientOutward(loftRings([...rings, rings[0]].map((r) => [...r, r[0]]), { closedAround: false, tileU: 0.25, tileV: 0.25 }), [c[0], hem[0][1] + cm(2), c[2]]);
}

function jumpsuitTrousers(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const m = cloth(g, 'Jumpsuit trousers', st, { roughness: 0.92 });
  const yTop = crotchY(b) + cm(1.5);
  // Rolled up to mid-shin: the hem 18 cm above the soles.
  const yHem = soleY(b) + cm(18);
  const seatShell = shell(g, {
    covers: (v, p) => (isTrunk(v) && v.t < 0.24) || (v.region === REGION.upperleg && p[1] > yTop - cm(4)),
    offset: cm(1.75), tile: 0.3, relax: 4, hemDepth: cm(0.25),
  });
  const legMat: Material = { ...m, doubleSided: true };
  const parts: GPart[] = [];
  const cuffs: PolyMesh[] = [];
  const legs: PolyMesh[] = [];
  for (const s of [1, -1]) {
    const leg = wideLeg(b, s, yTop, yHem, { tile: 0.3, flareFrom: 0.08 });
    if (!leg) continue;
    legs.push(leg.mesh);
    parts.push({ mesh: leg.mesh, material: legMat, skinAt: leg.skinAt });
    // The hem ring: the leg's lowest vertices, in order round the leg.
    const P = leg.mesh.positions;
    const hem: Vec3[] = [];
    for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - yHem) < cm(0.05)) hem.push([P[i], P[i + 1], P[i + 2]]);
    if (hem.length > 8) {
      let c: Vec3 = [0, 0, 0];
      for (const p of hem) c = v3.add(c, v3.scale(p, 1 / hem.length));
      hem.sort((p, q) => Math.atan2(p[0] - c[0], p[2] - c[2]) - Math.atan2(q[0] - c[0], q[2] - c[2]));
      // Drop the duplicated seam vertex.
      const uniq = hem.filter((p, i) => i === 0 || v3.len(v3.sub(p, hem[i - 1])) > 1e-6);
      cuffs.push(cuff(uniq));
    }
  }
  // The seat covers the legs' tops: pushed out over them where it overlaps.
  const seat: GPart[] = [];
  if (seatShell) {
    seatOverLegs(seatShell.mesh, legs, yTop);
    seat.push({ mesh: cylinderUVs(seatShell.mesh, 0, b.L.torsoZ, 0.3), material: m, hides: seatShell.covered, smooth: true });
  }
  parts.unshift(...seat);
  const hides = hideMask(g, (v, y) => (v.region === REGION.upperleg || v.region === REGION.lowerleg) && y < yTop - cm(1) && y > yHem + cm(6));
  if (parts.length > seat.length) parts[seat.length] = { ...parts[seat.length], hides };
  // Cuffs move with the lower legs.
  const cuffMesh = merge(cuffs);
  if (cuffMesh) parts.push({ mesh: cuffMesh, material: legMat, skinAt: cuffMesh.positions.map((x, i) => (i % 3 === 1 ? x + cm(3) : x)) });
  return parts;
}

export const PRISON: GarmentDef[] = [
  { id: 'prison_top', label: 'Jumpsuit top (rolled sleeves)', slot: 'top', patterns: ['workwear', 'solid'], color: '#e2621f', color2: '#4a3a2a', build: jumpsuitTop },
  { id: 'prison_trousers', label: 'Jumpsuit trousers (rolled up)', slot: 'bottom', patterns: ['workwear', 'solid'], color: '#e2621f', color2: '#4a3a2a', build: jumpsuitTrousers },
];
