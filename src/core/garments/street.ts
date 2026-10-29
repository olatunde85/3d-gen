/**
 * Streetwear: an oversized tee, baggy jeans stacked at the ankle, and a baseball cap.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, noise3, REGION, type Body, type VInfo } from './body';
import { dressPts, hideMask, knee, looseSkin, part } from './drape';
import { clamp, cloth, hplane, isTrunk, isUpper, mat, points, shell, shellPart, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { Caster, gridMesh, gridOutline, liftGrid, OUTWARD } from './project';
import { cord, ellipsoid, frameOf, hullRing, loftRings, merge, orientOutward, rayRing, solidBand, v3 } from './ring';
import { jeansLegTexture } from './textures';

/** Height a fraction f of the way from the hip joints (0) down to the knees (1). */
const legY = (b: Body, f: number) => b.L.hipY - (b.L.hipY - knee(b)) * f;

// --- Oversized tee ---------------------------------------------------------------------------

/**
 * The outline loose cloth hangs on: in each direction round a vertical axis, the farthest the body
 * reaches at this height or anywhere above it (down from `yStart`), so the cloth falls straight
 * from the widest point instead of following the waist in.
 */
function drapeEnvelope(b: Body, src: Vec3[], yStart: number, yEnd: number, c: [number, number]) {
  const N = 96, step = cm(1);
  const rows: Float32Array[] = [];
  const cum = new Float32Array(N);
  for (let k = 0, y = yStart; y >= yEnd - step; k++, y = yStart - k * step) {
    const ring = hullRing(src, hplane(b, y), { slab: cm(1.2), samples: 96, offset: 0 });
    if (ring)
      for (let j = 0; j < N; j++) {
        const a = -Math.PI + (2 * Math.PI * j) / N;
        const r = rayRing(ring, [c[0], y, c[1]], [Math.sin(a), 0, Math.cos(a)]);
        if (r !== null) cum[j] = Math.max(cum[j], r);
      }
    rows.push(cum.slice());
  }
  /** Radius at height y in direction a (radians, 0 = front). */
  return (y: number, a: number) => {
    const fk = clamp((yStart - y) / step, 0, rows.length - 1), k0 = Math.floor(fk), k1 = Math.min(rows.length - 1, k0 + 1);
    const fj = (((a + Math.PI) / (2 * Math.PI)) * N + N) % N, j0 = Math.floor(fj) % N, j1 = (j0 + 1) % N;
    const at = (row: Float32Array) => row[j0] + (row[j1] - row[j0]) * (fj - Math.floor(fj));
    return at(rows[k0]) + (at(rows[k1]) - at(rows[k0])) * (fk - k0);
  };
}

/** Boundary loops of a quad mesh (vertex indices), unordered within each loop. */
function boundaryLoops(m: PolyMesh): number[][] {
  const count = new Map<string, number>();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let f = 0, c = 0; f < m.faceSizes.length; c += m.faceSizes[f++])
    for (let k = 0; k < m.faceSizes[f]; k++) {
      const e = key(m.faceVerts[c + k], m.faceVerts[c + ((k + 1) % m.faceSizes[f])]);
      count.set(e, (count.get(e) ?? 0) + 1);
    }
  const nb = new Map<number, number[]>();
  for (const [e, n] of count) {
    if (n !== 1) continue;
    const [a, b] = e.split(',').map(Number);
    nb.set(a, [...(nb.get(a) ?? []), b]);
    nb.set(b, [...(nb.get(b) ?? []), a]);
  }
  const seen = new Set<number>(), loops: number[][] = [];
  for (const v0 of nb.keys()) {
    if (seen.has(v0)) continue;
    const loop: number[] = [], stack = [v0];
    while (stack.length) {
      const v = stack.pop()!;
      if (seen.has(v)) continue;
      seen.add(v);
      loop.push(v);
      for (const w of nb.get(v) ?? []) if (!seen.has(w)) stack.push(w);
    }
    loops.push(loop);
  }
  return loops;
}

