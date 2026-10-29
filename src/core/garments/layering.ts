/**
 * Layering a top under a jacket: the top's body keeps only what shows (in the V), so it never
 * pokes through; its collar (a part of its own) is never cut, and round the back and sides it lies
 * over the top half of the jacket's collar.
 */
import { compact } from '../geometry';
import { smoothstep } from '../math';
import { REGION, type Body } from './body';
import { hplane, type GPart } from './kit';
import { Caster } from './project';
import { hullRing, merge, rayRing } from './ring';

/** `tops` and `jackets`: which of `parts` are the top's and the jacket's (updated in place). */
export function layerUnderJacket(body: Body, parts: GPart[], tops: Set<GPart>, jackets: Set<GPart>): void {
  // The top keeps only what shows (in the V and the collar). A vertex is hidden
  // where the jacket covers it seen from the front or back (wherever it lies relative to the
  // jacket, which may be closer fitting); on the trunk, where it is not well inside the jacket's
  // outline at its height (round the sides), unless no jacket is in front of it (the open V); on
  // the arms (inside the jacket's sleeves), where the jacket is within 5 cm or it is outside the
  // trunk's outline.
  const L = body.L;
  collarOver(body, parts, tops, jackets);
  const jacket = merge(parts.filter((p) => jackets.has(p)).map((p) => p.mesh));
  if (!jacket) return;
  const front = new Caster(jacket, null, () => true, 'front'), back = new Caster(jacket, null, () => true, 'back');
  // Each piece knows the body vertex under each of its vertices (`ref`): trunk or arm.
  const onTrunk = (r: number) => r >= 0 && [REGION.torso, REGION.hips, REGION.neck].includes(body.regions[r] as 1);
  const J: [number, number, number][] = [], Jt: [number, number, number][] = [];
  for (const p of parts.filter((q) => jackets.has(q))) {
    const P = p.mesh.positions;
    for (let i = 0; i < P.length / 3; i++) {
      const q: [number, number, number] = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      J.push(q);
      if (onTrunk(p.mesh.ref?.[i] ?? -1)) Jt.push(q);
    }
  }
  const c: [number, number, number] = [0, 0, L.torsoZ];
  const rings = new Map<number, [number, number, number][] | null>();
  const ringAt = (y: number) => {
    const k = Math.round(y / 0.1);
    if (!rings.has(k)) rings.set(k, hullRing(Jt, hplane(body, k * 0.1), { slab: 0.12, samples: 96, offset: -0.3 }));
    return rings.get(k)!;
  };
  const cell = 0.5, grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  J.forEach((q, i) => (grid.get(key(...q)) ?? grid.set(key(...q), []).get(key(...q))!).push(i));
  const near = (x: number, y: number, z: number) => {
    const [cx, cy, cz] = [Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++)
          for (const i of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) if ((J[i][0] - x) ** 2 + (J[i][1] - y) ** 2 + (J[i][2] - z) ** 2 < cell * cell) return true;
    return false;
  };
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    // (A collar is never cut.)
    if (!tops.has(p) || p.collar) continue;
    const P = p.mesh.positions, under = new Uint8Array(P.length / 3);
    for (let v = 0; v < under.length; v++) {
      const [x, y, z] = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
      const fHit = front.hit(x, y), hit = z > L.torsoZ ? fHit : back.hit(x, y);
      if (hit && Math.abs(hit.p[2] - z) < 0.6) { under[v] = 1; continue; }
      const arm = !onTrunk(p.mesh.ref?.[v] ?? -1);
      if (arm && near(x, y, z)) { under[v] = 1; continue; }
      // The open V: no jacket in front of it.
      if (!arm && z > L.torsoZ && !(fHit && fHit.p[2] > z - 0.6)) continue;
      const r = ringAt(y);
      if (!r) continue;
      const d = Math.hypot(x - c[0], z - c[2]) || 1;
      const rr = rayRing(r, [c[0], y, c[2]], [(x - c[0]) / d, 0, (z - c[2]) / d]);
      if (rr !== null && d > rr) under[v] = 1;
    }
    // A face goes once all its corners are covered, or most of them away from the front's middle
    // (part-covered faces at the sides poke through; in the V they show at its edges).
    const mid = (c: Uint32Array) => Array.from(c).every((v) => Math.abs(P[v * 3]) < 0.45 * L.shoulderX && P[v * 3 + 2] > L.torsoZ);
    parts[i] = {
      ...p,
      mesh: compact(p.mesh, (_, c) => {
        const n = Array.from(c).filter((v) => under[v]).length;
        return mid(c) ? n < c.length : n * 2 < c.length;
      }),
    };
  }
}

