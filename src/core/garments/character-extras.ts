/** Reusable clothes and insignia for the newer character presets. Dimensions use MakeHuman decimetres. */
import type { Vec3 } from '../math';
import { cm, REGION } from './body';
import { cloth, hplane, isTrunk, mat, points, torsoY, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, ellipsoid, frameOf, merge, roundedBox, solidBand, v3 } from './ring';
import { RESORT_SHIRT } from './resort-shirt';
import { Caster } from './project';
import { cutShell } from './shell';
import { BIKER_VEST } from './biker-vest';
import { NECK_SCARF } from './neck-scarf';
import { HARD_HAT } from './hard-hat';
import { SCRUB_TOP, STETHOSCOPE } from './scrubs';
import { shortSkirt } from './gowns';
import { RACING_JACKET, RACING_JACKET_LONG } from './racing-jacket';
import { RACER_CASUAL_SHIRT } from './racer-shirt';
import { FUR_JACKET } from './fur-jacket';

function frontPoint(g: GCtx, y: number): Vec3 {
  const b = g.body, head = points(b, v => v.region === REGION.head);
  let best: Vec3 = [0, y, b.L.headZ + cm(5)], score = Infinity;
  for (const p of head) {
    const s = Math.abs(p[0]) * 2 + Math.abs(p[1] - y) * 2 - p[2] * 0.15;
    if (s < score && p[2] > b.L.headZ) { best = p; score = s; }
  }
  return best;
}

/**
 * Classic clown makeup, painted on the face: a white face, a wide red smile over the lips with upturned corners, tall
 * blue diamonds through the eyes, high arched brows, rosy cheeks and a big red nose. Every mark is placed from the
 * face's own eye and lip joints and painted as a thin layer that follows the skin.
 */
function clownFace(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const eyes = [b.joint('eye.L____head'), b.joint('eye.R____head')];
  const mouth = v3.scale(v3.add(b.joint('oris01____tail'), b.joint('oris05____tail')), 0.5);
  const eyeY = (eyes[0][1] + eyes[1][1]) / 2;
  const paint = (name: string, color: string, offset: number, shape: (p: Vec3) => number, gloss = 0.55): GPart[] => {
    const r = cutShell(b, g.faceVerts, {
      field: (v, p) => v.region === REGION.head && p[2] > b.L.headZ ? Math.min(shape(p), (1.25 - Math.abs(v.theta)) * cm(6)) : -1,
      offset, tile: 0.2, relax: 1, edgeSmooth: 3,
    });
    return r ? [{ mesh: r.mesh, material: mat(name, null, { color, roughness: gloss }) }] : [];
  };
  const oval = (p: Vec3, c: Vec3 | number[], rx: number, ry: number) => 1 - Math.hypot((p[0] - c[0]) / rx, (p[1] - c[1]) / ry);
  /** Keeps the eyes themselves clear of paint. */
  const eyeHole = (p: Vec3) => Math.min(...eyes.map(e => -oval(p, [e[0], e[1] + cm(0.1)], cm(1.45), cm(0.75))));
  /** Positive inside the smile: the lips widened, with corners turned up into the cheeks. */
  const smile = (p: Vec3) => {
    const x = (p[0] - mouth[0]) / cm(4.4);
    const lift = cm(1.6) * x * x;
    const half = cm(1.25) * (1 - 0.55 * x * x);
    return Math.min(1 - Math.abs(x), (half - Math.abs(p[1] - mouth[1] - lift + cm(0.25))) / cm(1));
  };
  const parts: GPart[] = [
    // White face from chin to hairline, over everything but the eyes and the smile.
    ...paint('Clown face paint', st.color2, cm(0.09), p => Math.min(
      1 - Math.hypot(p[0] / cm(7.2), (p[1] - (eyeY + mouth[1]) / 2) / cm(10.5)),
      eyeHole(p), -smile(p) + 0.05)),
    ...paint('Clown smile', st.color, cm(0.15), smile, 0.4),
    // Tall diamonds through each eye and arched brows high on the forehead.
    ...paint('Clown eye diamonds', '#2f63c9', cm(0.15), p => Math.min(eyeHole(p), Math.max(...eyes.map(e =>
      1 - Math.abs(p[0] - e[0]) / cm(1.6) - Math.abs(p[1] - e[1]) / cm(3.6))))),
    ...paint('Clown arched brows', '#1d1d22', cm(0.15), p => Math.max(...eyes.map(e => {
      const x = (p[0] - e[0] * 1.08) / cm(2.4), arch = e[1] + cm(3.4) + cm(1.2) * (1 - x * x);
      return Math.min(1 - Math.abs(x), (cm(0.45) - Math.abs(p[1] - arch)) / cm(0.3));
    }))),
    ...paint('Clown rosy cheeks', '#ef5b6b', cm(0.15), p => Math.max(...eyes.map(e =>
      oval(p, [e[0] * 1.55, mouth[1] + cm(3.4)], cm(1.5), cm(1.3)))), 0.6),
  ];
  // The nose: a glossy red ball over the tip, the most forward point of the face between the eyes and the mouth.
  let tip: Vec3 = frontPoint(g, eyeY - (eyeY - mouth[1]) * 0.55);
  for (const q of points(b, v => v.region === REGION.head))
    if (Math.abs(q[0]) < cm(1) && q[1] < eyeY - cm(1) && q[1] > mouth[1] + cm(1) && q[2] > tip[2]) tip = q;
  parts.push({ mesh: ellipsoid(frameOf(v3.add(tip, [0, 0, cm(0.6)]), [0, 1, 0], [0, 0, 1]), [cm(2.2), cm(2.1), cm(2.1)], [0.5, 0.5], 22, 12),
    material: mat('Clown nose', null, { color: st.color, roughness: 0.4, doubleSided: true }) });
  return parts;
}