/**
 * Oversized tee: dropped shoulders, roomy sleeves to the elbow and a long body hanging straight
 * from the chest to the top of the thighs, as one continuous surface: the fitted top eases out
 * onto the drape envelope below the chest, and below the hips the cloth is lofted straight down
 * from the top's own hem vertices on the same envelope (so there is no join to see). A ribbed crew
 * neck finishes the neckline.
 */
function oversizedTee(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const m = { ...cloth(g, 'Oversized tee', st, { roughness: 0.95 }), doubleSided: true };
  const sx = b.L.shoulderX;
  const ease = cm(1.6);
  // Crew neck: an ellipse round the base of the neck, a little deeper at the front.
  const neck = (v: VInfo) => (v.ax / (0.38 * sx)) ** 2 + ((1.02 - v.tt) / (Math.abs(v.tth) > Math.PI / 2 ? 0.035 : 0.08)) ** 2 < 1;
  const yJoin = torsoY(b, 0.16), hem = legY(b, 0.3);
  const top = shell(g, {
    covers: (v, p) => ((isUpper(v) && p[1] > yJoin) || (v.region === REGION.upperarm && v.t < 0.82)) && !neck(v),
    // Roomy sleeves from the shoulder down, wider toward the opening.
    offset: (v) => (v.region === REGION.upperarm ? ease + cm(1.6) + cm(3.4) * clamp(v.t / 0.82, 0, 1) : ease),
    tile: 0.3, relax: 6, noRim: true,
  });
  if (!top?.mesh.ref) return [];
  // Hangs over trousers when worn with them.
  const drop = ease + cm(0.4) + (g.layered.bottom ? cm(2.4) : 0);
  const axis: [number, number] = [0, b.L.torsoZ];
  const env = drapeEnvelope(b, dressPts(b), torsoY(b, 0.78), hem, axis);
  const yFrom = torsoY(b, 0.97), yEase = torsoY(b, 0.7);
  const P = top.mesh.positions;
  for (let i = 0; i < P.length / 3; i++) {
    const r = top.mesh.ref[i];
    if (r < 0 || !isTrunk(b.info[r])) continue;
    const y = P[i * 3 + 1];
    if (y >= yFrom) continue;
    const l = clamp((yFrom - y) / (yFrom - yEase), 0, 1), w = l * l * (3 - 2 * l);
    const dx = P[i * 3] - axis[0], dz = P[i * 3 + 2] - axis[1];
    const rc = Math.hypot(dx, dz) || 1, target = env(y, Math.atan2(dx, dz)) + drop;
    if (rc >= target) continue;
    const k = (rc + (target - rc) * w) / rc;
    P[i * 3] = axis[0] + dx * k;
    P[i * 3 + 2] = axis[1] + dz * k;
  }
  // The lowest open edge is the waist hem: continue the cloth straight down from it.
  const loops = boundaryLoops(top.mesh);
  const avgY = (l: number[]) => l.reduce((s2, v) => s2 + P[v * 3 + 1], 0) / l.length;
  const waist = loops.reduce((a, l) => (avgY(l) < avgY(a) ? l : a));
  const angle = (v: number) => Math.atan2(P[v * 3] - axis[0], P[v * 3 + 2] - axis[1]);
  waist.sort((a, c) => angle(a) - angle(c));
  const n0 = P.length / 3, Wn = waist.length, R = Math.max(6, Math.ceil((avgY(waist) - hem) / cm(1.5)));
  const pos = Array.from(P), uvs = Array.from(top.mesh.uvs), fv = Array.from(top.mesh.faceVerts), fu = Array.from(top.mesh.faceUVs), sizes = Array.from(top.mesh.faceSizes);
  const refs = Array.from(top.mesh.ref);
  const uvBase = uvs.length / 2;
  for (let i = 1; i <= R; i++) {
    const t = i / R;
    for (const v of waist) {
      const a = angle(v), y0 = P[v * 3 + 1], y = y0 + (hem - y0) * t;
      const fold = cm(0.5) * t * Math.sin(a * 7 + 0.4);
      const r = env(y, a) + drop + fold;
      pos.push(axis[0] + Math.sin(a) * r, y, axis[1] + Math.cos(a) * r);
      refs.push(-1);
    }
  }
  // UVs: the hanging part continues the top's own UVs straight down from each hem vertex, sharing
  // them at the hem so the surface is one piece there (no split vertices, no shading seam).
  const hemUV = new Map<number, number>();
  for (let k = 0; k < top.mesh.faceVerts.length; k++) if (!hemUV.has(top.mesh.faceVerts[k])) hemUV.set(top.mesh.faceVerts[k], top.mesh.faceUVs[k]);
  const step = (avgY(waist) - hem) / R;
  for (let i = 1; i <= R; i++)
    for (const v of waist) {
      const t0 = hemUV.get(v)!;
      uvs.push(top.mesh.uvs[t0 * 2], top.mesh.uvs[t0 * 2 + 1] - (i * step * 0.1) / 0.3);
    }
  const vid = (i: number, j: number) => (i === 0 ? waist[j % Wn] : n0 + (i - 1) * Wn + (j % Wn));
  const uid = (i: number, j: number) => (i === 0 ? hemUV.get(waist[j % Wn])! : uvBase + (i - 1) * Wn + (j % Wn));
  // Wind the hanging part's quads outward, like the top's (the two share the hem's vertices, whose
  // normals would otherwise cancel into a crease).
  const outward = (() => {
    const a = vid(1, 0), c = vid(1, 1), d = vid(2, 0);
    const p0 = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]], e1 = [0, 1, 2].map((k) => pos[c * 3 + k] - p0[k]), e2 = [0, 1, 2].map((k) => pos[d * 3 + k] - p0[k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    return n[0] * (p0[0] - axis[0]) + n[2] * (p0[2] - axis[1]) > 0;
  })();
  for (let i = 0; i < R; i++)
    for (let j = 0; j < Wn; j++) {
      const q = [[i, j], [i, j + 1], [i + 1, j + 1], [i + 1, j]];
      if (!outward) q.reverse();
      sizes.push(4);
      fv.push(...q.map(([r, c]) => vid(r, c)));
      fu.push(...q.map(([r, c]) => uid(r, c)));
    }
  const tee: PolyMesh = {
    positions: Float32Array.from(pos), uvs: Float32Array.from(uvs), faceVerts: Uint32Array.from(fv), faceUVs: Uint32Array.from(fu),
    faceSizes: Uint8Array.from(sizes), ref: Int32Array.from(refs),
  };
  // Skin weights: the hanging part and the lower body of the top (below the chest) move as loose
  // cloth, so they stay together at the join in every pose; the rest of the top follows the body.
  const yLoose = torsoY(b, 0.55);
  for (let i = 0; i < n0; i++) if (refs[i] >= 0 && isTrunk(b.info[refs[i]]) && pos[i * 3 + 1] < yLoose) refs[i] = -1;
  tee.ref = Int32Array.from(refs);
  const skinAt = looseSkin(b, tee);
  const parts: GPart[] = [{ mesh: tee, material: m, hides: top.covered, smooth: true, skinAt }];
  // Ribbed crew neck band.
  const neckPts = points(b, (v) => v.region === REGION.neck || (isTrunk(v) && v.tt > 0.9));
  // The band follows the neckline: lower at the front than at the back.
  const rib = solidBand(neckPts, { origin: [0, b.L.neckY - cm(1.6), b.L.torsoZ], normal: v3.norm([0, 1, 0.3]) }, cm(2), cm(0.35), ease * 0.6, { samples: 64, slab: cm(1.2), uRepeats: 40 });
  parts.push(...part(rib, cloth(g, 'Tee rib', { ...st, pattern: 'rib' }, { roughness: 0.95 })));
  return parts;
}

