/**
 * Necklaces: a line that sits snug round the base of the neck and drapes down the chest, strung
 * with beads, links or a chain.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION } from './body';
import { clamp, hplane, isTrunk, mat, points, Y, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { part } from './drape';
import { along, cord, ellipsoid, frameOf, hullRing, loftRings, merge, orientOutward, rayRing, v3 } from './ring';

/** Front-most crossing (largest z) of a closed ring with the vertical plane at lateral position x. */
function frontZ(ring: Vec3[], x: number): number | null {
  let best: number | null = null;
  for (let j = 0; j < ring.length; j++) {
    const a = ring[j], b = ring[(j + 1) % ring.length];
    if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
    const z = a[2] + ((b[2] - a[2]) * (x - a[0])) / (b[0] - a[0]);
    if (best === null || z > best) best = z;
  }
  return best;
}

/**
 * A necklace line: snug round the base of the neck at the back and sides, and at the front
 * hanging `drop` below it, lying on the chest but no wider than the neck.
 */
/**
 * `spread`: how much wider the front gets as it hangs (0 = straight down from the sides of the neck,
 * a narrow V like a heavy chain; 0.5 = fanning out over the chest like graduated beads).
 */
/**
 * `inside`: round the back and sides it lies on the neck itself, inside any collar (only the front
 * lies over the top worn).
 */
