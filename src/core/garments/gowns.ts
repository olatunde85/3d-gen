/**
 * Bridal and evening wear: a strapless ball gown with a chapel train, a sheer veil on a pearl comb,
 * and a short halter cocktail dress with an open back. Built in slices round the body and skinned as
 * mixes of the hips and legs, so the skirts move without tearing.
 */
import type { Vec3 } from '../math';
import type { Material } from '../mesh';
import { cm, REGION, type Body, type VInfo } from './body';
import { clamp, cloth, hplane, isTrunk, isUpper, mat, points, torsoY, Y, type GarmentDef, type GCtx, type GPart } from './kit';
import { crotchY, dressPts, hangRings, hideMask, knee, loftHang, loosePart, part, soleY } from './drape';
import { along, cord, ellipsoid, frameOf, hullRing, merge, orientOutward, solidBand, v3 } from './ring';

const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const sx = (b: Body) => b.L.shoulderX;
const centreOf = (ring: Vec3[]): Vec3 => {
  let c: Vec3 = [0, 0, 0];
  for (const p of ring) c = v3.add(c, v3.scale(p, 1 / ring.length));
  return c;
};

/** A neckline: its height on the trunk (0 hips .. 1 neck) at each point of the body. */
type Line = (v: Pick<VInfo, 'ax' | 'tth'>) => number;

/** Strapless sweetheart neckline: dips at the centre front, straight across the back. */
const sweetheart = (b: Body): Line => (v) => {
  const x = v.ax / sx(b), back = smooth((Math.abs(v.tth) / Math.PI - 0.4) / 0.2);
  // Dipping at the centre, and down at the sides to sit in the armpits, under the arms' edge.
  const front = 0.835 - 0.05 * clamp(1 - x / 0.14, 0, 1) ** 1.5 - 0.12 * smooth((x - 0.38) / 0.3);
  return front + (0.73 - front) * back;
};

/** Halter plunge at the front (to below the bust line between the breasts), open low at the back. */
const halter = (b: Body): Line => (v) => {
  const x = v.ax / sx(b), back = smooth((Math.abs(v.tth) / Math.PI - 0.4) / 0.2);
  // A V with a rounded point, easing into the straight top across the bust.
  const k = 0.035, vee = 0.63 + 1.15 * Math.sqrt(x * x + k * k) - 1.15 * k;
  // Straight across the top of the bust, then curving down to below the armpits.
  const front = 0.86 - Math.log(1 + Math.exp((0.86 - vee) / 0.012)) * 0.012 - 0.15 * smooth((x - 0.36) / 0.32), rear = Math.min(0.71, 0.4 + 0.9 * x);
  return front + (rear - front) * back;
};

/**
 * A structured (boned) bodice from the waist up to its neckline. It is built in slices round the
 * body, not cut from the body's own faces: each column of cloth runs from the waist straight up to
 * the neckline, so the top edge lies exactly on the line, smooth however the body mesh runs. The
 * cloth's distance from the body is smoothed across the slices, so it bridges the hollow between
 * the breasts and rounds off small bumps instead of following every detail of the skin.
 */
