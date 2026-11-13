/**
 * Props for the arcade terrains, each one geometry with painted vertex colours standing on the ground at its origin
 * and facing +Z. A scene draws every copy of a prop in one batch, so dense forests and busy streets stay cheap.
 */
import * as T from 'three';
import { ball, box, cone, cyl, painted, rng, type Part } from './scenery';

const rot = (g: T.BufferGeometry, x: number, y: number, z: number) => g.rotateX(x).rotateY(y).rotateZ(z);

// ---- Trees and plants ----
/** A pine in three tiers, optionally with snow on each tier. */
export function pineTree(snow = false, seed = 1) {
  const r = rng(seed), green = ['#1f4a33', '#24543a', '#1b4230'][Math.floor(r() * 3)], parts: Part[] = [[cyl(0.18, 0.28, 2.2, 6, 0, 1.1, 0), '#4a3424']];
  [[2.4, 2.6, 2.4], [1.9, 2.3, 3.9], [1.3, 2.0, 5.3]].forEach(([w, h, y]) => { parts.push([cone(w, h, 9, 0, y, 0), green]);if (snow) parts.push([cone(w * 0.72, h * 0.5, 9, 0, y + h * 0.28, 0), '#eef4fa']); });
  if (snow) parts.push([cone(0.5, 0.7, 8, 0, 6.5, 0), '#f4f8fc']);
  return painted(parts);
}
/** A leaning coconut palm with drooping fronds. */
export function palmTree(seed = 1) {
  const r = rng(seed), parts: Part[] = [], lean = 0.18 + r() * 0.2, segments = 7, h = 7 + r() * 2;let x = 0, y = 0;
  for (let i = 0; i < segments; i++) { const len = h / segments, a = lean * (i / segments) * 1.6, g = rot(cyl(0.16 - i * 0.012, 0.2 - i * 0.012, len + 0.05, 7), 0, 0, -a).translate(x + Math.sin(a) * len * 0.5, y + Math.cos(a) * len * 0.5, 0);parts.push([g, i % 2 ? '#8a6a48' : '#7a5c3e']);x += Math.sin(a) * len;y += Math.cos(a) * len; }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + r() * 0.3, frond = box(0.5, 0.05, 2.9, 0, 0, 1.45);frond.rotateX(0.55 + r() * 0.25).rotateY(a).translate(x, y + 0.1, 0);parts.push([frond, k % 2 ? '#2f7d3a' : '#3b8f43']);
  }
  for (let k = 0; k < 3; k++) parts.push([ball(0.17, x + Math.cos(k * 2.1) * 0.25, y - 0.25, Math.sin(k * 2.1) * 0.25), '#5b4022']);
  return painted(parts);
}
/** A tall rainforest tree: buttress trunk and a layered canopy. */
export function jungleTree(seed = 1) {
  const r = rng(seed), h = 9 + r() * 5, parts: Part[] = [[cyl(0.35, 0.6, h, 7, 0, h / 2, 0), '#5a4632']];
  for (let k = 0; k < 4; k++) parts.push([rot(box(0.12, 1.4, 1.3, 0, 0.6, 0.55), 0, (k / 4) * Math.PI * 2 + 0.4, 0), '#4e3d2b']);
  const greens = ['#1f5a2a', '#2a6e31', '#2f7a36', '#235f2c'];
  for (let k = 0; k < 6; k++) { const a = r() * Math.PI * 2, d = 1 + r() * 2.2;parts.push([ball(1.6 + r() * 1.2, Math.cos(a) * d, h - 0.5 + r() * 1.8, Math.sin(a) * d), greens[k % 4]]); }
  parts.push([ball(2.2, 0, h + 1.2, 0), greens[1]]);
  return painted(parts);
}
/** A fern or broad-leaf bush at ground level. */
export function fern(seed = 1, color = '#2e7a35') {
  const r = rng(seed), parts: Part[] = [];
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2 + r() * 0.4, leaf = box(0.42, 0.04, 1.6, 0, 0, 0.8);leaf.rotateX(-0.6 - r() * 0.3).rotateY(a).translate(0, 0.15, 0);parts.push([leaf, k % 2 ? color : '#3d8f3e']); }
  return painted(parts);
}
/** A broad bush made of a few blobs. */
export function bush(color = '#3b6e34', seed = 2) { const r = rng(seed);return painted([[ball(0.9, 0, 0.6, 0), color], [ball(0.7, 0.7 * (r() - 0.3), 0.5, 0.6), color], [ball(0.65, -0.6, 0.45, -0.3), '#46803c']]); }
/** A bare, twisted dead tree. */
export function deadTree(seed = 1) {
  const r = rng(seed), dark = '#2b2420', parts: Part[] = [[cyl(0.14, 0.3, 4.5, 6, 0, 2.25, 0), dark]];
  for (let k = 0; k < 6; k++) { const y = 2 + r() * 2.4, a = r() * Math.PI * 2, len = 1 + r() * 1.6, g = rot(cyl(0.03, 0.08, len, 4, 0, len / 2, 0), 0, 0, 0.7 + r() * 0.5).rotateY(a).translate(0, y, 0);parts.push([g, dark]); }
  return painted(parts);
}
/** A rock or boulder; `snow` caps it. */
export function rock(seed = 1, color = '#7c7a74', snow = false) {
  const g = new T.DodecahedronGeometry(1, 0), p = g.getAttribute('position') as T.BufferAttribute, r = rng(seed);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.9 + r() * 0.3), p.getY(i) * (0.6 + r() * 0.25), p.getZ(i) * (0.9 + r() * 0.3));
  g.translate(0, 0.45, 0);g.computeVertexNormals();
  return painted(snow ? [[g, color], [new T.DodecahedronGeometry(0.75, 0).scale(1, 0.35, 1).translate(0, 0.95, 0), '#f1f5f9']] : [[g, color]]);
}