function strand(g: GCtx, drop: number, spread = 1, inside = false): { ring: Vec3[]; centre: Vec3 } | null {
  const b = g.body;
  // Back and sides lie on the body (round the neck); the front lies on the chest, over any top worn.
  const body = points(b, (v) => v.region === REGION.neck || isTrunk(v));
  const neckPts = points(b, (v) => v.region === REGION.neck);
  const surf = [...body, ...(g.worn ?? [])];
  // The neck's narrowest cross-section: the chain is a loop a little bigger than it, resting where
  // the neck widens to meet it (on a thick neck that is still on the neck, not out on the shoulders).
  let neckRing: Vec3[] | null = null, yN = b.L.neckY, best = Infinity;
  for (let y = b.L.neckY; y < b.L.neckY + cm(9); y += cm(0.5)) {
    // Only slices that go right round the neck (enough points on every side).
    const slab = neckPts.filter((q) => Math.abs(q[1] - y) < cm(0.6));
    if (slab.length < 24 || Math.min(...slab.map((q) => q[2])) > b.L.torsoZ - cm(2)) continue;
    const r = hullRing(neckPts, hplane(b, y), { slab: cm(0.6), samples: 64, offset: 0 });
    if (!r) continue;
    let cc: Vec3 = [0, 0, 0];
    for (const q of r) cc = v3.add(cc, v3.scale(q, 1 / r.length));
    const avg = r.reduce((m, q) => m + Math.hypot(q[0] - cc[0], q[2] - cc[2]), 0) / r.length;
    if (avg < best) [best, neckRing, yN] = [avg, r, y];
  }
  if (!neckRing) return null;
  let c: Vec3 = [0, 0, 0];
  for (const p of neckRing) c = v3.add(c, v3.scale(p, 1 / neckRing.length));
  // (Inside the collars: close on the skin, under the cloth round the neck.)
  const off = inside ? cm(0.12) : cm(0.45);
  const N = 80, ring: Vec3[] = [];
  const cache = new Map<number, Vec3[] | null>();
  const surfAt = (y: number) => {
    const k = Math.round(y / cm(0.5));
    // A thicker slice when a top is worn: its vertices are a couple of centimetres apart.
    if (!cache.has(k)) cache.set(k, hullRing(surf, hplane(b, k * cm(0.5)), { slab: g.worn ? cm(1.4) : cm(0.6), samples: 128, offset: off }));
    return cache.get(k)!;
  };
  const bodyCache = new Map<number, Vec3[] | null>();
  const bodyAt = (y: number) => {
    const k = Math.round(y / cm(0.5));
    if (!bodyCache.has(k)) bodyCache.set(k, hullRing(body, hplane(b, k * cm(0.5)), { slab: cm(0.8), samples: 128, offset: off + (g.worn ? cm(0.4) : 0) }));
    return bodyCache.get(k)!;
  };
  for (let i = 0; i < N; i++) {
    const a = -Math.PI + (2 * Math.PI * i) / N;
    const dir: Vec3 = [Math.sin(a), 0, Math.cos(a)];
    // The loop's radius here, and where it rests: going down from the narrowest point until the
    // body (or the top worn over it) reaches out that far.
    // (Inside a collar: snug on the neck.)
    const rT = (rayRing(neckRing, [c[0], yN, c[2]], dir) ?? cm(6)) * (inside ? 1.0 : 1.15) + off;
    // Never higher than just above the base of the neck (a slim neck widens early).
    const yTop = Math.min(yN, b.L.neckY + cm(1));
    let yRest = yTop;
    for (let y = yTop; y > yTop - cm(12); y -= cm(0.5)) {
      const hb = bodyAt(y), hw = surfAt(y);
      const rb = Math.max(hb ? rayRing(hb, [c[0], y, c[2]], dir) ?? 0 : 0, hw && !inside ? rayRing(hw, [c[0], y, c[2]], dir) ?? 0 : 0);
      yRest = y;
      if (rb >= rT) break;
    }
    // Only the front hangs lower, onto the chest.
    const front = Math.max(0, Math.cos(a)) ** 1.6;
    const y = yRest - drop * front ** 1.4;
    const rN = rT;
    const wide = 1 + spread * (drop / cm(10)) * front;
    let p: Vec3 = [c[0] + dir[0] * rN * wide, y, c[2] + dir[2] * rN];
    // Inside the collars the front rests on the skin itself (in or out to it).
    const hb = inside ? bodyAt(y) : null;
    const zb = hb && dir[2] > 0 ? frontZ(hb, p[0]) : null;
    if (zb !== null) p = [p[0], y, zb];
    const h = surfAt(y);
    if (h && !inside) {
      if (dir[2] > 0) {
        // Front: keep the neck's width, lie on the chest.
        const z = frontZ(h, p[0]);
        if (z !== null && z > p[2]) p = [p[0], y, z];
      }
      // Never inside the surface it lies on (over the shoulder seam of a top, say): push it out
      // along its own direction from the axis.
      if (g.worn && dir[2] > 0.5) {
        const d2 = v3.norm([p[0] - c[0], 0, p[2] - c[2]]);
        const r2 = rayRing(h, [c[0], y, c[2]], d2), cur = Math.hypot(p[0] - c[0], p[2] - c[2]);
        if (r2 !== null && r2 > cur && r2 < cur + cm(3)) p = [c[0] + d2[0] * r2, y, c[2] + d2[2] * r2];
      }
      if (g.worn && !inside) {
        // Where the top lies above the line (its collar and shoulders), lift it onto the fabric.
        let top = -Infinity;
        for (const q of g.worn) if (Math.abs(q[0] - p[0]) < cm(1) && Math.abs(q[2] - p[2]) < cm(1) && q[1] < p[1] + cm(3)) top = Math.max(top, q[1]);
        if (top > p[1] - off) p = [p[0], top + off, p[2]];
      }
    }
    ring.push(p);
  }
  // Smooth the line (the surface has small steps).
  for (let it = 0; it < 3; it++) {
    const prev = ring.map((q) => [...q] as Vec3);
    for (let i = 0; i < N; i++) {
      const a = prev[(i + N - 1) % N], b2 = prev[(i + 1) % N];
      for (let k = 0; k < 3; k++) ring[i][k] = Math.max(-1e9, (a[k] + 2 * prev[i][k] + b2[k]) / 4);
      // Never sink below the unsmoothed surface position (outward).
      const d0 = Math.hypot(prev[i][0] - c[0], prev[i][2] - c[2]), d1 = Math.hypot(ring[i][0] - c[0], ring[i][2] - c[2]);
      if (d1 < d0) {
        ring[i][0] = c[0] + ((ring[i][0] - c[0]) * d0) / (d1 || 1);
        ring[i][2] = c[2] + ((ring[i][2] - c[2]) * d0) / (d1 || 1);
      }
    }
  }
  // Heights: a smooth curve that never dips below where each point had to be (over a collar, say).
  const floor = ring.map((q) => q[1]);
  for (let it = 0; it < 12; it++) {
    const ys = ring.map((q) => q[1]);
    for (let i = 0; i < N; i++) ring[i][1] = Math.max(floor[i], (ys[(i + N - 1) % N] + 2 * ys[i] + ys[(i + 1) % N]) / 4);
  }
  // Under a jacket the front stays in its open V: below the neck, wherever it would pass under a
  // lapel, it is drawn in to lie on the top just inside the lapel's edge, so it shows unbroken.
  if (g.jacket?.length) {
    const open = new Map<number, number>();
    for (const q of g.jacket) {
      if (q[2] < c[2] || q[1] > b.L.neckY) continue;
      const k = Math.round(q[1] / cm(1));
      open.set(k, Math.min(open.get(k) ?? Infinity, Math.abs(q[0])));
    }
    const halfAt = (y: number) => {
      let m = Infinity;
      for (const d of [-1, 0, 1]) m = Math.min(m, open.get(Math.round(y / cm(1)) + d) ?? Infinity);
      return m;
    };
    for (let i = 0; i < N; i++) {
      const p = ring[i];
      if (p[2] < c[2] || p[1] > b.L.neckY - cm(1)) continue;
      const w = halfAt(p[1]) - cm(0.7);
      if (Number.isFinite(w) && Math.abs(p[0]) > w) {
        const x = Math.sign(p[0]) * Math.max(0, w), h = surfAt(p[1]), z = h ? frontZ(h, x) : null;
        ring[i] = [x, p[1], z !== null ? Math.max(z, p[2]) : p[2]];
      }
    }
  }
  return { ring, centre: [c[0], yN - cm(6), c[2]] };
}