function structuredBodice(g: GCtx, m: Material, line: Line, o: { yBot: number; ease: number; waistEase: number }): { parts: GPart[]; edge: Vec3[] } | null {
  const b = g.body, H = b.L.neckY - b.L.hipY;
  // The trunk only: the tops of the arms would push the cloth out at the armholes.
  const pts = points(b, isTrunk);
  const yMax = torsoY(b, 0.9), dy = cm(0.6), NB = 192;
  const ys: number[] = [];
  for (let y = o.yBot - cm(1); y <= yMax; y += dy) ys.push(y);
  // Per slice: the body's outline as a radius per angle round a vertical axis (x = 0, z = zc).
  const zc: number[] = [], body: number[][] = [];
  for (const y of ys) {
    const slab = pts.filter((p) => Math.abs(p[1] - y) < cm(0.8));
    zc.push(slab.length ? slab.reduce((a, p) => a + p[2], 0) / slab.length : b.L.torsoZ);
  }
  for (let it = 0; it < 20; it++) for (let i = 1; i < zc.length - 1; i++) zc[i] = (zc[i - 1] + 2 * zc[i] + zc[i + 1]) / 4;
  ys.forEach((y, i) => {
    const r = new Array<number>(NB).fill(0);
    for (const p of pts) {
      if (Math.abs(p[1] - y) > cm(0.8)) continue;
      const a = Math.atan2(p[0], p[2] - zc[i]);
      const k = ((Math.round(((a + Math.PI) / (2 * Math.PI)) * NB) % NB) + NB) % NB;
      r[k] = Math.max(r[k], Math.hypot(p[0], p[2] - zc[i]));
    }
    // Gaps between the body's vertices: filled from the nearest bins either side.
    const known = r.map((x, k) => (x > 0 ? k : -1)).filter((k) => k >= 0);
    if (known.length)
      for (let k = 0; k < NB; k++) {
        if (r[k] > 0) continue;
        let lo = k, hi = k;
        while (r[(lo + NB) % NB] <= 0) lo--;
        while (r[hi % NB] <= 0) hi++;
        const t = (k - lo) / (hi - lo);
        r[k] = r[(lo + NB) % NB] * (1 - t) + r[hi % NB] * t;
      }
    body.push(r);
  });
  const raw = body.map((r) => [...r]);
  // The outline itself is uneven where the trunk meets the arms: even it out a little first.
  for (let it = 0; it < 8; it++) {
    const Q = body.map((r) => [...r]);
    for (let i = 0; i < Q.length; i++)
      for (let k = 0; k < NB; k++) {
        const up = Q[Math.min(i + 1, Q.length - 1)][k], down = Q[Math.max(i - 1, 0)][k];
        body[i][k] = (4 * Q[i][k] + Q[i][(k + 1) % NB] + Q[i][(k + NB - 1) % NB] + up + down) / 8;
      }
  }
  // The cloth: the outline plus ease (more at the waist, where the skirt hangs from), smoothed
  // round and up the body; never closer to the skin than a millimetre or so.
  const easeAt = (y: number) => o.ease + (o.waistEase - o.ease) * (1 - smooth((y - o.yBot) / (torsoY(b, 0.55) - o.yBot)));
  let R = body.map((r, i) => r.map((x) => x + easeAt(ys[i])));
  for (let it = 0; it < 60; it++) {
    const Q = R;
    R = Q.map((r, i) => r.map((x, k) => {
      const up = Q[Math.min(i + 1, Q.length - 1)][k], down = Q[Math.max(i - 1, 0)][k];
      const avg = (r[(k + 1) % NB] + r[(k + NB - 1) % NB] + up + down) / 4;
      return Math.max(body[i][k] + cm(0.15), raw[i][k] + cm(0.2), 0.5 * x + 0.5 * avg);
    }));
  }
  const at = (a: number, y: number): Vec3 => {
    const fi = clamp((y - ys[0]) / dy, 0, ys.length - 1.001), i = Math.floor(fi), ti = fi - i;
    const fk = (((a + Math.PI) / (2 * Math.PI)) * NB + NB) % NB, k = Math.floor(fk) % NB, tk = fk - Math.floor(fk);
    const r = (R[i][k] * (1 - tk) + R[i][(k + 1) % NB] * tk) * (1 - ti) + (R[i + 1][k] * (1 - tk) + R[i + 1][(k + 1) % NB] * tk) * ti;
    const z = zc[i] * (1 - ti) + zc[i + 1] * ti;
    return [Math.sin(a) * r, y, z + Math.cos(a) * r];
  };
  // Columns round the body (one at the centre front, where a plunge bottoms out), each from the
  // waist up to where it meets the neckline.
  const NU = 240, K = 44;
  const pos: number[] = [], uv: number[] = [];
  const top: Vec3[] = [];
  const angle = (j: number) => -Math.PI + (2 * Math.PI * j) / NU;
  const tops = Array.from({ length: NU }, (_, j) => {
    let yTop = torsoY(b, 0.8);
    for (let it = 0; it < 6; it++) {
      const p = at(angle(j), yTop);
      yTop = b.L.hipY + H * line({ ax: Math.abs(p[0]), tth: Math.atan2(p[0], p[2] - b.L.torsoZ) });
    }
    return Math.min(yTop, yMax);
  });
  // Round the sides the body's outline is uneven (the armpits): even out the edge there, keeping
  // the front's shape (a plunge's point) exact.
  for (let it = 0; it < 12; it++) {
    const prev = [...tops];
    for (let j = 0; j < NU; j++) {
      const w = smooth((Math.abs(angle(j)) - 0.7) / 0.3);
      tops[j] = prev[j] + w * ((prev[(j + NU - 1) % NU] + 2 * prev[j] + prev[(j + 1) % NU]) / 4 - prev[j]);
    }
  }
  // One more column than round the body: the last repeats the first with its own texture
  // coordinates, so the pattern doesn't jump at the back.
  for (let j = 0; j <= NU; j++) {
    const a = angle(j), yTop = tops[j % NU];
    for (let i = 0; i <= K; i++) {
      const y = o.yBot + ((yTop - o.yBot) * i) / K, p = at(a, y);
      pos.push(...p);
      uv.push((a * 1.4) / 0.3, y / 0.3);
      if (i === K && j < NU) top.push(p);
    }
  }
  const sizes: number[] = [], fv: number[] = [];
  for (let j = 0; j < NU; j++)
    for (let i = 0; i < K; i++) {
      const c0 = j * (K + 1), c1 = (j + 1) * (K + 1);
      sizes.push(4);
      fv.push(c0 + i, c1 + i, c1 + i + 1, c0 + i + 1);
    }
  const mesh = orientOutward(
    { positions: Float32Array.from(pos), faceSizes: Uint8Array.from(sizes), faceVerts: Uint32Array.from(fv), faceUVs: Uint32Array.from(fv), uvs: Float32Array.from(uv) },
    [0, (o.yBot + yMax) / 2, b.L.torsoZ],
  );
  const hides = hideMask(g, (v) => isTrunk(v) && v.tt >= 0.32 && v.tt < line(v));
  // The back seam (where the columns close round the body), finished with a fine bead.
  const seam: Vec3[] = [];
  for (let i = 0; i <= K; i++) seam.push(at(Math.PI, o.yBot + ((tops[0] - o.yBot) * i) / K));
  return { parts: [{ mesh, material: { ...m, doubleSided: true }, hides }, ...part(cord(seam, cm(0.15), false, 6), m)], edge: [...top, top[0]] };
}

