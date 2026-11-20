/** A fitted cotton singlet with its own cut, rib knit and sewn neckline, armhole and hem bindings. */
import { cm, REGION, type Body, type VInfo } from './body';
import { mat, type GarmentDef, type GarmentStyle, type GCtx, type GPart } from './kit';
import { cord, merge } from './ring';
import { cutShell } from './shell';
import { render } from './textures';

const smoothMax = (a: number, b: number, k: number) => Math.max(a, b) + k * Math.log1p(Math.exp(-Math.abs(a - b) / k));
const smoothMin = (a: number, b: number, k: number) => -smoothMax(-a, -b, k);

/** Neck and arm cutlines measured against the morphed shoulders, so the vest keeps its fit on different bodies. */
/** The singlet's outline; a jersey has wider straps (half-width as a fraction of the shoulders) and its own hem. */
export function singletCut(body: Body, o: { strap?: number; hem?: number } = {}) {
  const strapHalf = o.strap ?? 0.1, hemT = o.hem ?? 0.075;
  const shoulderX = body.L.shoulderX, torsoHeight = body.L.neckY - body.L.hipY;
  return (v: VInfo) => {
    if (!(v.region === REGION.torso || v.region === REGION.hips || v.region === REGION.neck ||
      v.region === REGION.upperarm)) return -1;
    // On the arm only the straps over the shoulder tops: cloth on the shoulder joint would be dragged about by a
    // raised arm.
    const armLimit = v.region === REGION.upperarm ? (0.5 + strapHalf) * shoulderX - v.ax : Infinity;
    const hem = (v.tt - hemT) * torsoHeight;
    // A low U at the front and a shallow curve at the back; wide flat shoulders hold the straps.
    const front = Math.min(1, Math.max(0, (Math.cos(v.tth) + 0.35) / 0.7));
    const neckline = (0.91 - 0.12 * front) + (0.07 + 0.12 * front) *
      Math.min(1, (v.ax / (0.53 * shoulderX)) ** 3);
    const torso = (neckline - v.tt) * torsoHeight;
    const strap = strapHalf * shoulderX - Math.abs(v.ax - 0.49 * shoulderX);
    const top = smoothMax(torso, strap, cm(1.1));
    // The outer edge tapers inward over the shoulder, then opens to the torso at the armpit.
    const q = Math.min(1, Math.max(0, (0.83 - v.tt) / 0.2));
    const ease = (q * q * (3 - 2 * q)) ** 1.6;
    const outerEdge = (0.59 + 0.38 * ease) * shoulderX - v.ax;
    return Math.min(hem, armLimit, smoothMin(top, outerEdge, cm(0.6)));
  };
}

function ribFabric(g: GCtx, st: GarmentStyle) {
  const color = st.color;
  const base = [1, 3, 5].map(i => Number.parseInt(color.slice(i, i + 2), 16)) as [number, number, number];
  const texture = g.texture(`singlet_cotton_${color}`, () => render(256, (u, v) => {
    const rib = 0.5 + 0.5 * Math.cos(u * Math.PI * 64);
    const knit = 0.5 + 0.5 * Math.cos(v * Math.PI * 180);
    const shade = 0.974 + 0.024 * rib + 0.002 * knit;
    return { c: base.map(channel => channel * shade) as [number, number, number], h: rib * 0.14 + knit * 0.012 };
  }, false, 0.45));
  return mat('Singlet rib-knit cotton', texture, { roughness: 0.98 });
}

/**
 * Skin lookups for the sides below the armholes drawn in towards the chest, so they follow the torso rather than the
 * upper arm: a raised arm then leaves the bottom of the armhole smooth instead of dragging it into a fold. The straps
 * keep following the shoulders.
 */
export function chestSkin(b: Body, P: Float32Array): Float32Array {
  const out = Float32Array.from(P), soft = 0.08 * b.L.shoulderX, torsoHeight = b.L.neckY - b.L.hipY;
  for (let i = 0; i < P.length; i += 3) {
    // The straps over the shoulder tops keep following the shoulders; only the sides below are drawn in.
    const t = Math.min(1, Math.max(0, ((P[i + 1] - b.L.hipY) / torsoHeight - 0.6) / 0.12));
    const edge = (0.62 + 0.4 * t * t * (3 - 2 * t)) * b.L.shoulderX;
    const x = Math.abs(P[i]);
    if (x <= edge - soft) continue;
    // A soft clamp: unchanged well inside, easing to the edge beyond it.
    const over = x - (edge - soft);
    out[i] = Math.sign(P[i]) * (edge - soft + soft * Math.tanh(over / soft));
  }
  return out;
}

function buildSinglet(g: GCtx, st: GarmentStyle): GPart[] {
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const cut = cutShell(g.body, g.faceVerts, {
    field: singletCut(g.body),
    offset: (v) => {
      const shoulder = cm(1.1) * clamp01((v.tt - 0.8) / 0.16);
      const armpit = cm(0.8) * clamp01((v.ax / g.body.L.shoulderX - 0.62) / 0.25) *
        clamp01((v.tt - 0.55) / 0.14) * clamp01((0.83 - v.tt) / 0.13);
      return cm(0.45) + shoulder + armpit;
    },
    tile: 0.15, relax: 5, edgeLoops: true, edgeSmooth: 6,
  });
  if (!cut) return [];
  const bindings = (cut.edgeLoops ?? []).filter(loop => loop.length > 8).map(loop => cord(loop, cm(0.16), true, 6));
  const bindingMesh = bindings.length ? merge(bindings) : null;
  return [
    { mesh: cut.mesh, material: ribFabric(g, st), hides: cut.covered, smooth: true, skinAt: chestSkin(g.body, cut.mesh.positions) },
    ...(bindingMesh ? [{ mesh: bindingMesh, material: mat('Singlet sewn bindings', null, { color: st.color, roughness: 0.95 }), skinAt: chestSkin(g.body, bindingMesh.positions) }] : []),
  ];
}

export const SINGLET: GarmentDef = {
  id: 'singlet', label: 'Men’s ribbed singlet', slot: 'top', patterns: ['rib'], color: '#f7f7f4', color2: '#e9e9e6', build: buildSinglet,
};