/**
 * Round the back and sides of the neck the top's collar (its own part) lies over the top half of
 * the jacket's: it is widened, by one even amount at each angle round the neck so it keeps its
 * shape, just enough to clear the jacket's collar.
 */
function collarOver(body: Body, parts: GPart[], tops: Set<GPart>, jackets: Set<GPart>): void {
  const L = body.L;
  // The neck's axis, and angles round it (0 = front) in bins.
  const nc: [number, number] = [0, 0];
  let nn = 0;
  for (const v of body.verts(REGION.neck)) [nc[0], nc[1], nn] = [nc[0] + body.coords[v * 3], nc[1] + body.coords[v * 3 + 2], nn + 1];
  if (!nn) return;
  [nc[0], nc[1]] = [nc[0] / nn, nc[1] / nn];
  const AB = 48, angle = (x: number, z: number) => Math.atan2(x - nc[0], z - nc[1]);
  const bin = (x: number, z: number) => Math.floor((angle(x, z) / (2 * Math.PI) + 0.5) * AB) % AB;
  const rad = (x: number, z: number) => Math.hypot(x - nc[0], z - nc[1]);
  const key = (a: number, y: number) => a * 1000 + Math.round(y / 0.05);
  const nearNeck = (x: number, y: number, z: number) => y > L.neckY - 0.8 && rad(x, z) < 1.3;
  // The jacket's surface round the neck: radii per angle and 5 mm height.
  const jacketR = new Map<number, number[]>();
  for (const p of parts) {
    if (!jackets.has(p)) continue;
    const P = p.mesh.positions;
    for (let i = 0; i < P.length; i += 3) {
      if (!nearNeck(P[i], P[i + 1], P[i + 2])) continue;
      const k = key(bin(P[i], P[i + 2]), P[i + 1]);
      (jacketR.get(k) ?? jacketR.set(k, []).get(k)!).push(rad(P[i], P[i + 2]));
    }
  }
  // The collar's outermost point per angle and height, and how far out it must go to clear the
  // jacket's surface just outside it (within 2.5 cm: the jacket's collar, not its shoulders).
  const collars = parts.filter((p) => tops.has(p) && p.collar);
  const outer = new Map<number, number>();
  for (const p of collars) {
    const P = p.mesh.positions;
    for (let i = 0; i < P.length; i += 3) {
      if (!nearNeck(P[i], P[i + 1], P[i + 2])) continue;
      const k = key(bin(P[i], P[i + 2]), P[i + 1]);
      outer.set(k, Math.max(outer.get(k) ?? 0, rad(P[i], P[i + 2])));
    }
  }
  let push = new Float32Array(AB);
  for (const [k, r] of outer) {
    const a = Math.floor(k / 1000);
    for (const da of [-1, 0, 1])
      for (let d = -1; d <= 1; d++)
        for (const q of jacketR.get(k + da * 1000 + d) ?? []) if (q > r - 0.1 && q < r + 0.25) push[a] = Math.max(push[a], q + 0.08 - r);
  }
  // At most 2.5 cm (the collar keeps its shape); each angle takes the most its neighbours need, then
  // smoothed round the neck (so the edge runs straight and nothing pokes through between them).
  push = push.map((x) => Math.min(x, 0.25));
  for (let it = 0; it < 3; it++) push = push.map((_, a) => Math.max(push[(a + AB - 1) % AB], push[a], push[(a + 1) % AB]));
  for (let it = 0; it < 3; it++) push = push.map((_, a) => (push[(a + AB - 1) % AB] + 2 * push[a] + push[(a + 1) % AB]) / 4);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!collars.includes(p)) continue;
    const Q = new Float32Array(p.mesh.positions);
    for (let v = 0; v < Q.length / 3; v++) {
      const [x, z] = [Q[v * 3], Q[v * 3 + 2]];
      // Back and sides only, easing out toward the front (where the collar lies on the chest).
      const w = smoothstep(1.1, 1.5, Math.abs(angle(x, z)));
      const r = rad(x, z) || 1, k = (r + push[bin(x, z)] * w) / r;
      Q[v * 3] = nc[0] + (x - nc[0]) * k;
      Q[v * 3 + 2] = nc[1] + (z - nc[1]) * k;
    }
    parts[i] = { ...p, mesh: { ...p.mesh, positions: Q } };
    tops.delete(p);
    tops.add(parts[i]);
  }
}