/** Round beads along a ring; every `spacerEvery`-th bead goes to the second list (gold spacers). */
function beadRow(ring: Vec3[], centre: Vec3, r: number, gap: number, spacerEvery = 0): [PolyMesh | null, PolyMesh | null] {
  const main: PolyMesh[] = [], spacers: PolyMesh[] = [];
  for (const { p, tangent, i } of along(ring, r * 2 + gap, true)) {
    const out = v3.norm([p[0] - centre[0], 0, p[2] - centre[2]]);
    const f = frameOf(v3.madd(p, out, r * 0.6), out, tangent);
    const spacer = spacerEvery > 0 && i % spacerEvery === spacerEvery - 1;
    (spacer ? spacers : main).push(ellipsoid({ o: f.o, x: f.y, y: f.x, z: f.z }, spacer ? [r * 0.7, r * 0.5, r * 0.7] : [r, r, r], [0.5, 0.5], 10, 6));
  }
  return [merge(main), merge(spacers)];
}

/** Coral beads (iyun): a choker and two longer strands of large coral, with gold spacers. */
function coralBeads(g: GCtx, st: GarmentStyle): GPart[] {
  const coral: PolyMesh[] = [], gold: PolyMesh[] = [];
  for (const [drop, r] of [[cm(0.5), cm(0.65)], [cm(4.5), cm(0.75)], [cm(9), cm(0.8)]] as const) {
    const s = strand(g, drop);
    if (!s) continue;
    const [a, b] = beadRow(s.ring, s.centre, r, cm(0.08), 7);
    if (a) coral.push(a);
    if (b) gold.push(b);
  }
  return [
    ...part(merge(coral), mat('Coral beads', null, { color: st.color, roughness: 0.35 })),
    ...part(merge(gold), mat('Gold spacers', null, { color: st.color2, roughness: 0.3, metalness: 0.9 })),
  ];
}