// ---- Coast ----
export function beachHut(color = '#e4b45c') {
  return painted([[box(3, 2.4, 3, 0, 1.2 + 0.6, 0), color], ...[-1.3, 1.3].flatMap((x) => [-1.3, 1.3].map((z) => [box(0.18, 0.6, 0.18, x, 0.3, z), '#7a5a3a'] as Part)),
    [rot(box(3.8, 0.15, 2.2, 0, 0, 0), 0.5, 0, 0).translate(0, 3.6, 0.85), '#c86a3c'], [rot(box(3.8, 0.15, 2.2, 0, 0, 0), -0.5, 0, 0).translate(0, 3.6, -0.85), '#b85e33'], [box(1, 1.5, 0.08, 0, 1.6, 1.52), '#5a3d28'], [box(0.8, 0.6, 0.06, 0.95, 2.1, 1.52), '#9fd6e8']]);
}
export function lifeguardTower() {
  return painted([...[-0.8, 0.8].flatMap((x) => [-0.8, 0.8].map((z) => [cyl(0.08, 0.08, 2.4, 6, x, 1.2, z), '#f3f0e6'] as Part)), [box(2.2, 0.15, 2.2, 0, 2.45, 0), '#f3f0e6'], [box(2, 1.2, 2, 0, 3.1, 0), '#d8473d'], [box(2.4, 0.15, 2.4, 0, 3.8, 0), '#f3f0e6'], [rot(box(0.5, 0.06, 2.6, 0, 0, 0), 0.75, 0, 0).translate(0, 1.2, 1.6), '#cfc8b4']]);
}
export function surfboard(color = '#2f9fd8') { return painted([[rot(cyl(0.28, 0.28, 2.2, 10, 0, 0, 0), 0, 0, 0).scale(1, 1, 0.18).translate(0, 1.1, 0), color], [box(0.06, 2, 0.06, 0, 1.05, 0.06), '#ffffff']]); }
export function beachUmbrella(color = '#d8473d') { return painted([[cone(1.5, 0.6, 10, 0, 2.4, 0), color], [cyl(0.04, 0.04, 2.4, 6, 0, 1.2, 0), '#f3f0e6'], [box(0.7, 0.1, 1.8, 0.9, 0.05, 0), '#f6e6c2']]); }