/**
 * Knitted balaclava: covers the whole head, ears and neck down to the collar, with two almond eye holes and a mouth
 * hole placed from the face's own eye and lip joints, so they sit right on any face.
 */
function faceMask(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body;
  const eyes = [b.joint('eye.L____head'), b.joint('eye.R____head')];
  const lips = [b.joint('oris01____tail'), b.joint('oris05____tail')];
  const mouth: Vec3 = v3.scale(v3.add(lips[0], lips[1]), 0.5);
  const faceZ = Math.min(eyes[0][2], mouth[2]) - cm(1.5);
  const hole = (p: Vec3, c: Vec3, rx: number, ry: number) => Math.hypot((p[0] - c[0]) / rx, (p[1] - c[1]) / ry) - 1;
  const r = cutShell(b, g.faceVerts, {
    field: (v, p) => {
      const worn = v.region === REGION.head ? 1 : v.region === REGION.neck ? (v.t - 0.12) * 6 : -1;
      if (worn < 0 || p[2] < faceZ) return worn;
      const eye = Math.min(...eyes.map(e => hole(p, [e[0] * 1.04, e[1] + cm(0.2), e[2]], cm(2.3), cm(1.45))));
      return Math.min(worn, eye, hole(p, [mouth[0], mouth[1] - cm(0.2), mouth[2]], cm(2.45), cm(2.05)));
    },
    offset: cm(0.6), tile: 0.07, relax: 3, edgeSmooth: 3,
  });
  return r ? [{ mesh: r.mesh, material: cloth(g, 'Knitted balaclava', st, { roughness: 0.96 }), hides: r.covered, hidesHair: true, smooth: true }] : [];
}