/** Gold chain with a round pendant, hanging `drop` below the base of the neck. */
function goldNecklace(g: GCtx, st: GarmentStyle, drop = cm(7)): GPart[] {
  // (A long chain hangs nearly straight; the short one fans out.)
  const s = strand(g, drop, drop > cm(10) ? 0.3 : 1);
  if (!s) return [];
  let front = s.ring[0];
  for (const p of s.ring) if (p[2] > front[2]) front = p;
  const out = v3.norm([front[0] - s.centre[0], 0.15, front[2] - s.centre[2]]);
  const pendant = ellipsoid(frameOf(v3.madd(v3.madd(front, Y, -cm(1.6)), out, cm(0.3)), out, Y), [cm(1.4), cm(1.6), cm(0.35)], [0.5, 0.5], 16, 6);
  const metal = mat('Gold', null, { color: st.color, roughness: 0.25, metalness: 0.95 });
  return [{ mesh: merge([cord(s.ring, cm(0.12), true), pendant])!, material: metal }];
}

/**
 * A fine gold chain with a small drop pendant, resting on the skin inside an open neckline (under
 * the collars of a blouse and jacket).
 */
function finePendant(g: GCtx, st: GarmentStyle): GPart[] {
  const s = strand(g, cm(9), 0.1, true);
  if (!s) return [];
  // Under the top's cloth (wherever it lies in front of the chain) the chain sinks out of sight; it
  // shows only in the neckline's opening.
  const worn = g.worn ?? [];
  s.ring = s.ring.map((p) => {
    const covered = worn.some((q) => Math.abs(q[0] - p[0]) < cm(0.8) && Math.abs(q[1] - p[1]) < cm(0.8) && q[2] > p[2] - cm(0.3) && q[2] < p[2] + cm(2));
    return covered ? v3.madd(p, v3.norm([p[0] - s.centre[0], 0, p[2] - s.centre[2]]), -cm(0.6)) : p;
  });
  let front = s.ring[0];
  for (const p of s.ring) if (p[2] > front[2]) front = p;
  const out = v3.norm([front[0] - s.centre[0], 0, front[2] - s.centre[2]]);
  const drop = ellipsoid(frameOf(v3.madd(v3.madd(front, Y, -cm(0.9)), out, cm(0.15)), out, Y), [cm(0.45), cm(0.7), cm(0.18)], [0.5, 0.5], 12, 6);
  const metal = mat('Gold pendant', null, { color: st.color, roughness: 0.2, metalness: 1 });
  return [{ mesh: merge([cord(s.ring, cm(0.06), true, 5), drop])!, material: metal }];
}

/**
 * Silver cross on a long fine chain (round a standing collar, over the top, inside a jacket's
 * V): a Latin cross (bevelled bars, a small ring where it hangs) resting on the chest.
 */