/**
 * Ball-gown skirt from the waist to the floor: a full bell over the hips (fuller at the back) with
 * soft folds, and a train sweeping back along the floor.
 */
function ballSkirt(g: GCtx, m: Material, yTop: number): GPart[] {
  const b = g.body;
  const floor = soleY(b);
  const rings = hangRings(b, dressPts(b), yTop, floor + cm(2.5), { offset: cm(1), samples: 112, step: cm(2.2), wave: { n: 13, amp: cm(2.4) } });
  if (!rings) return [];
  // Smooth each column down the skirt (the slices change shape round the knees and ankles).
  for (let it = 0; it < 12; it++)
    for (let i = 1; i < rings.length - 1; i++)
      for (let j = 0; j < rings[i].length; j++) {
        const q = v3.scale(v3.add(v3.add(rings[i - 1][j], rings[i + 1][j]), v3.scale(rings[i][j], 2)), 0.25);
        rings[i][j] = [q[0], rings[i][j][1], q[2]];
      }
  const R = rings.length - 1, top = centreOf(rings[0]);
  const out = rings.map((ring, i) => {
    const t = i / R;
    const bell = cm(24) * (1 - (1 - Math.min(1, t / 0.72)) ** 2.3);
    return ring.map((p): Vec3 => {
      const d = v3.norm([p[0] - top[0], 0, p[2] - top[2]]);
      const backness = Math.max(0, -d[2]);
      const r = bell * (0.92 + 0.22 * backness);
      const train = cm(62) * smooth((t - 0.5) / 0.5) ** 2 * backness ** 2.5;
      return [p[0] + d[0] * r, p[1] + (i === R ? 0 : cm(3) * smooth((t - 0.8) / 0.2) * backness ** 2), p[2] + d[2] * r - train];
    });
  });
  const mesh = loftHang(out, b, { tileV: 0.3 });
  const hides = hideMask(g, (v, y) => (v.region === REGION.upperleg || v.region === REGION.lowerleg) && y < b.L.hipY);
  const hem = out[R].map((p) => [...p] as Vec3);
  const bead = cord([...hem, hem[0]], cm(0.5), false, 8);
  return [
    { mesh, material: { ...m, doubleSided: true }, skinAt: pelvisSkin(b, mesh.positions, yTop), hides },
    ...(bead ? [{ mesh: bead, material: m, skinAt: pelvisSkin(b, bead.positions, yTop) }] : []),
  ];
}

