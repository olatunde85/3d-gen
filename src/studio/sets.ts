/** Lazy set recipes share original geometry and release resources when the location changes. */
import * as THREE from 'three';
import { sceneById,isOutdoorScene, type SetId, type SceneDefinition } from './catalog';
import {extendOutdoor} from './sets/outdoor-extension';
import {STORY_SETS} from './sets/story';
import { SetBuilder, type Seat } from './sets/builder';
import { createOriginalSet } from './sets/original';
export interface StudioSet { group: THREE.Group; background: string; floor: string; key: string; fill: string; exposure: number; seats: Seat[] }
export type { Seat };
const HALF_TURN = Math.PI, LEFT = Math.PI / 2, RIGHT = -Math.PI / 2;
function office(b: SetBuilder, s: SceneDefinition) {
  const { id } = s, night = s.mood === 'night';
  b.room(night ? '#404850' : id === 'classroom' ? '#d3cdbd' : '#c5c1b6', '#aaa596', id === 'classroom' || id === 'newsroom' || id === 'boardroom' ? [-4.2, 4.2] : [-4, 3]);
  if (id === 'classroom') {
    // Pupils face the board; the teacher's desk faces the class.
    b.whiteboard(0, -5.42, 3.8, ['Today: Forces & Motion', 'F = m × a', 'push · pull · gravity · friction', 'Homework: page 42, questions 1–5']);
    b.clock(0, 3.2, -5.44);
    b.table(-3.5, -3.9, '#7a5f45', 1.6, 0.8); b.chair(-3.5, -4.6, '#3e4a52');
    b.box([0.34, 0.02, 0.24], [-3.2, 0.8, -3.85], '#2f3336'); const lid = b.box([0.34, 0.22, 0.015], [-3.2, 0.91, -3.97], '#2f3336'); lid.rotation.x = -0.25;
    for (let i = 0; i < 3; i++) b.box([0.26, 0.04, 0.2], [-4.0, 0.82 + i * 0.045, -3.85], ['#b0583f', '#41698a', '#d1b25b'][i]);
    b.cylinder(0.05, 0.1, [-2.95, 0.85, -3.6], '#b93f35');
    for (const x of [-3.8, -2.3, 2.3, 3.8]) for (const z of [-1.9, 0, 1.9]) {
      b.table(x, z, '#c4a574', 1.1, 0.6, 0.72); b.chair(x, z + 0.62, '#3f6f8f', HALF_TURN);
      b.box([0.3, 0.015, 0.22], [x - 0.15, 0.77, z + 0.08], '#ece6d6'); b.box([0.012, 0.012, 0.15], [x + 0.08, 0.775, z + 0.08], '#2b4fa3');
    }
    b.bookshelf(-5.75, -1, 2.4, 1.4, LEFT); b.art(5.95, 1.9, -2.5, 1.3, 0.9, 3, RIGHT); b.art(5.95, 1.9, 0.5, 1.0, 1.3, 5, RIGHT);
  } else if (id === 'boardroom') {
    b.table(0, -3.4, '#765941', 5.4, 1.3); b.rug(0, -3.4, 7, 3.2, '#4b4e52', '#3a3c40');
    for (const x of [-2, -0.7, 0.7, 2]) { b.chair(x, -4.3, '#555d65'); b.plate(x, 0.76, -3.75); }
    for (const x of [-1.4, 1.4]) { b.chair(x, -2.5, '#555d65', HALF_TURN); b.plate(x, 0.76, -3.05); }
    b.chair(-3.05, -3.4, '#555d65', LEFT); b.chair(3.05, -3.4, '#555d65', RIGHT);
    b.screen(0, 2.15, -5.42, 2.3, '#294f68'); b.label('A NEW DIRECTION', [0, 2.2, -5.36], 1.9, '#e6eef2', '#294f68');
    for (const x of [-1.6, 0, 1.6]) b.pendant(x, -3.4, 2.5);
  } else if (id === 'recording-studio') {
    for (let i = -4; i <= 4; i++) b.box([0.6, 2.4, 0.15], [i * 0.8, 2, -5.25], i % 2 ? '#4a4545' : '#6b5950');
    b.table(0, -3.6, '#30383e', 4, 1.1); for (const x of [-2.7, 2.7]) { b.box([0.7, 1.1, 0.55], [x, 1.2, -4.5], '#252c30'); b.ball([0.23, 0.23, 0.08], [x, 1.2, -4.2], '#7e8d89'); }
    for (let i = -6; i <= 6; i++) b.box([0.06, 0.025, 0.35], [i * 0.22, 0.81, -3.6], '#aab2b1');
    b.screen(-1.2, 1.15, -3.95, 0.7, '#4b6b5a'); b.screen(1.2, 1.15, -3.95, 0.7, '#4b6b5a');
    b.chair(0, -2.8, '#2f3438', HALF_TURN); b.rug(0, -2.6, 5, 3, '#5a4c47', '#433834');
    b.cylinder(0.12, 0.02, [3.6, 0.01, -1.2], '#2f3438'); b.cylinder(0.015, 1.55, [3.6, 0.78, -1.2], '#3c4246'); b.cylinder(0.05, 0.16, [3.6, 1.62, -1.15], '#59605f');
  } else if (id === 'laboratory') {
    for (const x of [-3.3, 3.3]) { b.table(x, -2, '#d4dedd', 2.1, 1, 0.9); for (let i = 0; i < 4; i++) b.cylinder(0.08, 0.25 + i * 0.06, [x - 0.6 + i * 0.35, 1.06, -2.1], i % 2 ? '#85b7c3' : '#adbdc2');
      b.stool(x - 0.5, -1.2, 0.68, '#3f4a50', Math.PI); b.stool(x + 0.5, -1.2, 0.68, '#3f4a50', Math.PI); b.screen(x + 0.7, 1.25, -2.35, 0.5, '#4f8d9b'); }
    b.box([2.6, 2.2, 0.8], [0, 1.1, -5.05], '#c9d2d2'); b.box([2.2, 1.0, 0.05], [0, 1.45, -4.64], '#9fc3c9', 0.15); b.label('RESEARCH LAB', [0, 2.9, -5.3], 2.5);
    b.whiteboard(-3.8, -5.42, 2, ['H₂O → H₂ + ½O₂', 'trial 3: pH 7.2']);
  } else if (id === 'newsroom') {
    // A wall of broadcast screens, an anchor desk and the team's workstations.
    const feeds = [['#2d5f7f', 'MARKETS ▲ 2.4%'], ['#8a3a36', 'BREAKING NEWS'], ['#2f6b55', 'WEATHER · 31°'], ['#5e5379', 'LIVE · CITY HALL'], ['#7a6234', 'SPORT · 2–1'], ['#2d5f7f', 'TRAFFIC · CLEAR']];
    feeds.forEach(([p, caption], i) => b.screen(-1.25 + (i % 3) * 1.25, 1.55 + Math.floor(i / 3) * 0.76, -5.42, 1.15, p, 0, 0.75, caption));
    b.label('ARA NEWS', [0, 3.25, -5.35], 2.6, '#e5f3f3', '#284c66');
    b.table(2.6, -3.4, '#577783', 2.6, 1.1, 1); for (const x of [2, 3.2]) b.chair(x, -4.1, '#2f3c45');
    b.workstation(-3.6, -3, 0, '#637e8b'); b.workstation(-3.6, 0.6, 0, '#637e8b');
  } else {
    const coworking = id === 'coworking', open = id === 'open-office' || coworking;
    if (open) {
      for (const [x, z] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 0.4], [3.6, 0.4]]) { b.workstation(x, z, 0, coworking ? '#b39a77' : '#86694d', coworking ? '#7a8c74' : '#4f5a60'); if (coworking) b.pendant(x, z, 2.4); }
      if (coworking) { b.sofa(0, -4.6, '#8c7a62'); b.table(0, -3.4, '#a48e6d', 1.2, 0.6, 0.42); b.rug(0, -3.8, 3.6, 2.4, '#b8a58a'); }
      else { b.box([0.6, 1.0, 0.5], [0, 0.5, -5.1], '#d6d6cf'); b.box([0.32, 1.3, 0.32], [1.2, 0.65, -5.2], '#c7d3d8'); b.whiteboard(-0.8, -5.42, 1.6, ['Sprint 14', '✓ launch  · review']); }
    } else {
      // Executive office: the desk faces the room; visitors face the desk.
      b.workstation(-2.6, -3.6, 0, '#6b4b33', '#2f2a28', '#4f7286'); b.chair(-3.2, -2.3, '#7a6a58', HALF_TURN); b.chair(-2.0, -2.3, '#7a6a58', HALF_TURN);
      b.rug(-2.6, -3, 3.6, 2.8, '#7b6a5a', '#5d4f42'); b.bookshelf(5.75, -2.5, 2.4, 2.2, RIGHT);
      b.sofa(3.0, -4.6, '#63736f'); b.table(3.0, -3.4, '#a48e6d', 1.2, 0.6, 0.42); b.art(-5.95, 2, -2.5, 1.4, 1, 7, LEFT); b.lamp(4.6, -4.7);
    }
    b.clock(id === 'open-office' ? 2.2 : 0.4, 2.9, -5.44);
  }
  b.plant(-4.7, -4.6, 1.7); b.plant(4.7, -4.6, 1.5);
}
function bedroom(b: SetBuilder, s: SceneDefinition) {
  const night = s.mood === 'night';
  b.room(night ? '#82756e' : '#c7b9a5', '#aa9479', [3]);
  b.box([2.1, 0.35, 2.7], [-2.8, 0.2, -2.3], '#7d695a'); b.box([2.05, 0.25, 2.65], [-2.8, 0.49, -2.3], '#e5ded0');
  b.box([2.04, 0.09, 1.85], [-2.8, 0.65, -1.9], night ? '#71808a' : '#aeb7a5'); b.box([2.2, 1.3, 0.12], [-2.8, 0.65, -3.8], '#867a6c');
  for (const x of [-3.3, -2.3]) b.box([0.75, 0.18, 0.48], [x, 0.73, -3.25], '#eee6d5');
  for (const x of [-4.3, -1.3]) { b.box([0.6, 0.52, 0.5], [x, 0.26, -3.3], '#9e8b72'); b.lamp(x, -3.3, 1.04); }
  b.art(-2.8, 2.2, -5.44, 1.5, 0.75, 11); b.rug(-2.2, -1.2, 3.2, 2, night ? '#6f6a73' : '#c0b2a0', '#8f8070');
  b.box([1.6, 1.0, 0.55], [3, 0.5, -5.1], '#a3957c'); b.box([0.9, 1.1, 0.03], [3, 1.7, -5.36], night ? '#4d5b66' : '#b9cbd0', 0.1, 0.4);
  b.armchair(4.2, -2.0, '#8c7f72', -0.7); b.plant(5.2, -4.5);
}
function lounge(b: SetBuilder, s: SceneDefinition) {
  const loft = s.id === 'apartment-loft';
  b.room(loft ? '#8c7060' : '#c8c2b4', '#aaa08d', s.id === 'living-room' || loft ? [-3.6] : [-4, 3]);
  if (s.id === 'boutique') {
    for (const x of [-3.2, 3.2]) { b.box([2, 0.05, 0.05], [x, 1.85, -3], '#a89679'); for (const dx of [-0.9, 0.9]) b.box([0.045, 1.85, 0.045], [x + dx, 0.92, -3], '#a89679');
      for (let i = 0; i < 5; i++) b.box([0.25, 0.9, 0.3], [x - 0.6 + i * 0.3, 1.25, -3], ['#a19580', '#77867c', '#b79477'][i % 3]); }
    b.label('ATELIER', [0, 2.9, -5.3], 2.2); b.table(-3.4, 1.5, '#c3b79b', 1.7, 1, 0.9);
    for (const x of [-1, 1]) { b.cylinder(0.35, 0.6, [x, 0.3, -4.4], '#e2ddd0'); b.box([0.32, 0.24, 0.12], [x, 0.74, -4.4], x < 0 ? '#8b5e45' : '#d0b07a'); }
    b.box([0.9, 2, 0.04], [5.9, 1.1, -1], '#c4d2d6', 0.05, 0.6).rotation.y = RIGHT; b.rug(0, -1, 4, 3, '#d2c6b2');
  } else if (s.id === 'home-library') {
    for (const x of [-3.4, 3.4]) b.bookshelf(x, -5.25, 2.6, 3);
    b.armchair(-1.4, -3.4, '#84735d', 0.6); b.armchair(1.4, -3.4, '#84735d', -0.6); b.table(0, -3.9, '#6b5440', 0.6, 0.6, 0.55); b.lamp(0.2, -4.6, 1.5);
    b.rug(0, -3.4, 4.4, 2.8, '#8a4f42', '#5f3a32'); b.bookshelf(-5.75, -1.5, 2.4, 2.4, LEFT);
  } else if (s.id === 'hotel-lobby') {
    b.box([4.5, 1.1, 0.7], [0, 0.55, -4.9], '#aa997c'); b.box([4.7, 0.06, 0.85], [0, 1.13, -4.85], '#e5e0d5', 0.2); b.label('WELCOME', [0, 2.5, -5.3], 2.2);
    for (const side of [-1, 1]) { const x = side * 3.6;
      b.rug(x, -2.4, 3.4, 3, '#b8a98d'); b.table(x, -2.2, '#6b5440', 1.1, 0.6, 0.42); b.sofa(x, -3.4, side < 0 ? '#a3947a' : '#7d8a86');
      b.armchair(x - 1.5, -1.9, '#8e7e66', LEFT); b.armchair(x + 1.5, -1.9, '#8e7e66', RIGHT); }
    for (const x of [-2.6, 2.6]) b.pendant(x, -4, 2.6, '#f0dcb0');
  } else {
    // Living room: the sofa and armchair face the TV; the camera looks over the sofa.
    b.tv(2.6, -5.0, 0, loft ? '#3d5a7a' : '#41708a'); b.art(-0.4, 1.9, -5.44, 1.2, 0.8, loft ? 13 : 2);
    b.sofa(2.6, -2.3, loft ? '#6c5b52' : '#697b75', HALF_TURN); b.table(2.6, -3.55, '#a48e6d', 1.2, 0.6, 0.42); b.plate(2.4, 0.42, -3.5);
    b.armchair(-0.9, -3.9, '#8e7e66', 1.9); b.rug(2, -3.3, 5, 3.4, loft ? '#7c6656' : '#b59f86');
    b.bookshelf(-5.75, -2, 2.4, 2.2, LEFT); b.lamp(-4.4, -4.6); b.box([0.5, 0.5, 0.5], [4.1, 0.25, -2.3], '#6b5440'); b.lamp(4.1, -2.3, 0.95);
    if (loft) { for (const x of [-2, 2]) b.pendant(x, -2.5, 2.6); b.skyline(); }
  }
  b.plant(5.2, -4.6, 1.8);
}
function kitchen(b: SetBuilder) {
  b.room('#d9d5c9', '#bab7a7', [0]);
  b.box([9, 0.9, 0.6], [0, 0.45, -4.9], '#768b86'); b.box([9.2, 0.075, 0.8], [0, 0.94, -4.8], '#e0ddcf');
  for (let i = -4; i <= 4; i++) if (Math.abs(i) > 1) { b.box([0.85, 0.75, 0.35], [i, 2.1, -5.2], '#c5c4b6'); b.box([0.24, 0.02, 0.03], [i, 1.96, -4.99], '#555e5c'); }
  b.box([1.0, 2.1, 0.75], [5.2, 1.05, -4.95], '#cfd3d2', 0.3, 0.4); b.box([0.03, 0.8, 0.03], [4.75, 1.3, -4.55], '#7e8586');
  b.box([2.3, 0.9, 1.2], [-3.2, 0.45, -0.9], '#889b91'); b.box([2.5, 0.08, 1.3], [-3.2, 0.94, -0.9], '#dcd8c7');
  for (const x of [-3.9, -3.2, -2.5]) b.stool(x, 0.05, 0.68, '#6f5d4a', Math.PI);
  for (const x of [-3.7, -2.7]) b.pendant(x, -0.9, 2.2);
  b.cylinder(0.16, 0.1, [-3.2, 1.03, -0.9], '#b6875d'); for (let i = 0; i < 4; i++) b.ball([0.06, 0.06, 0.06], [-3.25 + (i % 2) * 0.09, 1.1 + Math.floor(i / 2) * 0.05, -0.92 + (i % 2) * 0.05], ['#c0412f', '#e0b23c', '#7aa040', '#d8692e'][i]);
  b.cylinder(0.25, 0.16, [0.5, 1.04, -4.75], '#67777b'); b.cylinder(0.12, 0.2, [-1, 1.06, -4.7], '#b08766'); b.box([0.6, 0.3, 0.4], [2.4, 1.12, -4.8], '#3a3f42'); b.plant(4.5, -3);
}
function coast(b: SetBuilder, s: SceneDefinition) {
  b.floor(s.family === 'beach' ? '#c9bb9d' : '#c4bcaa');
  if (s.family === 'beach') { b.water(-163.5, 600, 320, s.mood === 'sunset' ? '#8bafad' : '#4a9eaa'); for (const [x, z] of [[-5, -3], [5, -6], [-8, -10], [8, -13]]) b.palm(x, z); b.parasol(-3.5, -1.5, '#dbc7a0'); b.box([0.85, 0.08, 2.1], [-3.7, 0.12, 0.4], '#a5b9b1'); }
  else {
    b.box([11.5, 0.14, 6.5], [0, -0.05, -6.6], '#d8d4c3'); b.water(-6.6, 10.8, 5.8, s.id === 'spa' ? '#88aaa2' : '#54b4bd');
    for (const x of [-5.7, 5.7]) { b.box([0.18, 0.1, 6.5], [x, 0.025, -6.6], '#e5decc'); b.palm(x + (x < 0 ? -1 : 1), -6, 5); }
    for (const x of [-4, 4]) { b.parasol(x, -0.8, s.id === 'spa' ? '#b3b7a3' : '#d6c6a6'); b.box([0.8, 0.15, 1.9], [x, 0.3, 1.2], '#9b8a70'); b.box([0.72, 0.08, 1.75], [x, 0.42, 1.2], '#e2dfd2'); b.seat(x, 0.46, 1.55); b.box([0.55, 0.06, 0.4], [x, 0.5, 0.6], '#c4dbd6'); }
    if (s.id === 'resort-pool') { for (const x of [-7.5, 7.5]) { b.box([2, 3, 8], [x, 1.5, -6.5], '#d8c9ad'); for (const z of [-9, -6, -3]) b.box([0.04, 1.4, 1.5], [x + (x < 0 ? 1.01 : -1.01), 1.9, z], '#688f91'); } }
    if (s.id === 'spa') for (const x of [-7, 7]) for (let i = 0; i < 12; i++) b.box([0.08, 2.5, 0.08], [x, 1.25, -9 + i * 0.55], '#8e8064');
  }
}
function garden(b: SetBuilder, s: SceneDefinition) {
  b.floor(s.id === 'sports-court' ? '#81968a' : s.id === 'veranda' ? '#a18c70' : '#aaa992');
  if (s.id === 'sports-court') {
    const cx=9;b.box([10.4,.018,16.4],[cx,.002,0],'#6f8d80');b.group.userData.courtBounds={minX:cx-5,maxX:cx+5,minZ:-8,maxZ:8};b.plantExclusions.push(b.group.userData.courtBounds);
    for (const x of [-5, 5]) b.box([0.04, 0.02, 16], [cx+x, .02, 0], '#e4dbc3'); for (const z of [-8, 0, 8]) b.box([10, 0.02, 0.04], [cx, .02, z], '#e4dbc3');
    for (const z of [-8, 8]) { b.box([0.12, 3.5, 0.12], [cx, 1.75, z], '#727c79'); b.box([1.6, 0.9, 0.09], [cx, 3.2, z], '#deded0'); const hoop = b.mesh(b.geometry('hoop', () => new THREE.TorusGeometry(0.25, 0.025, 8, 24)), b.material('#a76d43'), [cx, 2.9, z + (z < 0 ? 0.35 : -0.35)]); hoop.rotation.x = Math.PI / 2; }
  } else if (s.id === 'wedding-garden') {
    b.box([0.14, 3, 0.14], [-1.8, 1.5, -3.5], '#e2d8bc'); b.box([0.14, 3, 0.14], [1.8, 1.5, -3.5], '#e2d8bc'); b.box([3.8, 0.16, 0.16], [0, 3, -3.5], '#e2d8bc');
    for (let i = 0; i < 12; i++) b.ball([0.24, 0.18, 0.18], [-1.7 + i * 0.31, 3.05, -3.5], i % 3 ? '#c8c1ab' : '#bb9f9a');
    // Guests face the arch.
    for (const x of [-3.4, -2.6, 2.6, 3.4]) for (const z of [-1, 0.2, 1.4]) b.chair(x, z, '#cfc5b1', Math.PI);
    for (const x of [-1.8, 1.8]) for (let i = 0; i < 3; i++) b.ball([0.3, 0.25, 0.25], [x, 0.25 + i * 0.12, -3.5], i % 2 ? '#c8c1ab' : '#bb9f9a');
    b.box([1.0, 0.01, 6], [0, 0.005, -0.3], '#e8e2d4');
  } else if (s.id === 'veranda') {
    for (const x of [-5, 5]) b.box([0.18, 3.2, 0.18], [x, 1.6, -3], '#d6ccb4'); b.box([10.5, 0.18, 4], [0, 3.3, -3.5], '#b6a88b'); b.armchair(-3.3, -2, '#a09071', 0.4); b.armchair(-1.5, -2, '#a09071', -0.4); b.table(-2.4, -1.4, '#7d6a52', 0.8, 0.6, 0.45); b.plate(-2.4, 0.45, -1.4); for (const x of [-4.5, 4.5]) b.plant(x, -4.2, 1.4);
  } else {
    for (const x of [-3.8, 3.8]) { b.box([1.8, 0.13, 0.5], [x, 0.48, -2], '#8c7b5e'); b.box([1.8, 0.4, 0.08], [x, 0.75, -2.22], '#8c7b5e'); b.seat(x - 0.45, 0.545, -1.98); b.seat(x + 0.45, 0.545, -1.98); for (const dx of [-0.65, 0.65]) b.box([0.12, 0.5, 0.4], [x + dx, 0.25, -2], '#6d7168');
      b.cylinder(0.05, 3.2, [x + 1.4, 1.6, -2.6], '#3c4442'); const glow = b.ball([0.16, 0.16, 0.16], [x + 1.4, 3.25, -2.6], '#f2dfb2'); glow.material = b.material('#f2dfb2', 0.6, 0, 0.8); b.cylinder(0.22, 0.7, [x - 1.3, 0.35, -2.4], '#4f5a52'); }
    b.box([2.8, 0.01, 25], [0, -0.005, -6], '#c9c4ad');
  }
  for (const [x, z] of [[-6, -6], [6, -5], [-9, -12], [9, -10], [0, -16]]) b.tree(x, z, 4.5 + Math.abs(x) * 0.15);
}
function restaurant(b: SetBuilder, s: SceneDefinition) {
  const outdoor = ['street-cafe', 'restaurant-terrace', 'rooftop-bar'].includes(s.id);
  if (outdoor) { b.floor('#b8ad98'); b.wall(16, 4, [0, 2, -6], s.id === 'street-cafe' ? '#b69a7b' : '#8f9389'); b.skyline(-25); }
  else b.room(s.id === 'diner' ? '#bdc2b8' : '#b8a78e', '#a49b89');
  if (s.id === 'dining-room') {
    // One set table for a family: places, a runner and pendant lights.
    b.table(0, -3, '#6f5640', 3.4, 1.15); b.box([2.6, 0.01, 0.35], [0, 0.8, -3], '#b89a6e'); b.rug(0, -3, 5, 3, '#8f6f5a', '#6c5244');
    for (const x of [-1, 0, 1]) { b.chair(x, -3.8, '#5d4c3f'); b.plate(x, 0.78, -3.35); b.chair(x, -2.2, '#5d4c3f', Math.PI); b.plate(x, 0.78, -2.65); b.pendant(x, -3, 2.1); }
    b.chair(-2.0, -3, '#5d4c3f', Math.PI / 2); b.chair(2.0, -3, '#5d4c3f', -Math.PI / 2);
    b.box([2.6, 0.85, 0.5], [0, 0.43, -5.15], '#5f4a38'); b.art(0, 2.75, -5.44, 1.6, 0.9, 17); for (const x of [-0.8, 0.8]) b.cylinder(0.08, 0.3, [x, 1.0, -5.15], '#c9bfa8');
    b.plant(-5, -4.4, 1.7); b.plant(5, -4.4, 1.7); return;
  }
  for (const x of [-3.4, 3.4]) { b.table(x, -2.3, s.id === 'diner' ? '#9caba9' : '#9e8663', 1.4, 0.9); b.chair(x, -3.05, s.id === 'diner' ? '#9a564a' : '#6c7e70'); b.chair(x, -1.45, s.id === 'diner' ? '#9a564a' : '#6c7e70', Math.PI); b.plate(x - 0.2, 0.78, -2.6); b.plate(x + 0.1, 0.78, -2.0); if (!outdoor) b.pendant(x, -2.3, 2.3); }
  if (s.id === 'rooftop-bar' || s.id === 'diner') { b.box([5, 1.1, 0.7], [0, 0.55, -4.7], '#765e49'); b.box([5.2, 0.08, 0.85], [0, 1.14, -4.65], '#b9b7a2'); for (let i = -4; i <= 4; i++) b.cylinder(0.055, 0.25, [i * 0.43, 1.3, -4.7], i % 2 ? '#728d72' : '#b29b72'); }
  if (s.id === 'street-cafe') { b.box([7, 0.1, 1.6], [0, 3.2, -4.8], '#597d76'); b.label('CAFÉ', [0, 2.6, -5.9], 1.9); }
  else if (s.id === 'diner') b.label('OPEN LATE', [0, 2.65, -5.35], 2.2, '#e9c298', '#8f574b');
  for (const x of [-5, 5]) b.plant(x, -4.4, 1.7);
}
function urban(b: SetBuilder, s: SceneDefinition) {
  b.floor(s.family === 'warehouse' ? '#96988e' : '#a5a89e');
  if (s.family === 'transit') {
    b.wall(20, 4, [0, 2, -6], '#a3ada8'); for (const x of [-4.5, 4.5]) { b.box([2.5, 0.15, 0.6], [x, 0.5, -3], '#68777b'); b.box([2.5, 0.5, 0.09], [x, 0.8, -3.25], '#68777b'); for (const dx of [-0.75, 0, 0.75]) b.seat(x + dx, 0.575, -2.95); }
    b.label(s.id === 'airport-lounge' ? 'DEPARTURES  →' : s.id === 'subway' ? 'CENTRAL  ·  PLATFORM 02' : 'NORTHBOUND  ·  PLATFORM 1', [0, 2.65, -5.88], 4);
    if (s.id === 'train-platform') { for (const z of [-7, -8.5]) b.box([60, 0.08, 0.06], [0, 0, z], '#6c7778'); b.box([15, 0.12, 3], [0, 3.7, -3], '#b5b6a4'); b.cylinder(0.03, 0.6, [3.4, 3.35, -3], '#3a3f42'); b.clock(3.4, 2.9, -2.95); }
    else if (s.id === 'airport-lounge') { b.screen(-3.7, 2.4, -5.9, 1.6, '#1f3346', 0, 0.8); b.screen(3.7, 2.4, -5.9, 1.6, '#1f3346', 0, 0.8); for (const x of [-4.5, 4.5]) b.plant(x + (x < 0 ? -1.2 : 1.2), -4.5, 1.6); for (let i = -4; i <= 4; i++) b.box([0.03, 3.5, 0.03], [i * 2, 1.75, -5.9], '#d1d4c7'); }
    else { for (let i = -4; i <= 4; i++) b.box([0.03, 3.5, 0.03], [i * 2, 1.75, -5.9], '#d1d4c7'); }
  } else if (s.family === 'warehouse') {
    for (const x of [-5, 5]) for (const z of [-7, 1, 8]) { b.box([0.45, 4, 0.45], [x, 2, z], '#777f79'); b.box([10.5, 0.3, 0.4], [0, 4, z], '#747c76'); }
    if (s.id === 'warehouse') for (const x of [-3.5, 3.5]) for (let i = 0; i < 4; i++) b.box([1.15, 0.85, 1], [x + i % 2 * 0.1, 0.45 + Math.floor(i / 2) * 0.9, -3.8 + i % 2 * 1.15], i % 2 ? '#a79878' : '#927c58');
    else { for (const x of [-3.3, 3.3]) b.box([0.1, 0.015, 14], [x, 0, 0], '#c4b26e'); b.label('LEVEL 02  ·  EXIT →', [0, 2.6, -6.5], 3.8); }
  } else {
    b.skyline();
    if (s.id === 'alley') { for (const x of [-5, 5]) { b.box([0.3, 6, 18], [x, 3, -5], '#655b58'); b.box([0.04, 0.09, 12], [x + (x < 0 ? 0.2 : -0.2), 2.8, -4], '#ab9096'); } b.wall(12, 5, [0, 2.5, -9], '#69625a'); b.label('NIGHT MARKET', [0, 2.8, -8.9], 3, '#d7b6d5', '#575c78'); }
    else { b.box([20, 0.9, 0.25], [0, 0.45, -7], '#919387'); for (const x of [-3.6, 3.6]) { b.box([1.3, 1.2, 1.4], [x, 0.6, -3.5], '#8f9893'); b.cylinder(0.35, 0.5, [x, 1.45, -3.5], '#7b8580'); }
      b.box([2.2, 2.4, 1.6], [0, 1.2, -5.6], '#8a8a80'); b.box([0.9, 1.9, 0.04], [0, 0.95, -4.79], '#5c5f5c'); }
  }
}
function landscape(b: SetBuilder, s: SceneDefinition) {
  b.floor(s.id === 'desert-outpost' ? '#c1a77e' : '#a4a28a');
  if(s.id==='campsite')b.water(-174,600,320,s.mood==='sunset'?'#8eaaa6':'#6e9fa3');
  if(s.id==='mountain-lake')b.water(-169,600,320,'#7faaa9');
  if (s.id === 'desert-outpost') {
    for (let i = 0; i < 8; i++) b.ball([10, 2.5 + i % 3, 7], [(i - 4) * 8, -0.8, -17 - i % 2 * 7], i % 2 ? '#baa27e' : '#cfb78b');
    for (const x of [-3.6, 3.6]) b.box([0.16, 2.6, 0.16], [x, 1.3, -4], '#9b8462'); b.box([8, 0.08, 3], [0, 2.6, -4.2], '#b7a482'); b.box([1.1, 0.8, 0.8], [3.8, 0.4, -2], '#9a855f');
  } else {
    for (let i = 0; i < 14; i++) {const lake=s.id==='campsite'||s.id==='mountain-lake',shore=s.id==='campsite'?-14:-9;b.tree((i%2?1:-1)*(lake?5+i%4*4:4+i%4*2),lake?shore+4+Math.floor(i/2)%3*4:-5-Math.floor(i/2)*3,4+i%3);}
    if (s.id === 'campsite') {
      for (const [x, z, yaw] of [[3, -1.5, 0], [4.2, -2.5, Math.PI / 2], [1.8, -2.6, Math.PI / 2]] as const) { const log = b.cylinder(0.16, 1.3, [x, 0.16, z], '#6e5a42'); log.rotation.set(0, yaw, Math.PI / 2); }
      b.seat(3, 0.32, -1.5, Math.PI); b.seat(4.2, 0.32, -2.5, -Math.PI / 2); b.seat(1.8, 0.32, -2.6, Math.PI / 2);
      const tent = b.mesh(b.geometry('tent', () => new THREE.ConeGeometry(1.6, 2, 3)), b.material('#ac8a5e'), [-3.6, 1, -2.4]); tent.rotation.y = Math.PI / 6;
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; b.ball([0.18, 0.1, 0.15], [3 + Math.cos(a) * 0.5, 0.1, -2.5 + Math.sin(a) * 0.5], '#79796c'); }
      const fire = b.mesh(b.geometry('fire', () => new THREE.ConeGeometry(0.2, 0.55, 7)), b.material('#ce9257', 0.8, 0, 1.2), [3, 0.3, -2.5]); fire.castShadow = false;
    } else if (s.id === 'mountain-lake') {const mountains=[];for(let i=0;i<7;i++){const radius=28+i%3*8,height=44+i%3*15,x=(i-3)*60,z=-390;mountains.push({minX:x-radius,maxX:x+radius,minZ:z-radius,maxZ:z+radius});b.mesh(b.geometry('mountain',()=>new THREE.ConeGeometry(1,1,7)),b.material(i%2?'#8e9b94':'#abb0a2'),[x,height/2-.02,z],[radius,height,radius]);}b.group.userData.mountainBounds=mountains;}
    else b.box([2.7, 0.015, 36], [0, -0.005, -10], '#b7ad92');
  }
}
function yacht(b: SetBuilder, s: SceneDefinition) {
  b.floor('#ad9875'); b.water(-167.5, 600, 320, '#659da8');
  for (let i = -5; i <= 5; i++) { b.box([0.06, 1, 0.06], [i * 1.5, 0.5, -5], '#b6bdb6', 0.3, 0.7); b.box([1.5, 0.045, 0.045], [i * 1.5, 1, -5], '#c6cbc3', 0.3, 0.7); }
  for (const x of [-3.7, 3.7]) {
    if (s.id === 'harbour') { b.cylinder(0.18, 0.65, [x, 0.33, -2], '#7a7666'); const hull = b.box([1.8, 0.5, 4.5], [x, 0.1, -11], '#d7d6c9'); hull.rotation.y = x * 0.05; b.box([0.8, 0.7, 1.7], [x, 0.7, -11], '#c4cbbb'); }
    else { b.box([1.2, 0.4, 2.5], [x, 0.2, -1.8], '#d1cbb6'); b.box([1.1, 0.1, 2.4], [x, 0.46, -1.8], '#dbe1d1'); for (const dz of [-0.6, 0.6]) b.seat(x, 0.51, -1.8 + dz, x < 0 ? Math.PI / 2 : -Math.PI / 2); }
  }
}
function studio(b: SetBuilder, s: SceneDefinition) {
  const white = s.id === 'cyclorama'; if(white||s.id==='black-box'){b.floor(white?'#d9dbd1':'#33373c');b.wall(20,8,[0,4,-6],white?'#e6e5dc':'#252a32');}else b.room('#b3b0a4','#8d8e87');
  if (s.id === 'art-gallery') { for (const x of [-3.5, 3.5]) { b.box([1.2, 1, 1.2], [x, 0.5, -2.5], '#c9c6b8'); b.ball([0.42, 0.65, 0.42], [x, 1.65, -2.5], '#978874'); } b.label('FORM / SPACE', [0, 2.6, -5.3], 2.7); }
  else if (s.id === 'photo-loft') { for (const x of [-3.5, 3.5]) { b.cylinder(0.025, 2.4, [x, 1.2, -0.5], '#424b4d'); b.box([1, 0.85, 0.12], [x, 2.4, -0.5], '#e5e3d4'); } b.wall(6, 3.7, [0, 1.85, -4.4], '#bdad94'); }
  else if (s.id === 'black-box') { for (const x of [-4, 4]) for (const z of [-4, 0, 4]) { const light = b.box([0.05, 2.8, 0.05], [x, 1.4, z], '#d0b68c'); light.material = b.material('#d0b68c', 0.7, 0, 1); } }
}
export function createSet(id: SetId): StudioSet {
  if (id === 'portrait' || id === 'runway' || id === 'courtyard') {
    const set=createOriginalSet(id);if(id==='courtyard'){const b=new SetBuilder('sunset');extendOutdoor(b,sceneById.get(id)!);b.compact();set.group.add(b.group);set.group.userData.performanceBounds=b.group.userData.performanceBounds;}return set;
  }
  const s = sceneById.get(id); if (!s) throw new Error('Unknown scene.');
  const surface = s.family==='bedroom'||s.family==='lounge'||s.family==='yacht'?'wood':s.family==='beach'||s.id==='desert-outpost'?'sand':s.family==='landscape'||s.family==='garden'?'grass':'stone';
  const b = new SetBuilder(s.mood,surface);
  const builders = { studio, office, bedroom, lounge, kitchen, beach: coast, pool: coast, garden, street: urban, transit: urban, warehouse: urban, restaurant, landscape, yacht };
  const story=STORY_SETS[id];if(story)story(b);else{const build=builders[s.family as keyof typeof builders];if(!build)throw Error('Missing scene recipe.');build(b,s);}b.group.name=id;
  if(isOutdoorScene(id)&&!b.group.userData.performanceBounds)extendOutdoor(b,s);
  if(s.mood==='sunset'&&['beach','pool','landscape','yacht','garden'].includes(s.family)){const sun=b.ball([8,8,8],[-120,58,-460],'#efc995'),material=b.material('#efc995',1,0,1);material.fog=false;sun.material=material;sun.castShadow=false;}
  b.compact();
  const night = s.mood === 'night', sunset = s.mood === 'sunset';
  return { group: b.group, seats: b.seats, background: night ? '#27313e' : sunset ? '#c8b49c' : '#afc5cb', floor: '#b2aa96',
    key: night ? '#e8d2b4' : sunset ? '#ffdfad' : '#fff3de', fill: night ? '#9db7d4' : '#d4e7ef', exposure: night ? 0.95 : 1.06 };
}
export function disposeSet(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  group.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; geometries.add(m.geometry);
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { materials.add(mat); for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.removeFromParent();
}