function silverCross(g: GCtx, st: GarmentStyle): GPart[] {
  const s = strand(g, cm(22), 0);
  if (!s) return [];
  // Round a collar standing up round the neck (a clerical band) it climbs from the chest up over
  // the collar's sides and wraps round it just below its top edge (which dips toward the front).
  const b = g.body, c = s.centre;
  const nearNeck = (g.worn ?? []).filter((q) => Math.hypot(q[0] - c[0], q[2] - c[2]) < cm(9) && q[1] > b.L.neckY - cm(2));
  const AB = 48, edgeY = new Float32Array(AB).fill(-Infinity);
  const binOf = (x: number, z: number) => Math.floor((Math.atan2(x - c[0], z - c[2]) / (2 * Math.PI) + 0.5) * AB) % AB;
  for (const q of nearNeck) edgeY[binOf(q[0], q[2])] = Math.max(edgeY[binOf(q[0], q[2])], q[1]);
  if (edgeY.filter((y) => y > b.L.neckY + cm(1.5)).length > AB / 2) {
    const neckPts = points(b, (v) => v.region === REGION.neck);
    const hulls = new Map<number, Vec3[] | null>();
    const hullAt = (y: number) => {
      const k = Math.round(y / cm(0.5));
      if (!hulls.has(k)) hulls.set(k, hullRing([...neckPts, ...nearNeck.filter((q) => Math.abs(q[1] - k * cm(0.5)) < cm(0.6))], hplane(b, k * cm(0.5)), { slab: cm(0.6), samples: 96, offset: cm(0.12) }));
      return hulls.get(k)!;
    };
    s.ring = s.ring.map((p) => {
      const ang = Math.atan2(p[0] - c[0], p[2] - c[2]), a = Math.abs(ang);
      // On the chest up to 20 degrees from the front; wholly on the collar from 50 degrees round.
      const w = clamp((a - 0.35) / 0.52, 0, 1), k = w * w * (3 - 2 * w);
      const t = edgeY[binOf(p[0], p[2])];
      if (k <= 0 || !Number.isFinite(t)) return p;
      const y = t - cm(0.7), d: Vec3 = [Math.sin(ang), 0, Math.cos(ang)];
      const h = hullAt(y), r = h ? rayRing(h, [c[0], y, c[2]], d) : null;
      return r === null ? p : v3.lerp(p, [c[0] + d[0] * r, y, c[2] + d[2] * r], k);
    });
    for (let it = 0; it < 3; it++) s.ring = s.ring.map((p, i, r) => v3.scale(v3.add(v3.add(r[(i + r.length - 1) % r.length], v3.scale(p, 2)), r[(i + 1) % r.length]), 0.25));
    // Never inside the shirt where it climbs (a straight line cuts across its curve).
    const surf = [...points(b, (v) => v.region === REGION.neck || isTrunk(v)), ...(g.worn ?? [])];
    const rings = new Map<number, Vec3[] | null>();
    const ringAt = (y: number) => {
      const k = Math.round(y / cm(0.5));
      if (!rings.has(k)) rings.set(k, hullRing(surf, hplane(b, k * cm(0.5)), { slab: cm(0.8), samples: 128, offset: cm(0.15) }));
      return rings.get(k)!;
    };
    s.ring = s.ring.map((p) => {
      const d = v3.norm([p[0] - c[0], 0, p[2] - c[2]]), h = ringAt(p[1]), r = h ? rayRing(h, [c[0], p[1], c[2]], d) : null;
      const rp = Math.hypot(p[0] - c[0], p[2] - c[2]);
      return r !== null && r > rp && r < rp + cm(3) ? [c[0] + d[0] * r, p[1], c[2] + d[2] * r] : p;
    });
  }
  let front = s.ring[0];
  for (const p of s.ring) if (p[2] > front[2]) front = p;
  const out = v3.norm([front[0] - s.centre[0], 0, front[2] - s.centre[2]]);
  const top = v3.madd(v3.madd(front, Y, -cm(0.6)), out, cm(0.25));
  const f = frameOf(v3.madd(top, Y, -cm(2.6)), out, Y);
  // Upright 5.5 cm, crossbar 3.4 cm, 4 mm thick, crossed a third of the way down: square bars with
  // bevelled edges, the face standing proud (catching the light).
  const side = v3.cross(out, Y);
  const bar = (o: Vec3, axis: Vec3, across: Vec3, half: number, w: number) => {
    const t = cm(0.2), e = cm(0.08);
    // A chamfered rectangle in the bar's cross-section, swept along it and capped.
    const sec = (q: Vec3): Vec3[] => [[-w + e, t], [w - e, t], [w, t - e], [w, -t + e], [w - e, -t], [-w + e, -t], [-w, -t + e], [-w, t - e]]
      .map(([a, z]) => v3.madd(v3.madd(q, across, a), out, z));
    const r0 = sec(v3.madd(o, axis, -half)), r1 = sec(v3.madd(o, axis, half));
    // The ends are bevelled too: they come in to a slightly smaller section.
    const shrink = (r: Vec3[], q: Vec3, d: number) => r.map((p) => v3.madd(v3.lerp(p, q, 0.25), axis, d));
    const q0 = v3.madd(o, axis, -half), q1 = v3.madd(o, axis, half);
    const rings = [shrink(r0, q0, -e), r0, r1, shrink(r1, q1, e)];
    const capOf = (r: Vec3[], q: Vec3) => r.map(() => q);
    return orientOutward(loftRings([capOf(rings[0], v3.madd(q0, axis, -e)), ...rings, capOf(rings[3], v3.madd(q1, axis, e))], { closedAround: true, tileU: 0.05 }), o);
  };
  const cross = merge([
    bar(f.o, Y, side, cm(2.75), cm(0.38)),
    bar(v3.madd(f.o, Y, cm(0.6)), side, Y, cm(1.7), cm(0.38)),
    cord([0, 1, 2, 3, 4, 5, 6, 7, 8].map((k): Vec3 => v3.madd(v3.madd(top, Y, cm(0.25) * Math.sin((k / 8) * Math.PI * 2)), side, cm(0.25) * Math.cos((k / 8) * Math.PI * 2))), cm(0.06), false, 5),
  ])!;
  const silver = mat('Silver cross', null, { color: st.color, roughness: 0.22, metalness: 1 });
  return [{ mesh: merge([cord(s.ring, cm(0.07), true, 5), cross])!, material: silver }];
}