/**
 * Skin lookup for a full skirt: below the waist every point looks up its weights in the middle of
 * the pelvis, so the whole bell moves with the hips as one piece. (Looking up near the thighs would
 * pull the hem between the two legs and tear it.)
 */
function pelvisSkin(b: Body, P: Float32Array, waist: number): Float32Array {
  const out = new Float32Array(P.length), anchor = b.L.hipY + cm(9);
  for (let i = 0; i < P.length; i += 3) {
    const w = smooth((waist - P[i + 1]) / cm(12));
    out[i] = P[i] * (1 - w) + clamp(P[i], -cm(4), cm(4)) * w;
    out[i + 1] = P[i + 1] * (1 - w) + anchor * w;
    out[i + 2] = P[i + 2] * (1 - w) + (b.L.torsoZ + clamp(P[i + 2] - b.L.torsoZ, -cm(4), cm(4))) * w;
  }
  return out;
}

/**
 * How the short skirt moves, as a mix of weights (see GPart.skinMix): fitted at the waist; below
 * the hips shared between the pelvis and the thigh on its own side, wholly the thigh at the hem, and
 * gradually across the middle (between the legs), so it never splits as the legs part.
 */
function skirtMix(b: Body, P: Float32Array, hem: number): GPart['skinMix'] {
  const n = P.length / 3, hip = b.L.hipY;
  const fill = (p: Vec3) => {
    const a = new Float32Array(P.length);
    for (let i = 0; i < n; i++) a.set(p, i * 3);
    return a;
  };
  // The thigh where the hem goes round it.
  const thigh = (s: number) => {
    const [a, c] = b.axis(REGION.upperleg, s);
    return v3.lerp(a, c, clamp((a[1] - hem) / (a[1] - c[1]), 0, 1));
  };
  const own = new Float32Array(n), pelvis = new Float32Array(n), left = new Float32Array(n), right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1];
    const fitted = smooth((y - hip + cm(6)) / cm(10));
    const swing = smooth((hip - y) / (hip - hem)), wl = smooth((x + cm(4)) / cm(8));
    own[i] = fitted;
    pelvis[i] = (1 - fitted) * (1 - swing);
    left[i] = (1 - fitted) * swing * wl;
    right[i] = (1 - fitted) * swing * (1 - wl);
  }
  return [
    { at: P, amount: own },
    { at: fill([0, hip + cm(9), b.L.torsoZ]), amount: pelvis },
    { at: fill(thigh(1)), amount: left },
    { at: fill(thigh(-1)), amount: right },
  ];
}

/**
 * Short fitted skirt from the waist to well above the knees (a little over a third of the way from
 * the crotch down to the knee): close over the hips, a little ease over the seat, the hem straight
 * round both thighs.
 */