// ---- City ----
/** A tower block; its windows come from the material's map. */
export const tower = () => new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
/** A neon sign board on a post, its face lit by an emissive material. */
export function neonSign() { return painted([[box(3.2, 1.3, 0.2, 0, 0, 0), '#ffffff']]); }
export function streetLamp() { return painted([[cyl(0.07, 0.1, 6, 6, 0, 3, 0), '#2d3237'], [box(0.12, 0.12, 1.4, 0, 6, 0.6), '#2d3237'], [box(0.4, 0.12, 0.5, 0, 5.94, 1.2), '#fff2c8']]); }
export function billboard() { return painted([[cyl(0.18, 0.18, 6, 8, 0, 3, 0), '#3a3f45'], [box(6, 3, 0.25, 0, 7, 0), '#ffffff']]); }

// ---- Snow ----
export function iceBlock() { return painted([[box(1.6, 2.6, 1.4, 0, 1.3, 0), '#bfe6f5'], [box(1.62, 0.3, 1.42, 0, 2.5, 0), '#eef8fc'], [box(0.5, 0.8, 1.45, 0.35, 1.0, 0), '#d6f0fa']]); }
export function snowdrift() { return painted([[ball(1, 0, 0, 0, 1).scale(0.95, 0.42, 0.5).translate(0, 0.28, 0), '#f2f6fa'], [ball(0.6, 0.45, 0, 0.1, 1).scale(1, 0.6, 0.6).translate(0, 0.32, 0), '#e4ecf3']]); }
export function giantSnowball() { return painted([[new T.IcosahedronGeometry(1.15, 2).translate(0, 1.15, 0), '#eef4f9']]); }
/** A row of icicles hanging from a frozen beam: slide under it. */
export function icicleBar(width: number) {
  const r = rng(5), parts: Part[] = [[box(width, 0.4, 0.5, 0, 1.6, 0), '#cfeaf5'], ...[-1, 1].map((s) => [box(0.4, 1.8, 0.5, (s * width) / 2, 0.9, 0), '#9fc9dd'] as Part)];
  for (let x = -width / 2 + 0.3; x < width / 2 - 0.2; x += 0.42) { const h = 0.25 + r() * 0.3;parts.push([cone(0.08, h, 5).rotateX(Math.PI).translate(x, 1.4 - h / 2, 0), '#e8f6fc']); }
  return painted(parts);
}
export function iceArch(width: number) {
  const parts: Part[] = [];const segs = 9;
  for (let i = 0; i <= segs; i++) { const a = (i / segs) * Math.PI, x = Math.cos(a) * (width / 2 + 1), y = Math.sin(a) * 5.5;parts.push([box(1.5, 1.5, 2.2, x, y + 0.7, 0), i % 2 ? '#a7d4e8' : '#c4e5f2']); }
  return painted(parts);
}