function chestEmblem(g: GCtx, st: GarmentStyle, kind: 'police' | 'medical'): GPart[] {
  const b = g.body, y = torsoY(b, 0.78), z = b.L.torsoZ + cm(11);
  const hit = g.topParts?.[0] ? new Caster(g.topParts[0].mesh, null, () => true, 'front').hit(cm(8), y) : null;
  const front: Vec3 = hit?.n ?? [0, 0, 1];
  const centre: Vec3 = hit ? v3.madd(hit.p, front, cm(0.45)) : [cm(8), y, z];
  if (kind === 'police') {
    return [{ mesh: roundedBox(frameOf(centre, front, [0, 1, 0]), [cm(2.1), cm(2.6), cm(0.35)], 0.7),
      material: mat('Police badge', null, { color: st.color, metalness: 0.8, roughness: 0.26 }) }];
  }
  const vertical = roundedBox(frameOf(centre, front, [0, 1, 0]), [cm(0.7), cm(2.4), cm(0.25)], 0.3);
  const horizontal = roundedBox(frameOf(centre, front, [1, 0, 0]), [cm(0.7), cm(2.4), cm(0.3)], 0.3);
  return [{ mesh: merge([vertical, horizontal])!, material: mat('Medical cross', null, { color: st.color, roughness: 0.7 }) }];
}

function policeNameplate(g: GCtx, st: GarmentStyle): GPart[] {
  const y = torsoY(g.body, 0.78);
  const shirt = g.topParts?.[0];
  if (!shirt) return [];
  const hit = new Caster(shirt.mesh, null, () => true, 'front').hit(-cm(8), y);
  if (!hit) return [];
  const centre = v3.madd(hit.p, hit.n, cm(0.35));
  return [{ mesh: roundedBox(frameOf(centre, hit.n, [0, 1, 0]), [cm(3.1), cm(0.75), cm(0.2)], 0.7),
    material: mat('Police nameplate', null, { color: st.color, metalness: 0.75, roughness: 0.3 }) }];
}

function fittedMiniSkirt(g: GCtx, st: GarmentStyle): GPart[] {
  const b = g.body, waistY = torsoY(b, 0.22);
  const fabric = cloth(g, 'Fitted mini skirt', st, { roughness: 0.82, doubleSided: true });
  const fitted = shortSkirt(g, fabric, waistY, 0.45);
  if (!fitted) return [];
  const waist = solidBand(points(b, isTrunk), hplane(b, waistY), cm(3), cm(0.25), cm(1.45), { samples: 64, tileU: 0.2 });
  const hem = cord(fitted.hem, cm(0.14), false, 6);
  return [
    ...fitted.parts,
    ...(waist ? [{ mesh: waist, material: { ...fabric, name: 'Fitted mini skirt waistband' }, smooth: true }] : []),
    { mesh: hem, material: { ...fabric, name: 'Fitted mini skirt hem' }, skinMix: fitted.skin(hem.positions) },
  ];
}

export const CHARACTER_EXTRAS: GarmentDef[] = [
  RESORT_SHIRT,
  RACER_CASUAL_SHIRT,
  { id: 'fitted_mini_skirt', label: 'Fitted mini skirt', slot: 'bottom', patterns: ['solid', 'suiting', 'linen'], color: '#253e60', color2: '#253e60', build: fittedMiniSkirt },
  RACING_JACKET,
  RACING_JACKET_LONG,
  BIKER_VEST,
  FUR_JACKET,
  NECK_SCARF,
  HARD_HAT,
  SCRUB_TOP,
  STETHOSCOPE,
  { id: 'clown_face', label: 'Clown makeup and nose', slot: 'acc', patterns: ['solid'], color: '#e0202f', color2: '#f7f4ef', colorLabels: ['Nose and smile', 'Face paint'], build: clownFace },
  { id: 'face_mask', label: 'Knitted balaclava', slot: 'acc', patterns: ['rib', 'solid', 'jersey'], color: '#181a1e', color2: '#22262d', build: faceMask },
  { id: 'police_badge', label: 'Police badge', slot: 'acc', patterns: ['solid'], color: '#c9ad56', color2: '#182d4c', build: (g, st) => chestEmblem(g, st, 'police') },
  { id: 'police_nameplate', label: 'Police nameplate', slot: 'acc', patterns: ['solid'], color: '#c9ad56', color2: '#182d4c', build: policeNameplate },
  { id: 'medical_emblem', label: 'Paramedic cross', slot: 'acc', patterns: ['solid'], color: '#df3647', color2: '#ffffff', build: (g, st) => chestEmblem(g, st, 'medical') },
];
