/**
 * A gym: rubber flooring, a mirror wall with a dumbbell rack along it, a squat rack, treadmills, weight benches,
 * kettlebells and exercise mats, around an open training floor in the middle for the Fitness clips.
 */
import * as THREE from 'three';
import type {SetBuilder} from '../builder';
import {block,glow,METAL,practical,shell} from './details';

const RUBBER = '#2b2e31', IRON = '#26282c', STEEL = '#aab1b8', ACCENT = '#e4572e';

/** A hex dumbbell lying along X (or upright on a rack), centred at `at`. */
function dumbbell(b: SetBuilder, at: number[], size = 1) {
  const r = .055 * size, half = .15 * size;
  for (const s of [-1, 1]) {
    const head = b.mesh(b.geometry('gym-hex', () => new THREE.CylinderGeometry(1, 1, 1, 6)), b.material(IRON, .8), [at[0] + s * (half - .04 * size), at[1], at[2]], [r, .08 * size, r]);
    head.rotation.z = Math.PI / 2;
  }
  const bar = b.cylinder(.016, half * 2 - .1 * size, [at[0], at[1], at[2]], STEEL);bar.rotation.z = Math.PI / 2;
}
/** A kettlebell standing on the floor. */
function kettlebell(b: SetBuilder, x: number, z: number, color = IRON) {
  b.ball([.105, .095, .105], [x, .095, z], color);
  const handle = b.mesh(b.geometry('gym-handle', () => new THREE.TorusGeometry(1, .2, 6, 18, Math.PI)), b.material(color, .6), [x, .17, z], [.075, .075, .075]);
  handle.castShadow = true;
}
/** A barbell lying across X with its plates, centred at `at` (y is the bar's height). */
function barbell(b: SetBuilder, at: number[], length = 1.8) {
  const bar = b.cylinder(.014, length, at, STEEL);bar.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) {
    const plate = b.cylinder(.2, .05, [at[0] + s * .52, at[1], at[2]], '#1f2023');plate.rotation.z = Math.PI / 2;
    const ring = b.cylinder(.07, .055, [at[0] + s * .52, at[1], at[2]], '#35383d');ring.rotation.z = Math.PI / 2;
  }
}
/** A flat weight bench along Z, with a seat registered on its pad. */
function weightBench(b: SetBuilder, x: number, z: number, yaw = 0) {
  b.at(x, z, yaw, () => {
    block(b, [.3, .1, 1.2], [x, .46, z], '#1d1f22');
    for (const dz of [-.45, .45]) { block(b, [.05, .4, .05], [x, .21, z + dz], METAL);block(b, [.45, .04, .06], [x, .02, z + dz], METAL); }
    b.seat(x, .51, z + .25);
  });
}
/** A treadmill facing +Z: deck and belt, side rails and a console. */
function treadmill(b: SetBuilder, x: number, z: number) {
  block(b, [.82, .18, 1.9], [x, .09, z], '#2a2c30');block(b, [.55, .012, 1.65], [x, .186, z - .05], '#151617');
  for (const s of [-1, 1]) {
    const post = b.cylinder(.03, 1.15, [x + s * .36, .72, z + .78], METAL);post.rotation.x = -.12;
    block(b, [.04, .04, .55], [x + s * .38, 1.0, z + .55], METAL);
  }
  block(b, [.74, .26, .1], [x, 1.32, z + .86], '#24262a').rotation.x = -.45;
  glow(b, [.42, .12, .01], [x, 1.34, z + .8], '#6fc3d9', .9).rotation.x = -.45;
}
/** A power rack: four uprights, hooks and a loaded barbell racked at shoulder height. */
function squatRack(b: SetBuilder, x: number, z: number) {
  for (const dx of [-.6, .6]) for (const dz of [-.6, .6]) block(b, [.075, 2.3, .075], [x + dx, 1.15, z + dz], '#3a3d42');
  for (const dz of [-.6, .6]) block(b, [1.28, .075, .075], [x, 2.26, z + dz], '#3a3d42');
  for (const dx of [-.6, .6]) { block(b, [.075, .075, 1.28], [x + dx, 2.26, z], '#3a3d42');block(b, [.08, .06, .14], [x + dx, 1.36, z + .66], ACCENT); }
  block(b, [1.4, .02, 1.4], [x, .01, z], '#24262a');
  barbell(b, [x, 1.42, z + .68], 2.1);
}