// --- Baggy jeans -----------------------------------------------------------------------------

/** Lowest point of the trunk between the legs. */
function crotchY(b: Body): number {
  let y = Infinity;
  for (let v = 0; v < b.info.length; v++) if (isTrunk(b.info[v]) && Math.abs(b.coords[v * 3]) < cm(1.5)) y = Math.min(y, b.coords[v * 3 + 1]);
  return y;
}

/** Lowest point of the feet (the floor under them, before any shoes lift the body). */
function soleY(b: Body): number {
  let y = Infinity;
  for (const v of b.verts(REGION.foot)) y = Math.min(y, b.coords[v * 3 + 1]);
  return y;
}

const smooth01 = (t: number) => t * t * (3 - 2 * t);

/**
 * One jeans leg (side s): it hangs from the thigh around an axis running down to the ankle, wide
 * and nearly straight, never closer to the leg than `ease`; soft irregular drape folds grow toward
 * the hem, where the fabric stacks in a few bunched rings over the shoe. The hem sits higher at the
 * front, where it rests on the shoe. UVs unwrap the leg for the wash texture (u: 0.5 front, 0.75
 * outer side; v: 0 top, 1 hem).
 */
function jeansLeg(b: Body, s: number, yTop: number, yHem: number): { mesh: PolyMesh; skinAt: Float32Array } | null {
  const src = points(b, (v) => (v.region === REGION.upperleg || v.region === REGION.lowerleg) && v.side === s).filter((p) => p[0] * s > cm(1));
  const hulls = new Map<number, Vec3[] | null>();
  const hullAt = (y: number) => {
    const k = Math.round(y / cm(1));
    if (!hulls.has(k)) hulls.set(k, hullRing(src, hplane(b, k * cm(1)), { slab: cm(1.2), samples: 96, offset: 0 }));
    return hulls.get(k)!;
  };
  const top = hullAt(yTop);
  if (!top) return null;
  let cTop: Vec3 = [0, 0, 0];
  for (const p of top) cTop = v3.add(cTop, v3.scale(p, 1 / top.length));
  const ank = b.joint(`foot${s > 0 ? '.L' : '.R'}____head`);
  const cBot: Vec3 = [ank[0], 0, ank[2] + cm(1)];
  let thighR = 0;
  for (const p of top) thighR += Math.hypot(p[0] - cTop[0], p[2] - cTop[2]) / top.length;
  const ease = cm(1.6);
  const topW = thighR + cm(2), hemW = Math.max(cm(9.5), thighR * 0.95);
  const N = 48, R = Math.max(20, Math.round((yTop - yHem) / cm(1.8)));
  // Radii first (rows x columns), so they can be smoothed down each column.
  const radius: number[][] = [], ys: number[][] = [], dirs: Vec3[] = [];
  for (let j = 0; j < N; j++) {
    const a = ((j / N) * 2 * Math.PI - Math.PI) * s; // u = j / N; mirrored on the right leg so u 0.75 is always the outer side
    dirs.push([Math.sin(a), 0, Math.cos(a)]);
  }
  const centre = (t: number): Vec3 => v3.lerp([cTop[0], 0, cTop[2]], cBot, smooth01(t));
  for (let i = 0; i <= R; i++) {
    const t = i / R;
    const rr: number[] = [], yy: number[] = [];
    for (let j = 0; j < N; j++) {
      const d = dirs[j];
      // Hem: higher at the front (resting on the shoe), lower at the back.
      const y = yTop + (yHem + cm(2.2) * Math.max(0, d[2]) - yTop) * t;
      const c = centre(t);
      const w = topW + (hemW - topW) * smooth01(Math.min(1, t * 1.6));
      const rx = w * 0.95, rz = w * 1.06;
      const hull = hullAt(y);
      const legR = hull ? rayRing(hull, [c[0], y, c[2]], d) : null;
      // At the top the leg follows the thigh (meeting the seat without a step), then eases out
      // to its full, straight width.
      const fit = legR !== null ? legR + ease : 0;
      const drape = 1 / Math.hypot(d[0] / rx, d[2] / rz);
      let r = Math.max(fit, fit + (drape - fit) * smooth01(Math.min(1, t / 0.18)));
      // Drape folds: low-frequency, irregular, growing down the leg.
      r += cm(0.9) * smooth01(Math.min(1, t * 1.3)) * (noise3(d[0] * 1.3 + s * 3, d[2] * 1.3, y * 2.2) - 0.5) * 2;
      // Stacking over the shoe: bunched horizontal folds rather than a flare.
      const st = Math.max(0, (t - 0.8) / 0.2);
      r += st * (cm(0.3) + cm(0.9) * Math.sin(y / cm(1.6) + noise3(d[0] * 2 + 7, d[2] * 2, y * 4) * 4));
      rr.push(r);
      yy.push(y);
    }
    radius.push(rr);
    ys.push(yy);
  }
  for (let it = 0; it < 2; it++)
    for (let i = 1; i < R; i++) for (let j = 0; j < N; j++) radius[i][j] = (radius[i - 1][j] + 2 * radius[i][j] + radius[i + 1][j]) / 4;
  // Mesh: an extra column closes the loop with its own UVs (u = 1).
  const pos: number[] = [], uv: number[] = [], look: number[] = [];
  for (let i = 0; i <= R; i++) {
    const t = i / R, c = centre(t);
    for (let j = 0; j <= N; j++) {
      const jj = j % N, d = dirs[jj], r = radius[i][jj], y = ys[i][jj];
      pos.push(c[0] + d[0] * r, y, c[2] + d[2] * r);
      uv.push(j / N, 1 - t);
      // Skin lookup: pulled in toward this leg's own surface (not the other leg's).
      look.push(c[0] + d[0] * r * 0.35, y, c[2] + d[2] * r * 0.35);
    }
  }
  const sizes: number[] = [], fv: number[] = [];
  for (let i = 0; i < R; i++)
    for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j;
      sizes.push(4);
      fv.push(a, a + 1, a + N + 2, a + N + 1);
    }
  const mesh = orientOutward(
    { positions: Float32Array.from(pos), faceSizes: Uint8Array.from(sizes), faceVerts: Uint32Array.from(fv), faceUVs: Uint32Array.from(fv), uvs: Float32Array.from(uv) },
    [cTop[0], (yTop + yHem) / 2, cTop[2]],
  );
  return { mesh, skinAt: Float32Array.from(look) };
}