// ---- Jungle ----
/** Hanging vines across the path from a mossy log: slide under them. */
export function vineBar(width: number) {
  const r = rng(9), parts: Part[] = [[rot(cyl(0.22, 0.25, width + 0.6, 8), 0, 0, Math.PI / 2).translate(0, 1.65, 0), '#5a4632'], ...[-1, 1].map((s) => [cyl(0.2, 0.28, 1.9, 7, (s * width) / 2, 0.95, 0), '#4f3d2b'] as Part)];
  for (let x = -width / 2 + 0.2; x < width / 2; x += 0.35) { const h = 0.2 + r() * 0.35;parts.push([cyl(0.03, 0.03, h, 4, x, 1.55 - h / 2, (r() - 0.5) * 0.2), r() < 0.5 ? '#2f7a36' : '#3f8f3a']); }
  return painted(parts);
}
export function mossyLog() { return painted([[rot(cyl(0.34, 0.36, 1.6, 9), 0, 0, Math.PI / 2).translate(0, 0.34, 0), '#5d4631'], [box(1.0, 0.1, 0.45, 0.1, 0.66, 0), '#3f7d36']]); }
export function stoneIdol() {
  return painted([[box(1.5, 2.6, 1.3, 0, 1.3, 0), '#7f8a6c'], [box(1.1, 0.35, 0.2, 0, 1.85, 0.66), '#5b6650'], [box(0.3, 0.3, 0.2, -0.35, 2.15, 0.66), '#3b4436'], [box(0.3, 0.3, 0.2, 0.35, 2.15, 0.66), '#3b4436'], [box(1.6, 0.3, 1.4, 0, 2.7, 0), '#6a7558'], [box(0.5, 0.9, 0.12, 0.45, 1.0, 0.66), '#3f7d36']]);
}
export function boulder() { return painted([[new T.IcosahedronGeometry(1.1, 1).translate(0, 1.1, 0), '#77705f'], [new T.IcosahedronGeometry(0.5, 0).translate(0.4, 1.8, 0.5), '#5f7f3e']]); }
export function ruinPillar(seed = 1) { const r = rng(seed), h = 3 + r() * 3;return painted([[cyl(0.45, 0.55, h, 10, 0, h / 2, 0), '#9a9580'], [box(1.2, 0.35, 1.2, 0, h + 0.17, 0), '#8a8670'], [box(0.5, h * 0.6, 0.15, 0.3, h * 0.4, 0.45), '#3f7d36']]); }
/** A waterfall face: the moving water comes from its material. */
export const waterfall = (w: number, h: number) => new T.PlaneGeometry(w, h).translate(0, h / 2, 0);

// ---- Train yard ----
/** A commuter carriage that rolls down a lane toward the runner. */
export function carriage(length: number) {
  const body = '#c9ced3', stripe = '#d8473d', glass = '#28323b';
  return painted([[box(1.7, 2.2, length, 0, 1.55, 0), body], [box(1.72, 0.25, length + 0.02, 0, 1.0, 0), stripe], [box(1.73, 0.6, length - 1.2, 0, 2.0, 0), glass], [box(1.4, 0.7, 0.06, 0, 2.0, length / 2 + 0.01), glass], [box(1.5, 0.15, length - 0.4, 0, 2.72, 0), '#9aa1a8'],
    [box(1.4, 0.35, length * 0.9, 0, 0.32, 0), '#2a2c30'], [box(0.3, 0.18, 0.05, -0.5, 0.75, length / 2 + 0.02), '#fff4c8'], [box(0.3, 0.18, 0.05, 0.5, 0.75, length / 2 + 0.02), '#fff4c8'], [box(1.1, 0.12, 0.6, 0, 3.0, 0), '#3a3d42']]);
}
export function platformBench() { return painted([[box(1.6, 0.08, 0.45, 0, 0.45, 0), '#3d6fa3'], [box(1.6, 0.4, 0.06, 0, 0.7, -0.2), '#3d6fa3'], [box(0.08, 0.45, 0.4, -0.7, 0.22, 0), '#3a3d42'], [box(0.08, 0.45, 0.4, 0.7, 0.22, 0), '#3a3d42']]); }
/** A catenary gantry over the tracks. */
export function gantry(width: number) { return painted([...[-1, 1].map((s) => [box(0.25, 5.8, 0.25, (s * width) / 2, 2.9, 0), '#4b5056'] as Part), [box(width + 0.3, 0.3, 0.25, 0, 5.7, 0), '#4b5056'], [box(width, 0.03, 0.03, 0, 5.2, 0), '#1d1f22']]); }
/** Buffer stop: jump over it. */
export function bufferStop() { return painted([[box(1.5, 0.6, 0.45, 0, 0.5, 0), '#d8b23a'], [box(1.5, 0.12, 0.47, 0, 0.62, 0), '#1d1f22'], [box(0.25, 0.3, 0.3, -0.5, 0.65, 0.3), '#2a2c30'], [box(0.25, 0.3, 0.3, 0.5, 0.65, 0.3), '#2a2c30'], [box(1.2, 0.2, 0.9, 0, 0.1, -0.3), '#4b5056']]); }
/** Signal barrier arm across the tracks: slide under. */
export function signalBar(width: number) { return painted([...[-1, 1].map((s) => [box(0.22, 1.9, 0.22, (s * width) / 2, 0.95, 0), '#3a3d42'] as Part), [box(width, 0.28, 0.2, 0, 1.6, 0), '#f1efe8'], ...Array.from({ length: Math.floor(width / 0.8) }, (_, i) => [box(0.4, 0.29, 0.21, -width / 2 + 0.4 + i * 0.8, 1.6, 0), '#d8473d'] as Part), [box(0.3, 0.3, 0.1, (width / 2) - 0.2, 1.95, 0.1), '#ff5a3a']]); }
export function tunnelArch(width: number) { return painted([...[-1, 1].map((s) => [box(1.2, 5, 3, (s * (width + 1.2)) / 2, 2.5, 0), '#6a6660'] as Part), [box(width + 2.4, 1.4, 3, 0, 5.6, 0), '#5c5852'], [box(width + 2.6, 0.3, 3.1, 0, 5, 0), '#d8b23a']]); }

