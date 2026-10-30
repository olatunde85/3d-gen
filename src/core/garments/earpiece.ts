/**
 * Security earpiece: a black earbud in the right ear and a clear coiled tube from it down behind
 * the ear and the side of the neck into the collar.
 */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION } from './body';
import { hplane, mat, points, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, ellipsoid, frameOf, hullRing, rayRing, v3 } from './ring';

function earpiece(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, s = -1;
  const eyeY = (b.joint('eye.L____head')[1] + b.joint('eye.R____head')[1]) / 2;
  const head = b.verts(REGION.head).map((v) => b.p(v));
  let hz = 0;
  for (const p of head) hz += p[2] / head.length;
  // The ear: the head's outermost point on the right a little below eye height.
  let ear: Vec3 = [0, eyeY, hz];
  for (const p of head) if (p[0] * s > ear[0] * s && Math.abs(p[1] - (eyeY - cm(1.5))) < cm(2.5)) ear = p;
  // The bud sits in the concha: in from the ear's rim toward the head, a little forward.
  const centre: Vec3 = [0, ear[1], hz];
  const inward = v3.norm(v3.sub(centre, [ear[0], ear[1], ear[2]]));
  const bud = v3.add(v3.madd(ear, inward, cm(0.9)), [0, -cm(0.3), cm(0.5)]);
  const budMesh = ellipsoid(frameOf(bud, v3.scale(inward, -1), [0, 1, 0]), [cm(0.45), cm(0.55), cm(0.35)], [0.5, 0.5], 10, 6);
  // Its path: out of the bud, down behind the ear lobe, then down the side and back of the neck,
  // 5 mm off the skin, into the collar.
  const surf = points(b, (v) => v.region === REGION.head || v.region === REGION.neck);
  const angle = s * 2.1; // round from the front (0) toward the back
  const d: Vec3 = [Math.sin(angle), 0, Math.cos(angle)];
  const yEnd = b.L.neckY - cm(1);
  const path: Vec3[] = [bud, v3.add(bud, [s * cm(0.4), -cm(1.2), -cm(0.6)])];
  for (let y = bud[1] - cm(2.5); y >= yEnd; y -= cm(0.8)) {
    const h = hullRing(surf, hplane(b, y), { slab: cm(0.6), samples: 64, offset: cm(0.5) });
    let c: Vec3 = [0, y, 0];
    if (h) for (const q of h) c = v3.add(c, v3.scale([q[0], 0, q[2]], 1 / h.length));
    const r = h ? rayRing(h, [c[0], y, c[2]], d) : null;
    if (r !== null) path.push([c[0] + d[0] * r, y, c[2] + d[2] * r]);
  }
  // Smooth the path, then coil the tube round it (4 mm across, 1.2 cm pitch).
  let line = path;
  for (let it = 0; it < 3; it++) line = line.map((p, i) => (i === 0 || i === line.length - 1 ? p : v3.scale(v3.add(v3.add(line[i - 1], v3.scale(p, 2)), line[i + 1]), 0.25)));
  const coil: Vec3[] = [];
  let along = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], c = line[i + 1], seg = v3.len(v3.sub(c, a)), t = v3.norm(v3.sub(c, a));
    const u = v3.norm(v3.cross(t, [1, 0, 0])), w = v3.cross(t, u);
    for (let k = 0; k < 10; k++) {
      const p = v3.lerp(a, c, k / 10), ang = ((along + (seg * k) / 10) / cm(1.2)) * Math.PI * 2;
      // The coil starts after the first 1.5 cm (a plain tube out of the bud).
      const r = along > cm(1.5) ? cm(0.2) : 0;
      coil.push(v3.add(p, v3.add(v3.scale(u, Math.cos(ang) * r), v3.scale(w, Math.sin(ang) * r))));
    }
    along += seg;
  }
  coil.push(line[line.length - 1]);
  const tube: PolyMesh = cord(coil, cm(0.08), false, 5);
  const headAt = (m: PolyMesh): Float32Array => {
    const out = new Float32Array(m.positions.length);
    for (let i = 0; i < out.length; i += 3) out.set([0, (b.L.crownY + b.L.chinY) / 2, hz], i);
    return out;
  };
  return [
    { mesh: budMesh, material: mat('Earpiece', null, { color: st.color, roughness: 0.35 }), skinAt: headAt(budMesh) },
    { mesh: tube, material: mat('Earpiece tube', null, { color: st.color2, roughness: 0.15, alpha: 'blend', opacity: 0.75 }) },
  ];
}

export const EARPIECE: GarmentDef = {
  id: 'earpiece', label: 'Security earpiece', slot: 'acc', patterns: ['solid'], color: '#151515', color2: '#d9dde0', build: earpiece,
};