/**
 * Baggy jeans: a seat that sits on the hips and wide legs hanging nearly straight from the thighs,
 * long enough to stack over the shoes, washed lighter on the thighs and knees. Back pockets with
 * contrast topstitching.
 */
function baggyJeans(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const m = cloth(g, 'Baggy jeans', st, { roughness: 0.88 });
  const thread = mat('Jeans topstitch', null, { color: '#c4923e', roughness: 0.6 });
  const yTop = crotchY(b) + cm(1.5), yHem = soleY(b) + cm(3);
  const seat = shellPart(g, {
    covers: (v, p) => (isTrunk(v) && v.t < 0.22) || (v.region === REGION.upperleg && p[1] > yTop - cm(2)),
    offset: cm(1.5),
    tile: 0.25, relax: 4,
  }, m);
  const wash = g.texture(`jeansleg_${st.color}_${st.color2}`, () => jeansLegTexture(st.color, st.color2));
  const legMat = mat('Jeans legs', wash, { roughness: 0.9, doubleSided: true });
  const parts: GPart[] = [...seat];
  for (const s of [1, -1]) {
    const leg = jeansLeg(b, s, yTop, yHem);
    if (leg) parts.push({ mesh: leg.mesh, material: legMat, skinAt: leg.skinAt });
  }
  // Skin hidden under both legs (a body-wide mask, carried by the first leg).
  const hides = hideMask(g, (v, y) => (v.region === REGION.upperleg || v.region === REGION.lowerleg) && y < yTop - cm(1) && y > yHem + cm(8));
  if (parts.length > seat.length) parts[seat.length] = { ...parts[seat.length], hides };
  const waist = solidBand(points(b, isTrunk), hplane(b, torsoY(b, 0.21)), cm(3.8), cm(0.35), cm(1.6), { samples: 64, tileU: 0.25 });
  return [...parts, ...part(waist, m), ...backPockets(g, m, thread)];
}