// ---- Volcano ----
export function lavaRock(seed = 3) { return rock(seed, '#3a2f2c'); }
export function basaltColumn(seed = 1) { const r = rng(seed), h = 2 + r() * 4;return painted([[cyl(0.7, 0.8, h, 6, 0, h / 2, 0), '#2d2725'], [cyl(0.72, 0.72, 0.1, 6, 0, h, 0), '#4a3a34']]); }
/** A glowing crack in black rock: jump over it. */
export function magmaVent() { return painted([[box(1.6, 0.55, 0.6, 0, 0.27, 0), '#2a2220'], [box(1.3, 0.1, 0.3, 0, 0.56, 0), '#ff7a1c']]); }
/** A charred beam fallen across the path: slide under. */
export function charredBeam(width: number) { return painted([...[-1, 1].map((s) => [box(0.8, 1.9, 0.9, (s * width) / 2, 0.95, 0), '#2d2725'] as Part), [rot(box(width + 0.6, 0.4, 0.45, 0, 1.62, 0), 0, 0, 0.04), '#3a2c25'], [box(width * 0.4, 0.06, 0.47, 0.6, 1.42, 0), '#ff7a1c']]); }
/** A falling boulder trailing embers, rolling toward the runner. */
export function fireBoulder() { return painted([[new T.IcosahedronGeometry(1.05, 1).translate(0, 1.05, 0), '#3a2a24'], [new T.IcosahedronGeometry(0.6, 0).translate(0.35, 1.4, 0.55), '#ff7a1c'], [new T.IcosahedronGeometry(0.4, 0).translate(-0.4, 0.7, 0.6), '#ffae3c']]); }