export function gym(b: SetBuilder) {
  shell(b, '#bfc2bf', RUBBER);
  // Rubber tiles in a darker grid, and an accent stripe round the training floor.
  for (let i = -5; i <= 5; i++) { block(b, [12, .004, .02], [0, .002, i], '#25282b');block(b, [.02, .004, 11], [i, .002, 0], '#25282b'); }
  for (const [size, pos] of [[[4.4, .006, .06], [0, .004, -1.3]], [[4.4, .006, .06], [0, .004, 3.3]], [[.06, .006, 4.6], [-2.2, .004, 1]], [[.06, .006, 4.6], [2.2, .004, 1]]] as number[][][]) block(b, size, pos, ACCENT);
  // The mirror wall, its frame and the dumbbell rack along it.
  const mirror = b.wall(7.6, 2, [0, 1.55, -5.47], '#a9b6bd');mirror.material = b.material('#a9b6bd', .08, .85, .05);
  block(b, [7.7, .05, .04], [0, 2.56, -5.45], METAL);block(b, [7.7, .05, .04], [0, .54, -5.45], METAL);
  b.label('TRAIN · RECOVER · REPEAT', [0, 3.2, -5.45], 3.6, '#f2f2ef', ACCENT);
  for (const dz of [-.12, .18]) block(b, [5, .05, .22], [0, dz < 0 ? .78 : .5, -4.95 + dz], '#3a3d42');
  for (const dx of [-2.4, 0, 2.4]) block(b, [.06, .8, .5], [dx, .4, -4.92], '#3a3d42');
  for (let i = 0; i < 9; i++) { const x = -2.2 + i * .55, size = .75 + i * .06;dumbbell(b, [x, .84 + .055 * size, -5.07], size * .8);dumbbell(b, [x, .56 + .055 * size, -4.77], size * .8); }
  // Squat rack on the left with a bench in front of it; the open floor beside them is for deadlifts.
  squatRack(b, -4.4, -3.4);weightBench(b, -4.4, -.6);
  // Treadmills along the right wall, facing the room.
  for (const z of [-3.4, -1, 1.4]) treadmill(b, 4.9, z);
  // Kettlebells lined up by the left wall, a second bench and rolled-out mats on the training floor.
  [.08, .26, .44, .62, .8].forEach((dz, i) => kettlebell(b, -5.6, 2.6 + dz * 2.2, i % 2 ? ACCENT : IRON));
  weightBench(b, 3.2, 3.6, Math.PI / 2);
  for (const x of [-1.2, 0, 1.2]) block(b, [.62, .012, 1.8], [x, .007, .1], '#2f4b6b');
  for (const z of [4.2, 4.5]) { const roll = b.cylinder(.08, .62, [-3.4, .08, z], '#2f4b6b');roll.rotation.z = Math.PI / 2; }
  // A water cooler and towels by the door.
  b.cylinder(.16, .95, [5.5, .48, 4.6], '#d9dcdc');b.cylinder(.13, .4, [5.5, 1.15, 4.6], '#8fc1dc');
  for (const [z, c] of [[3.9, '#f2f2ef'], [4.15, ACCENT]] as const) block(b, [.3, .08, .22], [5.55, .9, z], c);
  for (const x of [-3, 0, 3]) { glow(b, [2.2, .04, .25], [x, 4.12, -1], '#f4f1e8', 1.3);glow(b, [2.2, .04, .25], [x, 4.12, 2.5], '#f4f1e8', 1.3); }
  practical(b, '#fff3e0', [0, 3.6, 0], 9, 12);
}