/** Two back pockets laid on the seat, with a double row of topstitching round their edges. */
function backPockets(g: GCtx, m: ReturnType<typeof cloth>, thread: ReturnType<typeof mat>): GPart[] {
  const b = g.body;
  const keep = (f: number) => {
    const v = b.info[g.faceVerts[f * 4]];
    return isTrunk(v) || (v.region === REGION.upperleg && v.t < 0.3);
  };
  const cast = new Caster(b, g.faceVerts, keep, 'back');
  const pockets: PolyMesh[] = [], stitches: PolyMesh[] = [];
  const y0 = b.L.hipY + cm(3), h = cm(15), w = cm(13);
  for (const s of [1, -1]) {
    const grid: Vec3[][] = [];
    for (let i = 0; i <= 10; i++) {
      const v = i / 10;
      const row: Vec3[] = [];
      for (let j = 0; j <= 10; j++) {
        const u = j / 10;
        // A pocket's point at the bottom: the sides narrow over the last third.
        const taper = v < 0.3 ? 1 - (0.3 - v) * 0.35 : 1;
        const x = s * (cm(4) + w * (0.5 + (u - 0.5) * taper));
        const y = y0 - h * v - (v < 0.3 ? cm(2.2) * (1 - Math.abs(u - 0.5) * 2) * ((0.3 - v) / 0.3) : 0);
        const hit = cast.hit(x, y);
        if (!hit) return [];
        row.push(hit.p);
      }
      grid.push(row);
    }
    const lifted = liftGrid(grid.reverse(), cm(1.95), OUTWARD.back, 1);
    pockets.push(gridMesh(lifted, 0.25));
    const edge = gridOutline(lifted).map((p) => v3.madd(p, OUTWARD.back, cm(0.05)));
    stitches.push(cord([...edge, edge[0]], cm(0.06), false, 4));
  }
  return [...part(merge(pockets), m), ...part(merge(stitches), thread)];
}