/** Pearls: two strands. */
function pearlNecklace(g: GCtx, st: GarmentStyle): GPart[] {
  const rows: PolyMesh[] = [];
  for (const drop of [cm(2), cm(5.5)]) {
    const s = strand(g, drop);
    if (!s) continue;
    const [a] = beadRow(s.ring, s.centre, cm(0.45), cm(0.03));
    if (a) rows.push(a);
  }
  return part(merge(rows), mat('Pearls', null, { color: st.color, roughness: 0.18, metalness: 0.1 }));
}

/**
 * Curb links along a strand: oval links, each overlapping the next by half (pitch = half its
 * length), lying almost flat with a slight alternating twist and pressed flat (oval wire).
 * `k` scales the links (1 = a heavy Cuban chain); `seg` and `sides` set each link's detail.
 */
function curbLinks(s: { ring: Vec3[]; centre: Vec3 }, k: number, seg = 10, sides = 4): PolyMesh | null {
  const pitch = cm(0.62) * k, len = cm(0.72) * k, wide = cm(0.62) * k, wire = cm(0.26) * k;
  const links: PolyMesh[] = [];
  for (const { p, tangent, i } of along(s.ring, pitch, true)) {
    const out0 = v3.norm([p[0] - s.centre[0], 0, p[2] - s.centre[2]]);
    const out = v3.norm(v3.sub(out0, v3.scale(tangent, v3.dot(out0, tangent))));
    const across = v3.norm(v3.cross(out, tangent));
    const tilt = (i % 2 ? 1 : -1) * 0.22;
    const side = v3.norm(v3.add(v3.scale(across, Math.cos(tilt)), v3.scale(out, Math.sin(tilt))));
    const c = v3.madd(p, out, wire);
    const loop: Vec3[] = [];
    for (let q = 0; q < seg; q++) {
      const a = (q / seg) * Math.PI * 2;
      loop.push(v3.add(c, v3.add(v3.scale(tangent, Math.cos(a) * len), v3.scale(side, Math.sin(a) * wide))));
    }
    const m = cord([...loop, loop[0]], wire, false, sides);
    // Press the wire flat against the chest (curb links are flat, not round).
    const P = m.positions;
    for (let q = 0; q < P.length; q += 3) {
      const d: Vec3 = [P[q] - c[0], P[q + 1] - c[1], P[q + 2] - c[2]];
      P.set(v3.madd([P[q], P[q + 1], P[q + 2]], out, -v3.dot(d, out) * 0.45), q);
    }
    links.push(m);
  }
  return merge(links);
}