// ---- Haunted ----
export function tombstone(seed = 1) { const r = rng(seed), tilt = (r() - 0.5) * 0.25;return painted([[rot(box(0.8, 1.0, 0.2, 0, 0.5, 0), 0, 0, tilt), '#8c8f92'], [rot(cyl(0.4, 0.4, 0.2, 10).rotateX(Math.PI / 2).translate(0, 1.0, 0), 0, 0, tilt), '#8c8f92'], [box(1.0, 0.12, 0.6, 0, 0.06, 0.1), '#4c4a3e']]); }
export function graveCross() { return painted([[box(0.16, 1.4, 0.16, 0, 0.7, 0), '#5b5550'], [box(0.7, 0.16, 0.16, 0, 1.05, 0), '#5b5550']]); }
/** A low row of headstones: jump over it. */
export function graveRow() { return painted([[box(1.5, 0.62, 0.22, 0, 0.31, 0), '#8c8f92'], [cyl(0.35, 0.35, 0.22, 10).rotateX(Math.PI / 2).translate(-0.35, 0.62, 0), '#8c8f92'], [cyl(0.35, 0.35, 0.22, 10).rotateX(Math.PI / 2).translate(0.38, 0.6, 0), '#7f8285']]); }
/** A broken iron fence panel blocking one lane. */
export function brokenFence() { const parts: Part[] = [[box(1.6, 0.1, 0.1, 0, 0.35, 0), '#24262a'], [box(1.6, 0.1, 0.1, 0, 2.0, 0), '#24262a']];for (let x = -0.7; x <= 0.71; x += 0.2) parts.push([box(0.06, 2.4 - Math.abs(x) * 0.5, 0.06, x, 1.2 - Math.abs(x) * 0.25, 0), '#24262a'], [cone(0.07, 0.2, 4, x, 2.45 - Math.abs(x) * 0.5, 0), '#24262a']);parts.push([box(1.5, 2.2, 0.6, 0, 1.1, -0.35), '#3a3330']);return painted(parts); }
/** A crooked branch hung across the path: slide under. */
export function branchBar(width: number) { return painted([...[-1, 1].map((s) => [cyl(0.18, 0.3, 2, 6, (s * width) / 2, 1, 0), '#2b2420'] as Part), [rot(cyl(0.12, 0.18, width + 0.8, 6), 0, 0, Math.PI / 2 + 0.05).translate(0, 1.62, 0), '#2b2420'], ...[-0.8, 0.4, 1.4].map((x) => [rot(cyl(0.03, 0.05, 0.6, 4), 0, 0, 0.6).translate(x, 1.45, 0), '#2b2420'] as Part)]); }
/** A runaway hearse wagon. */
export function hearse() { return painted([[box(1.5, 1.6, 2.6, 0, 1.25, 0), '#1c1a1f'], [box(1.52, 0.5, 2.0, 0, 1.55, 0), '#5b4a7a'], [box(1.55, 0.12, 2.65, 0, 2.1, 0), '#8a7a4a'], [box(1.2, 0.1, 0.5, 0, 0.6, 1.4), '#1c1a1f'], [box(0.25, 0.25, 0.05, -0.5, 1.3, 1.32), '#c8ff9a'], [box(0.25, 0.25, 0.05, 0.5, 1.3, 1.32), '#c8ff9a']]); }
export function lantern() { return painted([[cyl(0.06, 0.08, 2.6, 6, 0, 1.3, 0), '#24262a'], [box(0.32, 0.4, 0.32, 0, 2.75, 0), '#ffcf7a'], [cone(0.26, 0.25, 4, 0, 3.08, 0).rotateY(Math.PI / 4), '#24262a']]); }