function shortSkirt(g: GCtx, m: Material, yTop: number): { parts: GPart[]; hem: Vec3[]; skin: (P: Float32Array) => GPart['skinMix'] } | null {
  const b = g.body;
  const crotch = crotchY(b), hemY = crotch - (crotch - knee(b)) * 0.38;
  const src = dressPts(b), samples = 160;
  const rings: Vec3[][] = [];
  const k = Math.ceil((yTop - hemY) / cm(1.5));
  for (let i = 0; i <= k; i++) {
    const y = yTop + ((hemY - yTop) * i) / k;
    // Ease over the seat and hips (clear of the briefs), less at the waist and the hem.
    const ease = cm(0.9) + cm(0.7) * smooth((yTop - cm(4) - y) / cm(8)) * smooth((y - hemY) / cm(6));
    const r = hullRing(src, hplane(b, y), { slab: cm(2), samples, offset: ease });
    if (!r) return null;
    rings.push(r);
  }
  for (let it = 0; it < 6; it++)
    for (let i = 1; i < rings.length - 1; i++)
      for (let j = 0; j < samples; j++) {
        const q = v3.scale(v3.add(v3.add(rings[i - 1][j], rings[i + 1][j]), v3.scale(rings[i][j], 2)), 0.25);
        rings[i][j] = [q[0], rings[i][j][1], q[2]];
      }
  const mesh = loftHang(rings, b, { tileV: 0.3 });
  const legs = (v: VInfo) => v.region === REGION.upperleg || v.region === REGION.lowerleg;
  // Skin under it is hidden: the legs above the hem, and the hips below the waist (they push forward as a leg lifts).
  const hides = hideMask(g, (v, y) => (legs(v) || isTrunk(v)) && y < yTop - cm(3) && y > hemY + cm(1.5));
  const skin = (P: Float32Array) => skirtMix(b, P, hemY);
  return { parts: [{ mesh, material: { ...m, doubleSided: true }, skinMix: skin(mesh.positions), hides }], hem: [...rings[k], rings[k][0]], skin };
}

/** Piping along a fitted edge (a bodice's neckline): a fine round bead of the same cloth. */
function piping(edge: Vec3[], m: Material, r: number): GPart[] {
  const pts = along(edge, r * 0.8, false).map((x) => x.p);
  return part(pts.length > 1 ? cord(pts, r, false, 8) : null, m);
}

/** A point on the body's surface: the vertex furthest along `dir` near the line through `at`. */
function surface(b: Body, test: (v: VInfo) => boolean, at: Vec3, dir: Vec3, reach = cm(1.2)): Vec3 {
  let best: Vec3 = at, bd = -Infinity;
  for (const p of points(b, test)) {
    const d = v3.sub(p, at), along = v3.dot(d, dir);
    if (v3.len(v3.sub(d, v3.scale(dir, along))) < reach && along > bd) [bd, best] = [along, p];
  }
  return best;
}

/** Halter ties: from each top corner of the plunge (on the bodice's `edge`), over the collarbone and round the neck to a knot at the nape. */
function halterTies(g: GCtx, m: Material, edge: Vec3[]): GPart[] {
  const b = g.body;
  const isNeck = (v: VInfo) => v.region === REGION.neck || isUpper(v);
  const neckY = b.L.neckY + cm(2.5);
  const axis = (y: number): Vec3 => [0, y, b.L.torsoZ - cm(1)];
  const nape = surface(b, isNeck, axis(neckY), [0, 0, -1]);
  const ties = [1, -1].map((s) => {
    // Starts at the corner where the plunge meets the top of the bodice (on its piping).
    const corner = edge.filter((p) => p[0] * s > 0 && p[2] > b.L.torsoZ && p[1] > torsoY(b, 0.85));
    const chest = corner.length ? corner.reduce((p, q) => (Math.abs(q[0]) < Math.abs(p[0]) ? q : p)) : surface(b, isTrunk, [s * 0.25 * sx(b), torsoY(b, 0.845), b.L.torsoZ], [0, 0, 1]);
    const side = surface(b, isNeck, axis(neckY - cm(1)), v3.norm([s, 0, 0.45]));
    // A smooth curve through chest, neck side and nape, laid on the body: each point is found
    // along its own direction from the neck's axis, then held just off the skin.
    const bez = (t: number): Vec3 => t < 0.5
      ? v3.lerp(v3.lerp(chest, v3.lerp(chest, side, 0.6), t * 2), v3.lerp(v3.lerp(chest, side, 0.6), side, t * 2), t * 2)
      : v3.lerp(v3.lerp(side, v3.lerp(side, nape, 0.5), t * 2 - 1), v3.lerp(v3.lerp(side, nape, 0.5), nape, t * 2 - 1), t * 2 - 1);
    const path: Vec3[] = [];
    for (let i = 0; i <= 24; i++) {
      const q = bez(i / 24), d = v3.norm([q[0], 0, q[2] - axis(q[1])[2]]);
      const on = surface(b, (v) => isNeck(v) || isTrunk(v), axis(q[1]), d, cm(1.5));
      path.push(i === 0 ? chest : v3.madd(on, d, cm(0.45)));
    }
    for (let it = 0; it < 4; it++) for (let i = 1; i < path.length - 1; i++) path[i] = v3.scale(v3.add(v3.add(path[i - 1], path[i + 1]), v3.scale(path[i], 2)), 0.25);
    return cord(path, cm(0.5), false, 8);
  });
  const knot = ellipsoid(frameOf(v3.madd(nape, [0, 0, -1], cm(0.9)), [0, 0, -1], Y), [cm(1.1), cm(0.9), cm(0.8)], [0.5, 0.5], 10, 6);
  const tails = [1, -1].map((s) => {
    const pts: Vec3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(v3.add(nape, [s * cm(2.2) * Math.sin(t * 1.6), -cm(17) * t, -cm(1) - cm(1.2) * Math.sin(Math.PI * t)]));
    }
    return cord(pts, cm(0.42), false, 6);
  });
  return part(merge([...ties, knot, ...tails]), m);
}

