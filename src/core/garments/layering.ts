/**
 * Layering a top under a jacket: the top keeps only what shows (in the V and at the collar), so it
 * never pokes through, and a shirt's collar folds out over the jacket's.
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
  const L = body.L, c: [number, number, number] = [0, 0, L.torsoZ];
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
  // The jacket's collar round the neck, by angle about the neck's axis (0 = front): its top edge
  // and how far out it is (per 1 mm height bin).
  const nc: [number, number] = [0, L.torsoZ];
  let nn = 0;
  for (const v of body.verts(REGION.neck)) [nc[0], nc[1], nn] = [nc[0] + body.coords[v * 3], nc[1] + body.coords[v * 3 + 2], nn + 1];
  if (nn) [nc[0], nc[1]] = [nc[0] / nn, nc[1] / nn];
  const AB = 48, ang = (x: number, z: number) => Math.floor(((Math.atan2(x - nc[0], z - nc[1]) / (2 * Math.PI) + 0.5) * AB)) % AB;
  let colTop: Float32Array = new Float32Array(AB).fill(NaN), colR: Float32Array = new Float32Array(AB).fill(NaN);
  const collarPts = Jt.filter((q) => q[1] > L.neckY - 0.8 && Math.hypot(q[0] - nc[0], q[2] - nc[1]) < 1.3);
  for (const q of collarPts) {
    const a = ang(q[0], q[2]);
    if (!(q[1] <= colTop[a])) colTop[a] = q[1];
  }
  // Its radius near the top edge.
  for (const q of collarPts) {
    const a = ang(q[0], q[2]);
    if (q[1] > colTop[a] - 0.2) colR[a] = Math.max(Number.isNaN(colR[a]) ? 0 : colR[a], Math.hypot(q[0] - nc[0], q[2] - nc[1]));
  }
  // Smooth both round the neck (gaps filled from neighbours).
  const smoothRing = (f: Float32Array): Float32Array => {
    for (let it = 0; it < 6; it++) {
      const g2 = new Float32Array(AB);
      for (let a = 0; a < AB; a++) {
        const vals = [f[(a + AB - 1) % AB], f[a], f[a], f[(a + 1) % AB]].filter((x) => !Number.isNaN(x));
        g2[a] = vals.length ? vals.reduce((t, x) => t + x, 0) / vals.length : NaN;
      }
      f = g2;
    }
    return f;
  };
  colTop = smoothRing(colTop);
  colR = smoothRing(colR);
  // Shirt collar vertices laid out over the jacket's collar (always shown).
  const folded = new Map<GPart, Uint8Array>();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!tops.has(p)) continue;
    // The shirt's collar folds out over the upper half of the jacket's collar (round the back and
    // sides): collar vertices level with it are laid just outside it.
    const Q = new Float32Array(p.mesh.positions), out = new Uint8Array(Q.length / 3);
    for (let v = 0; v < Q.length / 3; v++) {
      const [x, y, z] = [Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2]];
      if (y < L.neckY - 0.8 || Math.abs(x) > 0.65 * L.shoulderX) continue;
      const a = ang(x, z), top = colTop[a], rj = colR[a];
      if (!Number.isFinite(top) || !Number.isFinite(rj) || y < top - 0.3 || y > top + 0.3) continue;
      const r = Math.hypot(x - nc[0], z - nc[1]) || 1;
      // Eased in from halfway down the jacket's collar (and out toward the shoulders), so the
      // fold has a smooth edge.
      const w = smoothstep(top - 0.3, top - 0.12, y) * smoothstep(0.65 * L.shoulderX, 0.5 * L.shoulderX, Math.abs(x));
      const target = Math.max(r, rj + 0.06);
      const k = (r + (target - r) * w) / r;
      Q[v * 3] = nc[0] + (x - nc[0]) * k;
      Q[v * 3 + 2] = nc[1] + (z - nc[1]) * k;
      // Lies down over the collar's top edge.
      if (y > top) Q[v * 3 + 1] = top + (y - top) * 0.3;
      if (w > 0.5) out[v] = 1;
    }
    parts[i] = { ...p, mesh: { ...p.mesh, positions: Q } };
    folded.set(parts[i], out);
    tops.delete(p);
    tops.add(parts[i]);
  }
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!tops.has(p)) continue;
    const P = p.mesh.positions, under = new Uint8Array(P.length / 3);
    for (let v = 0; v < under.length; v++) {
      const [x, y, z] = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
      if (folded.get(p)?.[v]) continue;
      const fHit = front.hit(x, y), hit = z > L.torsoZ ? fHit : back.hit(x, y);
      // The collar shows round the neck: at the front and sides, and at the back above the
      // jacket's collar (where no jacket lies outside it).
      if (y > L.neckY - 0.25 && z <= L.torsoZ && Math.abs(x) < 0.4 * L.shoulderX && !(hit && hit.p[2] < z + 0.05)) continue;
      // ... and from the sides of the neck down to the lapels, wherever the jacket isn't over it.
      if (y > L.neckY - 0.7 && z > L.torsoZ && Math.abs(x) < 0.65 * L.shoulderX && !(fHit && fHit.p[2] > z)) continue;
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