// --- Baseball cap ---------------------------------------------------------------------------

/**
 * Baseball cap, built from one band line: a plane round the head through the visor's root (level,
 * dipping slightly toward the back, above the ears). The crown is lofted up from that band ring
 * through the head's cross-sections in planes parallel to it (snug, with a little structure at the
 * front) and closed at a button; the visor is rooted on the same band ring, so the two meet exactly.
 */
function baseballCap(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const H = b.L.crownY - b.L.chinY;
  const smoothstep = (e0: number, e1: number, x: number) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const head = points(b, (v) => v.region === REGION.head);
  // Band plane: through the forehead just above the brows, tilting down 1.5 cm toward the back.
  const brimY = b.L.chinY + 0.615 * H;
  const n = v3.norm([0, 1, -0.08]);
  const O: Vec3 = [0, brimY, b.L.headZ];
  const S = 72;
  const off = (d: number, a: number) => cm(0.7) + cm(1.1) * smoothstep(cm(1), cm(7), d) * Math.max(0, Math.cos(a)) ** 2;
  const rings: Vec3[][] = [];
  for (let d = 0; ; d += cm(0.8)) {
    const r = hullRing(head, { origin: v3.madd(O, n, d), normal: n, ref: [0, 0, 1] }, { slab: cm(0.7), samples: S, offset: (a) => off(d, a) });
    if (!r) break;
    let c: Vec3 = [0, 0, 0];
    for (const p of r) c = v3.add(c, v3.scale(p, 1 / S));
    const rad = r.reduce((m, p) => m + v3.len(v3.sub(p, c)), 0) / S;
    if (rad < cm(2.5)) break;
    rings.push(r);
  }
  if (rings.length < 3) return [];
  // Side panels: from the visor's ends round the back, the crown's lower edge comes down level
  // with the visor's drooping side edge (so the two meet). It stays snug on the skull, so the ears
  // stand out in front of it.
  const band0 = rings[0];
  let cb: Vec3 = [0, 0, 0];
  for (const p of band0) cb = v3.add(cb, v3.scale(p, 1 / S));
  // The skull without the ears: below the band, points further out than the band's own radius
  // in their direction (less the cap's ease) are ears; the panels wrap the skull behind them.
  const bandR = (q: Vec3) => {
    const a = Math.atan2(q[0] - cb[0], q[2] - cb[2]);
    const p0 = band0[((Math.round(((a + Math.PI) / (2 * Math.PI)) * S) % S) + S) % S];
    return Math.hypot(p0[0] - cb[0], p0[2] - cb[2]);
  };
  const skull = head.filter((q) => q[1] > brimY || Math.hypot(q[0] - cb[0], q[2] - cb[2]) < bandR(q) - cm(0.3));
  const hulls = new Map<number, Vec3[] | null>();
  const hullAt = (y: number) => {
    const k = Math.round(y / cm(0.4));
    if (!hulls.has(k)) hulls.set(k, hullRing(skull, hplane(b, k * cm(0.4)), { slab: cm(0.6), samples: 128, offset: 0 }));
    return hulls.get(k)!;
  };
  const visorDrop = cm(2.4), visorA = 0.85;
  const edgeY: number[] = [];
  for (let j = 0; j < S; j++) {
    const a = -Math.PI + (2 * Math.PI * j) / S, p0 = band0[j];
    // Level with the visor's root where the visor is, dipping down behind its ends.
    const y = p0[1] - visorDrop * smoothstep(visorA - 0.05, visorA + 0.45, Math.abs(a));
    edgeY.push(Math.min(y, p0[1]));
  }
  // A smooth edge line round the head.
  for (let it = 0; it < 6; it++) {
    const e = [...edgeY];
    for (let j = 0; j < S; j++) edgeY[j] = Math.min(band0[j][1], (e[(j + S - 1) % S] + 2 * e[j] + e[(j + 1) % S]) / 4);
  }
  const K = 5, skirt: Vec3[][] = [];
  for (let k = K; k >= 1; k--) {
    const row: Vec3[] = [];
    for (let j = 0; j < S; j++) {
      const p0 = band0[j];
      const y = p0[1] + (edgeY[j] - p0[1]) * (k / K);
      const dir = v3.norm([p0[0] - cb[0], 0, p0[2] - cb[2]]);
      const h = hullAt(y);
      const r = h ? rayRing(h, [cb[0], y, cb[2]], dir) : null;
      const r0 = Math.hypot(p0[0] - cb[0], p0[2] - cb[2]);
      const rr = r !== null ? Math.min(r + cm(0.7), r0 * 1.02) : r0;
      row.push([cb[0] + dir[0] * rr, y, cb[2] + dir[2] * rr]);
    }
    skirt.push(row);
  }
  rings.unshift(...skirt);
  // Smooth the crown: round each cross-section (the hull of sparse head points is faceted) and
  // even out the profile from ring to ring, never pulling inside the original surface.
  for (let it = 0; it < 6; it++)
    for (const r of rings) {
      const prev = r.map((p) => [...p] as Vec3);
      for (let j = 0; j < S; j++) {
        const q = v3.scale(v3.add(v3.add(prev[(j + S - 1) % S], prev[(j + 1) % S]), v3.scale(prev[j], 2)), 0.25);
        r[j] = v3.len(v3.sub(q, prev[j])) < cm(1) ? (v3.dot(v3.sub(q, prev[j]), v3.sub(prev[j], v3.scale(v3.add(prev[(j + S / 2) % S], prev[j]), 0.5))) >= 0 ? q : v3.lerp(prev[j], q, 0.5)) : prev[j];
      }
    }
  for (let it = 0; it < 3; it++)
    for (let i = 1; i < rings.length - 1; i++)
      for (let j = 0; j < S; j++) {
        const q = v3.scale(v3.add(v3.add(rings[i - 1][j], rings[i + 1][j]), v3.scale(rings[i][j], 2)), 0.25);
        if (v3.len(v3.sub(q, rings[i][j])) < cm(0.6)) rings[i][j] = v3.lerp(rings[i][j], q, 0.7);
      }
  // Close the top: two shrinking rings and the apex.
  const last = rings[rings.length - 1];
  let top: Vec3 = [0, 0, 0];
  for (const p of last) top = v3.add(top, v3.scale(p, 1 / S));
  top = v3.madd(top, n, cm(0.9));
  for (const k of [0.55, 0.85]) rings.push(last.map((p) => v3.madd(v3.lerp(p, top, k), n, cm(0.5) * (1 - k))));
  rings.push(last.map(() => top));
  const crown = orientOutward(loftRings(rings, { closedAround: true, tileU: 0.15, tileV: 0.15 }), v3.madd(O, n, cm(5)));
  const fabric = cloth(g, 'Cap', st, { roughness: 0.9 });
  // Hair: none grows under the cap (head faces wholly above its lower edge).
  const edgeAt = (q: Vec3) => {
    const a = Math.atan2(q[0] - cb[0], q[2] - cb[2]);
    return edgeY[((Math.round(((a + Math.PI) / (2 * Math.PI)) * S) % S) + S) % S];
  };
  const fv = g.faceVerts, over = new Uint8Array(fv.length / 4);
  for (let f = 0; f < over.length; f++) {
    let ok = true;
    for (let k = 0; k < 4 && ok; k++) {
      const v = fv[f * 4 + k];
      ok = b.regions[v] === REGION.head && b.p(v)[1] > edgeAt(b.p(v)) + cm(0.3);
    }
    over[f] = ok ? 1 : 0;
  }
  const parts: GPart[] = [{ mesh: crown, material: fabric, headwear: true, over }];
  // Visor: rooted on the band ring's front arc, reaching forward, its sides curving down.
  const band = rings[K];
  const at = (a: number) => band[((Math.round(((a + Math.PI) / (2 * Math.PI)) * S) % S) + S) % S];
  const A = visorA, R = 10, C = 28;
  const visor: Vec3[][] = [];
  for (let i = 0; i <= R; i++) {
    const t = i / R;
    const row: Vec3[] = [];
    for (let j = 0; j <= C; j++) {
      const a = -A + (2 * A * j) / C, u = a / A;
      const p0 = at(a);
      const out = v3.norm(v3.lerp(v3.norm([p0[0] - O[0], 0, p0[2] - O[2]]), [0, 0, 1], 0.8));
      // Rounded front edge: full length across the middle, curving back to the band at the sides.
      const len = cm(7.2) * Math.sqrt(Math.max(0, 1 - u * u));
      // The droop grows with the distance out from the band, so the visor's ends meet it cleanly.
      const droop = (cm(1.6) * u * u + cm(1.2)) * t * (len / cm(7.2));
      row.push([p0[0] + out[0] * len * t, p0[1] - droop, p0[2] + out[2] * len * t]);
    }
    visor.push(row);
  }
  const under = visor.map((row) => row.map((p) => [p[0], p[1] - cm(0.35), p[2]] as Vec3));
  parts.push(
    { mesh: orientOutward(gridMesh(visor, 0.15), [O[0], brimY - 1, O[2]]), material: fabric },
    { mesh: orientOutward(gridMesh(under, 0.15), [O[0], brimY + 1, O[2]]), material: mat('Cap underbrim', null, { color: st.color2, roughness: 0.9 }) },
    { mesh: cord([...visor[R].map((p) => [p[0], p[1] - cm(0.17), p[2]] as Vec3)], cm(0.18), false, 6), material: fabric },
  );
  // Button on the top.
  parts.push({ mesh: ellipsoid(frameOf(v3.madd(top, n, cm(0.15)), n, [0, 0, 1]), [cm(0.75), cm(0.75), cm(0.3)], [0.5, 0.5], 12, 5), material: fabric });
  return parts;
}

export const STREET: GarmentDef[] = [
  { id: 'oversized_tee', label: 'Oversized tee', slot: 'top', patterns: ['jersey', 'camo', 'ankara'], color: '#141416', color2: '#2a2a2e', build: oversizedTee },
  { id: 'baggy_jeans', label: 'Baggy jeans', slot: 'bottom', patterns: ['denim', 'solid', 'camo'], color: '#37557f', color2: '#8aa4c6', build: baggyJeans },
  { id: 'baseball_cap', label: 'Baseball cap', slot: 'hat', patterns: ['jersey', 'camo', 'denim'], color: '#141416', color2: '#161618', build: baseballCap },
];