/** Sheer veil gathered at a pearl comb on the back of the crown, falling over the shoulders to the waist. */
function veil(g: GCtx, st: { color: string; color2: string }): GPart[] {
  const b = g.body;
  const H = b.L.crownY - b.L.chinY;
  const src = points(b, (v) => v.region === REGION.head || v.region === REGION.neck || isUpper(v));
  // Elbow length: it ends at the waist, above a full skirt.
  const yTop = b.L.chinY + 0.9 * H, yBot = torsoY(b, 0.4);
  const rings = hangRings(b, src, yTop, yBot, { offset: cm(1.4), flare: 0.04, arc: [Math.PI - 1.5, Math.PI + 1.5], samples: 48, step: cm(2), wave: { n: 9, amp: cm(1.2) } });
  if (!rings) return [];
  // It lies on the hair: close over the crown, out over the fuller hair round the jaw, then in
  // again to rest on the neck and shoulders.
  const fall = (y: number) => smooth((y - b.L.neckY) / (b.L.chinY - b.L.neckY));
  for (const r of rings) {
    const y = r[0][1], c = centreOf(r);
    const e = cm(2.6) * (1 - smooth((y - (b.L.chinY + 0.25 * H)) / (0.65 * H))) * fall(y) + cm(0.6) * (1 - fall(y));
    for (let j = 0; j < r.length; j++) {
      const d = v3.norm([r[j][0] - c[0], 0, r[j][2] - c[2]]);
      r[j] = v3.madd(r[j], d, e);
    }
  }
  // Soften the fall: smooth each column down the veil (the hull steps out at the shoulders).
  for (let it = 0; it < 6; it++)
    for (let i = 1; i < rings.length - 1; i++)
      for (let j = 0; j < rings[i].length; j++) rings[i][j] = v3.scale(v3.add(v3.add(rings[i - 1][j], rings[i + 1][j]), v3.scale(rings[i][j], 2)), 0.25);
  const sheer = mat('Bridal veil', null, { color: st.color, roughness: 0.55, alpha: 'blend', opacity: 0.36, doubleSided: true });
  const trim = mat('Veil edging', null, { color: st.color, roughness: 0.5 });
  const edge = [...rings.map((r) => r[0]), ...rings[rings.length - 1].slice(1), ...rings.map((r) => r[r.length - 1]).reverse().slice(1)];
  // Comb: a silver bar along the gathered top, set with pearls.
  const comb = rings[0], cc = centreOf(points(b, (v) => v.region === REGION.head));
  const studs = comb.filter((_, i) => i % 3 === 1).map((p) => {
    const o = v3.norm(v3.sub(p, cc));
    return ellipsoid(frameOf(v3.madd(p, o, cm(0.35)), o, Y), [cm(0.45), cm(0.45), cm(0.4)], [0.5, 0.5], 8, 5);
  });
  return [
    ...loosePart(b, loftHang(rings, b, { arc: [0, 0] }), sheer, 0, 0),
    ...loosePart(b, cord(edge, cm(0.16), false, 4), trim, 0, 0),
    ...part(cord(comb, cm(0.28), false, 6), mat('Comb', null, { color: '#d9dbe0', roughness: 0.3, metalness: 0.9 })),
    ...part(merge(studs), mat('Comb pearls', null, { color: st.color2, roughness: 0.2, metalness: 0.1 })),
  ];
}

