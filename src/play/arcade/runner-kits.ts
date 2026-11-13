/**
 * Runner themes as kits: the floor and its texture, what lies below the gaps, the shape of each obstacle, the props
 * that line the course, arches overhead, the sky and its distant silhouette, and drifting particles. Obstacle shapes
 * keep to the simulation's sizes: low barriers are jumped, bars are slid under, blockers and carts fill a lane.
 */
import * as T from 'three';
import type { RunnerTheme } from './modes';
import { box, cyl, painted, rng, type Horizon, type Part } from './scenery';
import { minibusGeometry, tricycleGeometry, umbrellaGeometry } from './market';
import type { Particles } from './weather';
import * as P from './props';

type Geo = () => T.BufferGeometry;
export interface Decor {
  geo: Geo; every: number; offset: number;
  /** Random scale range, and optional separate height range. */
  scale?: [number, number]; height?: [number, number];
  /** A lamp glow this high above the prop, on every other prop at night. */
  lamp?: number; spin?: 'face' | 'random'; colors?: string[]; start?: number;
  /** Centred over the path instead of one each side; glowing props light themselves. */
  centre?: boolean; glow?: boolean;
  /** A plain box drawn with lit windows instead of painted colours. */
  windows?: boolean;
}
export interface RunnerKit {
  sky: string; zenith: string; fog: [number, number]; silhouette: Horizon; tint: string; night?: boolean;
  floor: [string, string]; paintFloor?: (c: CanvasRenderingContext2D) => void; glowFloor?: (c: CanvasRenderingContext2D) => void; floorRough?: number;
  edge: string; below: { color: string; y: number; kind: 'ground' | 'water' | 'lava' };
  low: Geo; bar: (width: number) => T.BufferGeometry; blocker: Geo; cart: Geo;
  /** Loose wheels drawn beside plain carts, at these offsets from the cart's front. */
  wheels?: [number, number][]; cartLength?: number;
  decor: Decor[]; side?: { color: string; width: number; offset: number; top: number }; arch?: { geo: (width: number) => T.BufferGeometry; every: number };
  particles?: Particles; umbrellas?: boolean;
  /** How much props glow in their own colour at night; dark themes keep their shadows. */
  nightGlow?: number;
  /** Extra light on the course for themes that are always dark. */
  fill?: number;
}

const LANE_W = 1.65;
/** A lintel on two posts across the whole path, 1.2 m clear underneath. */
const lintel = (post: string, beam: string) => (width: number) => painted([[box(width, 0.32, 0.32, 0, 1.38, 0), beam], ...[-1, 1].map((s) => [box(0.22, 1.5, 0.22, (s * (width - 0.2)) / 2, 0.75, 0), post] as Part)]);
const slab = (color: string, top = color) => () => painted([[box(LANE_W, 0.62, 0.5, 0, 0.31, 0), color], [box(LANE_W, 0.08, 0.5, 0, 0.66, 0), top]]);
const block = (color: string, cap = color) => () => painted([[box(LANE_W * 0.98, 2.4, 1.4, 0, 1.2, 0), color], [box(LANE_W, 0.2, 1.42, 0, 2.5, 0), cap]]);
const plainCart = (body: string) => () => painted([[box(1.4, 1.15, 2.2, 0, 0.85, 0), body], [box(1.3, 0.12, 2.0, 0, 1.45, 0), '#3a2a1a']]);
const random = (seed: number) => rng(seed);