/** Rope chain: two strands twisted round each other along a strand, `r` thick overall. */
function ropeChain(s: { ring: Vec3[]; centre: Vec3 }, r: number): PolyMesh | null {
  const pts = along(s.ring, r * 0.8, true);
  const strands: Vec3[][] = [[], []];
  for (const { p, tangent, i } of pts) {
    const out0 = v3.norm([p[0] - s.centre[0], 0, p[2] - s.centre[2]]);
    const out = v3.norm(v3.sub(out0, v3.scale(tangent, v3.dot(out0, tangent))));
    const across = v3.cross(out, tangent);
    const c = v3.madd(p, out, r);
    // One full twist every 5 r along the chain.
    const a = (i * r * 0.8 * 2 * Math.PI) / (r * 5);
    for (const [k, ph] of [[0, 0], [1, Math.PI]] as const)
      strands[k].push(v3.add(c, v3.add(v3.scale(out, Math.cos(a + ph) * r * 0.45), v3.scale(across, Math.sin(a + ph) * r * 0.45))));
  }
  return merge(strands.map((l) => cord([...l, l[0]], r * 0.55, false, 5)));
}

/** Cuban link chain: heavy curb links round a line that hangs low on the chest, polished gold. */
function cubanChain(g: GCtx, st: GarmentStyle): GPart[] {
  const s = strand(g, cm(24), 0);
  return part(s && curbLinks(s, 1), mat('Cuban chain', null, { color: st.color, roughness: 0.16, metalness: 1 }));
}

/**
 * Layered gold chains (worn on the bare chest of an open shirt): a rope chain close round the neck
 * and a curb chain below it.
 */
function goldChains(g: GCtx, st: GarmentStyle): GPart[] {
  // Compact: two layers close round the neck, inside the collars, the lower resting on the top of
  // the sternum.
  const rope = strand(g, cm(3), 0.1, true), curb = strand(g, cm(7), 0, true);
  const metal = mat('Gold chains', null, { color: st.color, roughness: 0.18, metalness: 1 });
  return part(merge([rope && ropeChain(rope, cm(0.24)), curb && curbLinks(curb, 0.6, 8, 3)]), metal);
}

export const NECKLACES: GarmentDef[] = [
  {
    id: 'coral_beads', label: 'Coral beads (iyun)', slot: 'acc', patterns: ['solid'], color: '#c8322a', color2: '#d9a441',
    build: coralBeads,
  },
  {
    id: 'gold_necklace', label: 'Gold necklace & pendant', slot: 'acc', patterns: ['solid'], color: '#d9a441', color2: '#000000',
    build: goldNecklace,
  },
  {
    id: 'gold_necklace_long', label: 'Long gold chain & pendant', slot: 'acc', patterns: ['solid'], color: '#d9a441', color2: '#000000',
    build: (g, st) => goldNecklace(g, st, cm(17)),
  },
  {
    id: 'fine_pendant', label: 'Fine gold chain & pendant', slot: 'acc', patterns: ['solid'], color: '#d9a441', color2: '#000000',
    build: finePendant,
  },
  {
    id: 'silver_cross', label: 'Silver cross on a chain', slot: 'acc', patterns: ['solid'], color: '#c9ccd1', color2: '#000000',
    build: silverCross,
  },
  {
    id: 'pearl_necklace', label: 'Pearl necklace', slot: 'acc', patterns: ['solid'], color: '#f2ece0', color2: '#000000',
    build: pearlNecklace,
  },
  {
    id: 'gold_chains', label: 'Layered gold chains', slot: 'acc', patterns: ['solid'], color: '#e0b04a', color2: '#000000',
    build: goldChains,
  },
  {
    id: 'cuban_chain', label: 'Cuban link chain', slot: 'acc', patterns: ['solid'], color: '#e2b24c', color2: '#000000',
    build: cubanChain,
  },
];