export const GOWNS: GarmentDef[] = [
  {
    id: 'wedding_gown', label: 'Wedding gown (strapless, train)', slot: 'top', fullLength: true, patterns: ['satin', 'lace', 'solid'], color: '#f6f1e6', color2: '#fffdf7',
    build: (g, st) => {
      const b = g.body;
      const m = cloth(g, 'Wedding gown', st, { roughness: st.pattern === 'satin' ? 0.42 : 0.8, doubleSided: true });
      const skirt = cloth(g, 'Wedding gown skirt', { ...st, pattern: st.pattern === 'lace' ? 'satin' : st.pattern }, { roughness: 0.45 });
      const waist = torsoY(b, 0.36);
      const top = structuredBodice(g, m, sweetheart(b), { yBot: torsoY(b, 0.32), ease: cm(0.5), waistEase: cm(0.6) });
      const sash = solidBand(points(b, isTrunk), hplane(b, waist + cm(1.4)), cm(3.4), cm(0.35), cm(1.0), { samples: 64, tileU: 0.2 });
      // A row of pearls round the middle of the sash.
      const row = hullRing(points(b, isTrunk), hplane(b, waist + cm(1.4)), { slab: cm(1.2), samples: 120, offset: cm(1.55) });
      const beads = row ? merge(row.map((p) => ellipsoid(frameOf(p, v3.norm([p[0], 0, p[2] - b.L.torsoZ]), Y), [cm(0.42), cm(0.42), cm(0.42)], [0.5, 0.5], 8, 5))) : null;
      return [
        ...(top ? [...top.parts, ...piping(top.edge, m, cm(0.35))] : []),
        ...ballSkirt(g, skirt, waist),
        ...part(sash, skirt),
        ...part(beads, mat('Pearls', null, { color: '#f7f2e8', roughness: 0.2, metalness: 0.1 })),
      ];
    },
  },
  {
    id: 'cocktail_dress', label: 'Cocktail dress (halter, short)', slot: 'top', patterns: ['satin', 'solid', 'foil'], color: '#a3101c', color2: '#e0384a',
    build: (g, st) => {
      const b = g.body;
      const m = cloth(g, 'Cocktail dress', st, { roughness: st.pattern === 'satin' ? 0.38 : 0.7, doubleSided: true });
      const yTop = torsoY(b, 0.36);
      // The bodice runs a little past the top of the skirt (eased out to it), so they join without a seam.
      const top = structuredBodice(g, m, halter(b), { yBot: yTop - cm(1), ease: cm(0.45), waistEase: cm(1.0) });
      const skirt = shortSkirt(g, m, yTop);
      const hem = skirt && along(skirt.hem, cm(0.25), false).map((x) => x.p);
      const bead = hem && hem.length > 1 ? cord(hem, cm(0.32), false, 8) : null;
      return [
        ...(top ? [...top.parts, ...piping(top.edge, m, cm(0.3))] : []),
        ...(top ? halterTies(g, m, top.edge) : []),
        ...(skirt ? skirt.parts : []),
        ...(skirt && bead ? [{ mesh: bead, material: m, skinMix: skirt.skin(bead.positions) }] : []),
      ];
    },
  },
  {
    id: 'bridal_veil', label: 'Bridal veil & pearl comb', slot: 'acc', patterns: ['solid'], color: '#fbf8f1', color2: '#f4eee2', colorLabels: ['Veil', 'Pearls'],
    build: (g, st) => veil(g, st),
  },
];