const stones = (base: string, line: string) => (c: CanvasRenderingContext2D) => {
  const r = random(3);c.fillStyle = base;c.fillRect(0, 0, 128, 128);c.strokeStyle = line;c.lineWidth = 2;
  for (let y = 0; y < 128; y += 32) { c.beginPath();c.moveTo(0, y);c.lineTo(128, y);c.stroke();for (let x = (y / 32) % 2 ? 16 : 0; x < 128; x += 32) { c.beginPath();c.moveTo(x, y);c.lineTo(x, y + 32);c.stroke(); } }
  for (let i = 0; i < 600; i++) { c.fillStyle = `rgba(0,0,0,${r() * 0.12})`;c.fillRect(r() * 128, r() * 128, 2, 2); }
};
const speckle = (base: string, dot: string, n = 900) => (c: CanvasRenderingContext2D) => { const r = random(5);c.fillStyle = base;c.fillRect(0, 0, 128, 128);for (let i = 0; i < n; i++) { c.fillStyle = dot;c.globalAlpha = 0.15 + r() * 0.35;c.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); } c.globalAlpha = 1; };
/** Lane rails on gravel: u runs across the path (6.6 m), so each rail sits at its lane's offset. */
const rails = (c: CanvasRenderingContext2D) => {
  speckle('#6b655c', '#3d3833', 1600)(c);
  for (let v = 4; v < 128; v += 21) { c.fillStyle = '#5a4433';c.fillRect(0, v, 128, 7); }
  for (const lane of [-1, 0, 1]) for (const k of [-1, 1]) { const u = ((3.3 + lane * 1.8 + k * 0.6) / 6.6) * 128;c.fillStyle = '#9aa0a6';c.fillRect(u - 2, 0, 4, 128);c.fillStyle = '#d4d9de';c.fillRect(u - 1, 0, 1.5, 128); }
};
const planks = (c: CanvasRenderingContext2D) => { const r = random(9);for (let v = 0; v < 128; v += 16) { c.fillStyle = ['#b98c5a', '#a97c4c', '#c49764'][Math.floor(r() * 3)];c.fillRect(0, v, 128, 15);c.fillStyle = '#6e4e30';c.fillRect(0, v + 15, 128, 1);for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(80,50,25,0.25)';c.fillRect(r() * 128, v + 3 + r() * 9, 18 + r() * 30, 1); } } };
const neonRoof = (c: CanvasRenderingContext2D) => { speckle('#5a6074', '#747b90', 700)(c);c.fillStyle = '#41465a';for (const lane of [-1, 1]) c.fillRect(((3.3 + lane * 0.9) / 6.6) * 128 - 1, 0, 2, 128); };
const neonLines = (c: CanvasRenderingContext2D) => { c.fillStyle = '#000';c.fillRect(0, 0, 128, 128);for (const [lane, color] of [[-1.5, '#ff3fa4'], [1.5, '#3ff0ff']] as const) { c.fillStyle = color;c.fillRect(((3.3 + lane * 1.8) / 6.6) * 128 - 1.5, 0, 3, 128); } };
const basalt = (c: CanvasRenderingContext2D) => { speckle('#2c2624', '#463b36', 900)(c);c.strokeStyle = '#1c1715';c.lineWidth = 2;const r = random(4);for (let i = 0; i < 14; i++) { c.beginPath();c.moveTo(r() * 128, r() * 128);c.lineTo(r() * 128, r() * 128);c.stroke(); } };
const cracks = (c: CanvasRenderingContext2D) => { c.fillStyle = '#000';c.fillRect(0, 0, 128, 128);c.strokeStyle = '#ff6a1c';c.lineWidth = 1.5;const r = random(4);for (let i = 0; i < 8; i++) { c.beginPath();let x = r() * 128, y = r() * 128;c.moveTo(x, y);for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 40;y += (r() - 0.5) * 40;c.lineTo(x, y); } c.stroke(); } };
const leafPath = (c: CanvasRenderingContext2D) => { speckle('#4a3f33', '#2e2620', 1200)(c);const r = random(6);for (let i = 0; i < 70; i++) { c.fillStyle = ['#6b4a26', '#8a5a2a', '#5a3f22'][i % 3];c.beginPath();c.ellipse(r() * 128, r() * 128, 3, 1.5, r() * 3, 0, Math.PI * 2);c.fill(); } };
const snowPack = (c: CanvasRenderingContext2D) => { speckle('#e8eff5', '#bcd0e0', 1400)(c);c.fillStyle = 'rgba(160,190,215,0.35)';for (const lane of [-1, 0, 1]) c.fillRect(((3.3 + lane * 1.8) / 6.6) * 128 - 6, 0, 12, 128); };
const mossStone = (c: CanvasRenderingContext2D) => { stones('#8d8a74', '#5d5a48')(c);const r = random(8);for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(70,120,50,0.5)';c.beginPath();c.ellipse(r() * 128, r() * 128, 6 + r() * 8, 3 + r() * 4, r() * 3, 0, Math.PI * 2);c.fill(); } };

export const RUNNER_KITS: Record<RunnerTheme, RunnerKit> = {
  'temple-ruins': {
    sky: '#a7bea6', zenith: '#6a9ac4', fog: [35, 160], silhouette: 'canopy', tint: '#2a4630', floor: ['#ffffff', '#ececec'], paintFloor: stones('#aaa189', '#7d7563'),
    edge: '#6f6a58', below: { color: '#3d5a37', y: -18, kind: 'ground' }, low: slab('#7a6a52', '#8a7c62'), bar: lintel('#8a8370', '#6f6a58'), blocker: block('#8a8370', '#6f6a58'), cart: plainCart('#6b4a2c'),
    wheels: [[-0.75, 0.6], [0.75, 0.6], [-0.75, 1.6], [0.75, 1.6]], decor: [{ geo: () => P.ruinPillar(2), every: 7, offset: 1, scale: [0.9, 1.1] }, { geo: () => P.fern(3), every: 11, offset: 2.6, spin: 'random', scale: [0.8, 1.3] }],
  },
  'city-rooftops': {
    sky: '#bccad6', zenith: '#5d8ccc', fog: [40, 190], silhouette: 'skyline', tint: '#4f5a66', floor: ['#ffffff', '#ececec'], paintFloor: speckle('#80848b', '#5f636a'),
    edge: '#d3cfc5', below: { color: '#4a5562', y: -40, kind: 'ground' }, low: slab('#c0632d', '#e8e2d6'), bar: lintel('#5b4a3a', '#7a6a5a'), blocker: block('#5d6670', '#7a838c'), cart: plainCart('#6b4a2c'),
    wheels: [[-0.75, 0.6], [0.75, 0.6], [-0.75, 1.6], [0.75, 1.6]], decor: [{ geo: () => painted([[box(1.6, 1, 1.6, 0, 0.5, 0), '#b5b7b3'], [cyl(0.5, 0.5, 0.2, 10, 0, 1.1, 0), '#8c8f8a']]), every: 7, offset: 1, height: [0.9, 1.9], lamp: 1.4 }],
  },
  'desert-canyon': {
    sky: '#e6cda3', zenith: '#6f9bd0', fog: [40, 170], silhouette: 'mesas', tint: '#a0663e', floor: ['#ffffff', '#f2ece2'], paintFloor: speckle('#cfa36b', '#a87d4c', 1400),
    edge: '#9b6a42', below: { color: '#8a5a37', y: -18, kind: 'ground' }, low: slab('#7b5532'), bar: lintel('#7b5532', '#5b3e24'), blocker: block('#9a6b47', '#b07b4c'), cart: plainCart('#6b4a2c'),
    wheels: [[-0.75, 0.6], [0.75, 0.6], [-0.75, 1.6], [0.75, 1.6]], decor: [{ geo: () => painted([[box(3.5, 1, 3.5, 0, 0.5, 0), '#a8683f'], [box(3.3, 0.15, 3.3, 0, 1.0, 0), '#b9784c']]), every: 7, offset: 2.2, height: [7, 12] }, { geo: () => P.rock(4, '#a2714a'), every: 13, offset: 5.5, scale: [1, 2.2] }],
  },
  'market-street': {
    sky: '#cfd6d6', zenith: '#6c9ccb', fog: [40, 170], silhouette: 'skyline', tint: '#6a6a66', floor: ['#ffffff', '#eeeeee'], paintFloor: speckle('#7b766f', '#5d5953', 1300),
    edge: '#ddd5c4', below: { color: '#9a8e7c', y: -1.2, kind: 'ground' }, low: P.crates, bar: P.awningBar, blocker: tricycleGeometry, cart: minibusGeometry,
    wheels: [[-0.8, 0.25], [0.8, 0.25], [-0.8, 2.0], [0.8, 2.0]], umbrellas: true, side: { color: '#b5a891', width: 5.2, offset: 2.9, top: -0.01 },
    decor: [{ geo: () => painted([[box(1.5, 0.9, 1.5, 0, 0.45, 0), '#a8835a'], [box(1.4, 0.18, 1.4, 0, 0.99, 0), '#e2582f']]), every: 7, offset: 1.6, lamp: 2.15 }, { geo: () => P.billboard(), every: 63, offset: 6, start: 20, spin: 'face', colors: ['#f2b81c', '#2f9e60', '#d8473d', '#2f78c4'] }],
  },
  'snowy-peaks': {
    sky: '#d6e2ec', zenith: '#5b8fcf', fog: [45, 200], silhouette: 'peaks', tint: '#5f7189', floor: ['#ffffff', '#f1f5f8'], paintFloor: snowPack, floorRough: 0.6,
    edge: '#cfe6f2', below: { color: '#dde8f1', y: -18, kind: 'ground' }, low: P.snowdrift, bar: P.icicleBar, blocker: P.iceBlock, cart: P.giantSnowball, particles: 'snow',
    side: { color: '#eef3f8', width: 4, offset: 2.4, top: 0.2 }, arch: { geo: P.iceArch, every: 46 },
    decor: [{ geo: () => P.pineTree(true, 3), every: 9, offset: 3.4, scale: [0.7, 1.2], spin: 'random' }, { geo: () => P.rock(6, '#7a8494', true), every: 17, offset: 2.2, scale: [0.6, 1.2], spin: 'random' }],
  },
  'beach-boardwalk': {
    sky: '#cbe8f2', zenith: '#2f86d8', fog: [50, 230], silhouette: 'palms', tint: '#3d6a5a', floor: ['#ffffff', '#f3efe8'], paintFloor: planks, floorRough: 0.8,
    edge: '#f3ead8', below: { color: '#2a8fb0', y: -1.4, kind: 'water' }, low: P.coolerBox, bar: P.volleyNet, blocker: P.surfRack, cart: P.iceCreamCart, side: { color: '#b48a5c', width: 9, offset: 5.2, top: 0 },
    decor: [{ geo: () => P.palmTree(4), every: 13, offset: 3.6, scale: [0.8, 1.1], spin: 'random' }, { geo: P.pierPost, every: 6, offset: 0.4, lamp: 3.05 }, { geo: () => P.beachUmbrella('#ffffff'), every: 14, offset: 6.2, start: 7, colors: ['#d8473d', '#2f9fd8', '#f2b81c', '#2f9e60'] }, { geo: () => P.beachHut('#f6d0c4'), every: 47, offset: 6.6, spin: 'face' }],
  },
  'neon-city': {
    sky: '#3a2560', zenith: '#0a0618', fog: [55, 210], silhouette: 'skyline', tint: '#1c1430', night: true, nightGlow: 0.5, fill: 1.6, floor: ['#ffffff', '#e6e6e6'], paintFloor: neonRoof, glowFloor: neonLines, floorRough: 0.3,
    edge: '#7a8196', below: { color: '#1c2236', y: -40, kind: 'ground' }, low: () => painted([[box(LANE_W, 0.62, 0.5, 0, 0.31, 0), '#5a5f70'], [box(LANE_W, 0.1, 0.52, 0, 0.62, 0), '#ff3fa4'], [box(LANE_W, 0.08, 0.52, 0, 0.12, 0), '#ff3fa4']]),
    bar: (w) => painted([[box(w, 0.3, 0.3, 0, 1.4, 0), '#5a5f70'], [box(w, 0.1, 0.32, 0, 1.25, 0), '#3ff0ff'], [box(w, 0.06, 0.32, 0, 1.57, 0), '#3ff0ff'], ...[-1, 1].map((s) => [box(0.22, 1.5, 0.22, (s * (w - 0.2)) / 2, 0.75, 0), '#5a5f70'] as Part)]),
    blocker: () => painted([[box(LANE_W * 0.98, 2.4, 1.4, 0, 1.2, 0), '#565c6e'], [box(LANE_W * 0.7, 0.9, 0.05, 0, 1.6, 0.71), '#9a7cff'], [box(LANE_W, 0.12, 1.42, 0, 2.45, 0), '#ffe23f'], ...[-1, 1].map((s) => [box(0.06, 2.4, 0.06, (s * LANE_W * 0.98) / 2, 1.2, 0.7), '#ffe23f'] as Part)]),
    cart: () => painted([[box(1.5, 1.0, 2.2, 0, 0.75, 0), '#c8372d'], [box(1.3, 0.5, 1.3, 0, 1.45, -0.1), '#3a4a58'], [box(1.52, 0.06, 2.22, 0, 1.22, 0), '#3ff0ff'], [box(0.3, 0.12, 0.05, -0.5, 0.75, 1.11), '#fff4c8'], [box(0.3, 0.12, 0.05, 0.5, 0.75, 1.11), '#fff4c8'], [box(1.52, 0.06, 2.22, 0, 0.3, 0), '#3ff0ff']]),
    decor: [{ geo: () => painted([[box(2.2, 1, 2.2, 0, 0.5, 0), '#3e4352'], [box(2.25, 0.1, 2.25, 0, 0.95, 0), '#ff3fa4']]), every: 7, offset: 1.2, height: [1, 2.5], lamp: 1.3 }, { geo: () => P.neonSign().translate(0, 4.2, 0), every: 21, offset: 2.2, start: 10, spin: 'face', glow: true, colors: ['#ff3fa4', '#3ff0ff', '#ffe23f', '#7a5cff', '#3fff8a'] }, { geo: () => new T.BoxGeometry(4, 1, 4).translate(0, 0.5, 0), every: 9, offset: 6, height: [8, 26], windows: true }],
  },
  'jungle-ruins': {
    sky: '#b9cdb4', zenith: '#6d9fc0', fog: [32, 150], silhouette: 'canopy', tint: '#24452a', floor: ['#ffffff', '#ececec'], paintFloor: mossStone,
    edge: '#6f7a58', below: { color: '#3d6b58', y: -2.4, kind: 'water' }, low: P.mossyLog, bar: P.vineBar, blocker: P.stoneIdol, cart: P.boulder,
    arch: { geo: (w) => painted([...[-1, 1].map((s) => [box(1.4, 6, 1.6, (s * (w + 1.6)) / 2, 3, 0), '#8d8a74'] as Part), [box(w + 3.2, 1.3, 1.8, 0, 6.4, 0), '#7f8a6c'], [box(w + 3.4, 0.4, 1.9, 0, 7.2, 0), '#3f7d36']]), every: 58 },
    decor: [{ geo: () => P.jungleTree(5), every: 11, offset: 4, scale: [0.6, 0.95], spin: 'random' }, { geo: () => P.fern(7), every: 5, offset: 1.4, scale: [0.7, 1.2], spin: 'random' }, { geo: () => P.ruinPillar(9), every: 19, offset: 2.4, scale: [0.8, 1.1] }, { geo: () => P.palmTree(11), every: 23, offset: 6, start: 9, scale: [0.7, 1], spin: 'random' }],
  },
  'train-yard': {
    sky: '#c4ccd2', zenith: '#6a90c0', fog: [45, 200], silhouette: 'skyline', tint: '#59616a', floor: ['#ffffff', '#efefef'], paintFloor: rails, cartLength: 6.5,
    edge: '#d8b23a', below: { color: '#3d3833', y: -1.6, kind: 'ground' }, low: P.bufferStop, bar: P.signalBar, blocker: () => painted([[box(LANE_W * 0.96, 2.5, 1.4, 0, 1.25, 0), '#3d6fa3'], [box(LANE_W * 0.98, 0.2, 1.42, 0, 2.4, 0), '#2a4f78'], [box(0.9, 1.2, 0.05, 0, 1.3, 0.71), '#d8b23a']]), cart: () => P.carriage(6.4),
    side: { color: '#8f8a82', width: 3.2, offset: 2.0, top: 0.9 }, arch: { geo: P.tunnelArch, every: 64 },
    decor: [{ geo: () => P.gantry(9.4), every: 18, offset: 0, centre: true }, { geo: P.platformBench, every: 9, offset: 2.4, spin: 'face' }, { geo: P.streetLamp, every: 16, offset: 3.4, start: 8, spin: 'face', lamp: 5.94 }],
  },
  volcano: {
    sky: '#5a3a34', zenith: '#1e1418', fog: [35, 170], silhouette: 'volcano', tint: '#1c1214', floor: ['#ffffff', '#e8e8e8'], paintFloor: basalt, glowFloor: cracks,
    edge: '#3a2c25', below: { color: '#ff6a1a', y: -2.6, kind: 'lava' }, low: P.magmaVent, bar: P.charredBeam, blocker: () => P.basaltColumn(5), cart: P.fireBoulder, particles: 'embers',
    decor: [{ geo: () => P.basaltColumn(2), every: 7, offset: 1.6, height: [0.6, 1.6], scale: [0.8, 1.2] }, { geo: () => P.lavaRock(3), every: 11, offset: 4, scale: [1, 2.4], spin: 'random' }, { geo: () => P.deadTree(8), every: 29, offset: 3, start: 12, spin: 'random' }],
  },
  'haunted-forest': {
    sky: '#3a4450', zenith: '#0c1018', fog: [18, 110], silhouette: 'pines', tint: '#0e1216', night: true, nightGlow: 0.02, floor: ['#ffffff', '#e4e4e4'], paintFloor: leafPath, particles: 'fireflies',
    edge: '#2a2622', below: { color: '#14181a', y: -18, kind: 'ground' }, low: P.graveRow, bar: P.branchBar, blocker: P.brokenFence, cart: P.hearse,
    decor: [{ geo: () => P.deadTree(4), every: 8, offset: 2.6, scale: [0.9, 1.4], spin: 'random' }, { geo: () => P.tombstone(5), every: 5, offset: 1.1, spin: 'random', scale: [0.8, 1.1] }, { geo: P.graveCross, every: 13, offset: 1.6, spin: 'random' }, { geo: P.lantern, every: 21, offset: 1, lamp: 2.75 }, { geo: () => P.pineTree(false, 7), every: 9, offset: 5.5, scale: [1, 1.6], spin: 'random', colors: ['#1d2a24'] }],
  },
};
export { umbrellaGeometry };
