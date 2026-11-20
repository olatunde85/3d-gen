/** Open-face motorcycle helmet with a rounded shell, short peak and fastened chin strap. */
import type { PolyMesh } from '../geometry';
import type { Vec3 } from '../math';
import { cm, REGION } from './body';
import { mat, points, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, ellipsoid, frameOf, hullRing, loftRings, merge, orientOutward, roundedBox, v3 } from './ring';
import { cutShell } from './shell';

/** Flat strap through the points of a path, facing forward rather than reading as a round cord. */
function strap(path: Vec3[], width: number): PolyMesh {
  const left: Vec3[] = [], right: Vec3[] = [];
  for (let i = 0; i < path.length; i++) {
    const prev = path[Math.max(0, i - 1)], next = path[Math.min(path.length - 1, i + 1)];
    const tangent = v3.norm(v3.sub(next, prev));
    const across = v3.norm(v3.cross([0, 0, 1], tangent));
    left.push(v3.madd(path[i], across, -width / 2));
    right.push(v3.madd(path[i], across, width / 2));
  }
  return loftRings([left, right], { closedAround: false, tileU: 0.08, tileV: 0.04 });
}

function buildOpenFaceHelmet(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const height = b.L.crownY - b.L.chinY;
  const shell = cutShell(b, g.faceVerts, {
    // The face stays open below the brow. The cut drops around both ears and the nape.
    field: v => {
      if (v.region !== REGION.head) return -1;
      const u = Math.max(0, Math.min(1, (1.5 - Math.abs(v.theta)) / 0.58));
      const front = u * u * (3 - 2 * u);
      return v.t - (0.36 + 0.42 * front);
    },
    offset: v => cm(v.t > 0.7 ? 2.6 : 2.2),
    tile: 0.14, relax: 3, edgeSmooth: 5, edgeLoops: true,
  });
  if (!shell) return [];
  const main = mat('Open-face motorcycle helmet shell', null, { color: st.color, roughness: 0.4, metalness: 0.05 });
  const trim = mat('Open-face motorcycle helmet edge padding', null, { color: '#111215', roughness: 0.92 });
  const parts: GPart[] = [{ mesh: shell.mesh, material: main, hides: shell.covered, hidesHair: true, headwear: true, smooth: true }];
  const edge = (shell.edgeLoops ?? []).filter(loop => loop.length > 10).map(loop => cord(loop, cm(0.36), true, 7));
  if (edge.length) parts.push({ mesh: merge(edge)!, material: trim, smooth: true });

  const head = points(b, v => v.region === REGION.head);
  const browY = b.L.chinY + height * 0.79;
  const A = 1.05, columns = 32;
  const root = hullRing(head, { origin: [0, browY, b.L.headZ], normal: [0, 1, 0] },
    { slab: cm(1.6), samples: columns, offset: cm(2.7), arc: [-A, A] });
  if (root) {
    // The front edge is broad and gently drooped, with shorter corners at the temples.
    const tip = root.map((p, i): Vec3 => {
      const u = Math.abs((i / columns) * 2 - 1);
      return [p[0], p[1] - cm(1.15 + 0.6 * (1 - u)), p[2] + cm(8.0 * (1 - 0.68 * u * u))];
    });
    parts.push(
      { mesh: orientOutward(loftRings([root, tip], { closedAround: false, tileU: 0.12, tileV: 0.08 }),
        [0, browY - cm(3), b.L.headZ]), material: mat('Open-face helmet transparent visor', null,
          { color: '#aebdc5', roughness: 0.12, metalness: 0.04, alpha: 'blend', opacity: 0.38, doubleSided: true }), smooth: true },
      { mesh: cord(tip.map((p): Vec3 => [p[0], p[1] - cm(0.2), p[2]]), cm(0.25), false, 6),
        material: mat('Open-face helmet peak edge', null, { color: '#0e0f11', roughness: 0.6 }) },
    );
  }

  // A subdued side stripe and temple rivets make the otherwise plain shell read as road gear.
  const stripe: Vec3[] = [];
  for (let i = 0; i <= 36; i++) {
    const a = 1.1 + (Math.PI * 2 - 2.2) * i / 36;
    const y = b.L.chinY + height * (0.55 - 0.09 * Math.sin((i / 36) * Math.PI));
    const ring = hullRing(head, { origin: [0, y, b.L.headZ], normal: [0, 1, 0] },
      { slab: cm(1.6), samples: 96, offset: cm(2.95) });
    if (ring) stripe.push(ring[Math.round(((a + Math.PI) / (2 * Math.PI)) * 96) % 96]);
  }
  if (stripe.length > 8) parts.push({ mesh: cord(stripe, cm(0.14), false, 5),
    material: mat('Open-face helmet side stripe', null, { color: st.color2, roughness: 0.55 }) });

  const earY = b.L.chinY + height * 0.43;
  const earRing = hullRing(head, { origin: [0, earY, b.L.headZ], normal: [0, 1, 0] },
    { slab: cm(1.8), samples: 64, offset: cm(2.1) });
  if (earRing) {
    const sideAt = (s: number) => earRing[s > 0 ? 48 : 16];
    const left = sideAt(-1), right = sideAt(1);
    const underChin: Vec3 = [0, b.L.chinY - cm(1.3), b.L.headZ + cm(3.3)];
    const path: Vec3[] = [
      left,
      [left[0] * 0.86, b.L.chinY + height * 0.22, left[2] + cm(1.2)],
      [left[0] * 0.52, b.L.chinY + cm(0.5), b.L.headZ + cm(4.2)],
      underChin,
      [right[0] * 0.52, b.L.chinY + cm(0.5), b.L.headZ + cm(4.2)],
      [right[0] * 0.86, b.L.chinY + height * 0.22, right[2] + cm(1.2)],
      right,
    ];
    parts.push({ mesh: strap(path, cm(1.8)), material: mat('Open-face helmet chin strap', null,
      { color: '#18191b', roughness: 0.94, doubleSided: true }), smooth: true });
    const rivets = [-1, 1].map(s => {
      const p = sideAt(s);
      return ellipsoid(frameOf(v3.madd(p, [s, 0, 0], cm(0.25)), [s, 0, 0], [0, 1, 0]),
        [cm(0.7), cm(0.7), cm(0.24)], [0.5, 0.5], 12, 6);
    });
    parts.push({ mesh: merge(rivets)!, material: mat('Open-face helmet strap rivets', null,
      { color: '#5e6063', roughness: 0.4, metalness: 0.55 }) });
    const buckle = roundedBox(frameOf(path[2], [0, 0, 1], [0, 1, 0]), [cm(1.15), cm(0.85), cm(0.18)], 1);
    parts.push({ mesh: buckle, material: mat('Open-face helmet strap buckle', null,
      { color: '#424549', roughness: 0.45, metalness: 0.5 }) });
  }
  return parts;
}

export const OPEN_FACE_HELMET: GarmentDef = {
  id: 'open_face_helmet', label: 'Open-face motorcycle helmet', slot: 'acc',
  patterns: ['solid'], color: '#202123', color2: '#777a7d', colorLabels: ['Shell', 'Stripe'],
  build: buildOpenFaceHelmet,
};