// ---- Market and boardwalk ----
/** A low pile of produce crates: jump over it. */
export function crates() { return painted([[box(0.8, 0.5, 0.55, -0.4, 0.25, 0), '#a8763e'], [box(0.8, 0.5, 0.55, 0.42, 0.25, 0), '#9a6b38'], [box(0.7, 0.18, 0.5, -0.4, 0.58, 0), '#e2582f'], [box(0.7, 0.18, 0.5, 0.42, 0.58, 0), '#f2b81c']]); }
/** A low stall awning across the street: slide under. */
export function awningBar(width: number) {
  const parts: Part[] = [...[-1, 1].map((s) => [box(0.12, 1.9, 0.12, (s * width) / 2, 0.95, 0), '#5a4632'] as Part)];
  const stripes = Math.ceil(width / 0.6);for (let i = 0; i < stripes; i++) parts.push([rot(box(width / stripes, 0.06, 1.1, 0, 0, 0), -0.18, 0, 0).translate(-width / 2 + (i + 0.5) * (width / stripes), 1.7, 0), i % 2 ? '#f2f0e8' : '#2f78c4']);
  return painted(parts);
}
/** A volleyball net strung across the boardwalk: slide under. */
export function volleyNet(width: number) { const parts: Part[] = [...[-1, 1].map((s) => [cyl(0.06, 0.06, 2.2, 6, (s * width) / 2, 1.1, 0), '#f3f0e6'] as Part), [box(width, 0.05, 0.05, 0, 1.95, 0), '#f3f0e6'], [box(width, 0.05, 0.05, 0, 1.3, 0), '#f3f0e6']];for (let x = -width / 2 + 0.3; x < width / 2; x += 0.3) parts.push([box(0.02, 0.62, 0.02, x, 1.62, 0), '#e6e1d4']);return painted(parts); }
export function coolerBox() { return painted([[box(1.4, 0.55, 0.6, 0, 0.3, 0), '#2f78c4'], [box(1.42, 0.12, 0.62, 0, 0.6, 0), '#f3f0e6'], [box(0.5, 0.06, 0.1, 0, 0.7, 0), '#f3f0e6']]); }
export function surfRack() { const colors = ['#d8473d', '#2f9fd8', '#f2b81c', '#2f9e60'];return painted([[box(1.6, 0.12, 0.6, 0, 1.0, 0), '#7a5a3a'], [box(0.12, 1, 0.12, -0.7, 0.5, 0), '#7a5a3a'], [box(0.12, 1, 0.12, 0.7, 0.5, 0), '#7a5a3a'], ...colors.map((c, i) => [cyl(0.25, 0.25, 2.5, 8).scale(1, 1, 0.16).translate(-0.6 + i * 0.4, 1.3, 0), c] as Part)]); }
/** An ice-cream cart pushed toward the runner. */
export function iceCreamCart() { return painted([[box(1.5, 1.2, 2.0, 0, 0.95, 0), '#f6d7e3'], [box(1.52, 0.2, 2.02, 0, 0.5, 0), '#e2588a'], [cyl(0.05, 0.05, 1.2, 6, 0, 2.1, 0), '#f3f0e6'], [cone(1.3, 0.5, 10, 0, 2.8, 0), '#7ed0e6'], [box(1.2, 0.3, 0.6, 0, 1.7, 0.4), '#ffffff']]); }
/** A pier lamp post. */
export function pierPost() { return painted([[cyl(0.12, 0.14, 1.2, 6, 0, 0.6, 0), '#6b4e33'], [cyl(0.05, 0.05, 1.8, 6, 0, 2.1, 0), '#f3f0e6'], [ball(0.2, 0, 3.05, 0), '#fff2c8']]); }

// ---- Arena ----
/** A stack of five tyres. */
export function tyreStack(color = '#1d1d1f') { const parts: Part[] = [];for (let i = 0; i < 4; i++) parts.push([new T.TorusGeometry(0.42, 0.18, 6, 12).rotateX(Math.PI / 2).translate(0, 0.18 + i * 0.32, 0), i % 2 ? color : '#1d1d1f']);return painted(parts); }
/** A grandstand bay; the crowd comes from the material map on its tiers. */
export function grandstand(length: number) { const parts: Part[] = [];for (let i = 0; i < 6; i++) parts.push([box(length, 0.55, 1.1, 0, 0.3 + i * 0.55, -i * 1.1), i % 2 ? '#6b7178' : '#5f656c']);parts.push([box(length + 0.4, 0.2, 7.5, 0, 5.4, -2.8), '#d8473d'], [box(0.25, 5.4, 0.25, -length / 2, 2.7, -6), '#4b5056'], [box(0.25, 5.4, 0.25, length / 2, 2.7, -6), '#4b5056']);return painted(parts); }
export function floodlight() { return painted([[cyl(0.18, 0.28, 18, 6, 0, 9, 0), '#5a6066'], [box(3, 1.6, 0.4, 0, 18.5, 0), '#3a3f45'], [box(2.6, 1.2, 0.1, 0, 18.5, 0.22), '#fff8e0']]); }
