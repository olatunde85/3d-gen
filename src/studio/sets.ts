/** A bounded set factory: 50 searchable recipes reuse fourteen families of original props. */
import * as THREE from 'three';
import { sceneById, type SetId, type SceneDefinition } from './catalog';
import { SetBuilder } from './sets/builder';
import { createOriginalSet } from './sets/original';
export interface StudioSet { group: THREE.Group; background: string; floor: string; key: string; fill: string; exposure: number }
function office(b: SetBuilder, s: SceneDefinition) {
  b.room(s.mood === 'night' ? '#404850' : '#c5c1b6', '#aaa596');
  const { id } = s;
  if (id === 'classroom') {
    b.box([6, 1.7, 0.08], [0, 2.2, -5.3], '#354e47'); b.label('CREATE · EXPLORE · LEARN', [0, 2.2, -5.24], 3.8, '#e4e2c8', '#354e47');
    for (const x of [-3.4, 3.4]) for (const z of [-2, 0.5, 3]) { b.table(x, z, '#b99866', 1.4); b.chair(x, z - 0.65); }
  } else if (id === 'boardroom') {
    b.table(0, -3.5, '#765941', 5.4, 1.3); for (const x of [-2, -0.7, 0.7, 2]) b.chair(x, -4.4, '#555d65');
    b.label('A NEW DIRECTION', [0, 2.9, -5.35], 3.4);
  } else if (id === 'recording-studio') {
    for (let i = -4; i <= 4; i++) b.box([0.6, 2.4, 0.15], [i * 0.8, 2, -5.25], i % 2 ? '#4a4545' : '#6b5950');
    b.table(0, -3.6, '#30383e', 4, 1.1); for (const x of [-2.7, 2.7]) { b.box([0.7, 1.1, 0.55], [x, 1.2, -4.5], '#252c30'); b.ball([0.23, 0.23, 0.08], [x, 1.2, -4.2], '#7e8d89'); }
    for (let i = -6; i <= 6; i++) b.box([0.06, 0.025, 0.35], [i * 0.22, 0.81, -3.6], '#aab2b1');
  } else if (id === 'laboratory') {
    for (const x of [-3.3, 3.3]) { b.table(x, -2, '#d4dedd', 2.1, 1); for (let i = 0; i < 4; i++) { b.cylinder(0.08, 0.25 + i * 0.06, [x - 0.6 + i * 0.35, 0.94, -2], i % 2 ? '#85b7c3' : '#adbdc2'); } }
    b.label('RESEARCH LAB', [0, 2.9, -5.3], 2.5);
  } else {
    const positions = id === 'open-office' || id === 'coworking' ? [[-3.3, -3.2], [3.3, -3.2], [-3.3, 1], [3.3, 1]] : [[-2.8, -2.8]];
    for (const [x, z] of positions) { b.table(x, z, id === 'newsroom' ? '#637e8b' : '#86694d', 2.1); b.chair(x, z - 0.7); b.box([0.75, 0.48, 0.05], [x, 1.12, z], '#202c36'); b.box([0.68, 0.4, 0.01], [x, 1.12, z + 0.032], '#6b949d'); b.box([0.12, 0.22, 0.12], [x, 0.9, z - 0.03], '#50585b'); }
    if (id === 'newsroom') { b.label('ARA NEWS', [0, 2.6, -5.35], 3.8, '#e5f3f3', '#284c66'); b.table(2.6, -3.6, '#577783', 2.2, 1.1, 1); }
    else { b.sofa(2.8, -4, '#63736f'); b.skyline(); }
  }
  b.plant(-4.7, -4, 1.7); b.plant(4.7, -4, 1.5);
}
function bedroom(b: SetBuilder, s: SceneDefinition) {
  b.room(s.mood === 'night' ? '#82756e' : '#c7b9a5', '#aa9479');
  b.box([2.1, 0.35, 2.7], [-2.8, 0.2, -2.3], '#7d695a'); b.box([2.05, 0.25, 2.65], [-2.8, 0.49, -2.3], '#e5ded0');
  b.box([2.04, 0.09, 1.85], [-2.8, 0.65, -1.9], s.mood === 'night' ? '#71808a' : '#aeb7a5'); b.box([2.2, 1.3, 0.12], [-2.8, 0.65, -3.8], '#867a6c');
  for (const x of [-3.3, -2.3]) b.box([0.75, 0.18, 0.48], [x, 0.73, -3.25], '#eee6d5');
  b.box([0.65, 0.52, 0.6], [-4.3, 0.26, -3.1], '#9e8b72'); b.lamp(-4.3, -3.1, 1.04);
  b.box([1.6, 1.1, 0.6], [3, 0.55, -4], '#a3957c'); b.wall(1, 1.2, [3, 1.8, -5.3], '#bdcdd0'); b.plant(4.7, -3.4);
  const rug = b.box([3, 0.01, 2.1], [1.7, 0, -2.6], '#c0b2a0'); rug.receiveShadow = true;
}
function lounge(b: SetBuilder, s: SceneDefinition) {
  b.room(s.id === 'apartment-loft' ? '#8c7060' : '#c8c2b4', '#aaa08d');
  if (s.id === 'boutique') {
    for (const x of [-3.2, 3.2]) { b.box([2, 0.05, 0.05], [x, 1.85, -3], '#a89679'); for (const dx of [-0.9, 0.9]) b.box([0.045, 1.85, 0.045], [x + dx, 0.92, -3], '#a89679');
      for (let i = 0; i < 5; i++) b.box([0.25, 0.9, 0.3], [x - 0.6 + i * 0.3, 1.25, -3], ['#a19580', '#77867c', '#b79477'][i % 3]); }
    b.label('ATELIER', [0, 2.9, -5.3], 2.2); b.table(-3.4, 1.5, '#c3b79b', 1.7, 1, 0.9);
  } else if (s.id === 'home-library') {
    for (const x of [-3.2, 3.2]) { b.box([2.6, 3, 0.32], [x, 1.5, -4.7], '#6e5c47');
      for (let j = 0; j < 4; j++) for (let i = 0; i < 10; i++) b.box([0.16, 0.32 + i % 3 * 0.06, 0.2], [x - 1.05 + i * 0.23, 0.4 + j * 0.65, -4.48], ['#9e815c', '#75877b', '#8e6961'][i % 3]); }
    b.chair(-3, -1, '#84735d'); b.lamp(-4, -1);
  } else {
    b.sofa(-3, -2.5, '#697b75'); b.sofa(2.8, -3.5, s.id === 'hotel-lobby' ? '#a3947a' : '#7c847e'); b.table(2.8, -2.3, '#a48e6d', 1.4, 0.7, 0.4); b.lamp(-4.5, -3);
    if (s.id === 'hotel-lobby') { b.box([4.5, 1.1, 0.7], [0, 0.55, -4.9], '#aa997c'); b.label('WELCOME', [0, 2.5, -5.3], 2.2); }
    else { b.box([2.7, 0.8, 0.5], [0, 0.4, -4.9], '#87745a'); b.box([2, 1.1, 0.06], [0, 1.65, -5.3], '#263a40'); }
  }
  b.plant(4.8, -4, 1.8);
}
function kitchen(b: SetBuilder) {
  b.room('#d9d5c9', '#bab7a7');
  b.box([9, 0.9, 0.6], [0, 0.45, -4.9], '#768b86'); b.box([9.2, 0.075, 0.8], [0, 0.94, -4.8], '#e0ddcf');
  for (let i = -4; i <= 4; i++) { b.box([0.85, 0.75, 0.35], [i, 2.1, -5.2], '#c5c4b6'); b.box([0.24, 0.02, 0.03], [i, 1.96, -4.99], '#555e5c'); }
  b.box([2.3, 0.9, 1.2], [-3.2, 0.45, -0.9], '#889b91'); b.box([2.5, 0.08, 1.3], [-3.2, 0.94, -0.9], '#dcd8c7');
  b.cylinder(0.25, 0.16, [0.5, 1.04, -4.75], '#67777b'); b.cylinder(0.12, 0.2, [-1, 1.06, -4.7], '#b08766'); b.plant(4.5, -3);
}
function coast(b: SetBuilder, s: SceneDefinition) {
  b.floor(s.family === 'beach' ? '#c9bb9d' : '#c4bcaa');
  if (s.family === 'beach') { b.water(-24, 100, 41, s.mood === 'sunset' ? '#8bafad' : '#4a9eaa'); for (const [x, z] of [[-5, -3], [5, -6], [-8, -10], [8, -13]]) b.palm(x, z); b.parasol(-3.5, -1.5, '#dbc7a0'); b.box([0.85, 0.08, 2.1], [-3.7, 0.12, 0.4], '#a5b9b1'); }
  else {
    b.box([11.5, 0.14, 6.5], [0, -0.05, -6.6], '#d8d4c3'); b.water(-6.6, 10.8, 5.8, s.id === 'spa' ? '#88aaa2' : '#54b4bd');
    for (const x of [-5.7, 5.7]) { b.box([0.18, 0.1, 6.5], [x, 0.025, -6.6], '#e5decc'); b.palm(x + (x < 0 ? -1 : 1), -6, 5); }
    for (const x of [-4, 4]) { b.parasol(x, -0.8, s.id === 'spa' ? '#b3b7a3' : '#d6c6a6'); b.box([0.8, 0.15, 1.9], [x, 0.3, 1.2], '#9b8a70'); b.box([0.72, 0.08, 1.75], [x, 0.42, 1.2], '#e2dfd2'); b.box([0.55, 0.06, 0.4], [x, 0.5, 0.6], '#c4dbd6'); }
    if (s.id === 'resort-pool') { for (const x of [-7.5, 7.5]) { b.box([2, 3, 8], [x, 1.5, -6.5], '#d8c9ad'); for (const z of [-9, -6, -3]) b.box([0.04, 1.4, 1.5], [x + (x < 0 ? 1.01 : -1.01), 1.9, z], '#688f91'); } }
    if (s.id === 'spa') for (const x of [-7, 7]) for (let i = 0; i < 12; i++) b.box([0.08, 2.5, 0.08], [x, 1.25, -9 + i * 0.55], '#8e8064');
  }
}
function garden(b: SetBuilder, s: SceneDefinition) {
  b.floor(s.id === 'sports-court' ? '#81968a' : s.id === 'veranda' ? '#a18c70' : '#aaa992');
  if (s.id === 'sports-court') {
    for (const x of [-5, 5]) b.box([0.04, 0.02, 16], [x, 0, 0], '#e4dbc3'); for (const z of [-8, 0, 8]) b.box([10, 0.02, 0.04], [0, 0, z], '#e4dbc3');
    for (const z of [-8, 8]) { b.box([0.12, 3.5, 0.12], [0, 1.75, z], '#727c79'); b.box([1.6, 0.9, 0.09], [0, 3.2, z], '#deded0'); const hoop = b.mesh(b.geometry('hoop', () => new THREE.TorusGeometry(0.25, 0.025, 8, 24)), b.material('#a76d43'), [0, 2.9, z + (z < 0 ? 0.35 : -0.35)]); hoop.rotation.x = Math.PI / 2; }
  } else if (s.id === 'wedding-garden') {
    b.box([0.14, 3, 0.14], [-1.8, 1.5, -3.5], '#e2d8bc'); b.box([0.14, 3, 0.14], [1.8, 1.5, -3.5], '#e2d8bc'); b.box([3.8, 0.16, 0.16], [0, 3, -3.5], '#e2d8bc');
    for (let i = 0; i < 12; i++) b.ball([0.24, 0.18, 0.18], [-1.7 + i * 0.31, 3.05, -3.5], i % 3 ? '#c8c1ab' : '#bb9f9a');
    for (const x of [-3.4, 3.4]) for (const z of [-1, 1, 3]) b.chair(x, z, '#cfc5b1');
  } else if (s.id === 'veranda') {
    for (const x of [-5, 5]) b.box([0.18, 3.2, 0.18], [x, 1.6, -3], '#d6ccb4'); b.box([10.5, 0.18, 4], [0, 3.3, -3.5], '#b6a88b'); b.chair(-3.3, -2, '#a09071'); b.chair(3.3, -2, '#a09071');
  } else {
    for (const x of [-3.8, 3.8]) { b.box([1.8, 0.13, 0.5], [x, 0.48, -2], '#8c7b5e'); for (const dx of [-0.65, 0.65]) b.box([0.12, 0.5, 0.4], [x + dx, 0.25, -2], '#6d7168'); }
    b.box([2.8, 0.01, 25], [0, -0.005, -6], '#c9c4ad');
  }
  for (const [x, z] of [[-6, -6], [6, -5], [-9, -12], [9, -10], [0, -16]]) b.tree(x, z, 4.5 + Math.abs(x) * 0.15);
}
function restaurant(b: SetBuilder, s: SceneDefinition) {
  const outdoor = ['street-cafe', 'restaurant-terrace', 'rooftop-bar'].includes(s.id);
  if (outdoor) { b.floor('#b8ad98'); b.wall(16, 4, [0, 2, -6], s.id === 'street-cafe' ? '#b69a7b' : '#8f9389'); b.skyline(-25); }
  else b.room(s.id === 'diner' ? '#bdc2b8' : '#b8a78e', '#a49b89');
  for (const x of [-3.4, 3.4]) { b.table(x, -2.3, s.id === 'diner' ? '#9caba9' : '#9e8663', 1.4, 0.9); b.chair(x, -3.05, s.id === 'diner' ? '#9a564a' : '#6c7e70'); b.chair(x, -1.45, s.id === 'diner' ? '#9a564a' : '#6c7e70', Math.PI); b.cylinder(0.12, 0.02, [x, 0.82, -2.3], '#ded8c7'); }
  if (s.id === 'rooftop-bar' || s.id === 'diner') { b.box([5, 1.1, 0.7], [0, 0.55, -4.7], '#765e49'); b.box([5.2, 0.08, 0.85], [0, 1.14, -4.65], '#b9b7a2'); for (let i = -4; i <= 4; i++) b.cylinder(0.055, 0.25, [i * 0.43, 1.3, -4.7], i % 2 ? '#728d72' : '#b29b72'); }
  if (s.id === 'street-cafe') { b.box([7, 0.1, 1.6], [0, 3.2, -4.8], '#597d76'); b.label('CAFÉ', [0, 2.6, -5.9], 1.9); }
  else if (s.id === 'diner') b.label('OPEN LATE', [0, 2.65, -5.35], 2.2, '#e9c298', '#8f574b');
  for (const x of [-5, 5]) b.plant(x, -4.4, 1.7);
}
function urban(b: SetBuilder, s: SceneDefinition) {
  b.floor(s.family === 'warehouse' ? '#96988e' : '#a5a89e');
  if (s.family === 'transit') {
    b.wall(20, 4, [0, 2, -6], '#a3ada8'); for (const x of [-4.5, 4.5]) { b.box([2.5, 0.15, 0.6], [x, 0.5, -3], '#68777b'); b.box([2.5, 0.5, 0.09], [x, 0.8, -3.25], '#68777b'); }
    b.label(s.id === 'airport-lounge' ? 'DEPARTURES  →' : s.id === 'subway' ? 'CENTRAL  ·  PLATFORM 02' : 'NORTHBOUND  ·  PLATFORM 1', [0, 2.65, -5.88], 4);
    if (s.id === 'train-platform') { for (const z of [-7, -8.5]) b.box([60, 0.08, 0.06], [0, 0, z], '#6c7778'); b.box([15, 0.12, 3], [0, 3.7, -3], '#b5b6a4'); }
    else { for (let i = -4; i <= 4; i++) b.box([0.03, 3.5, 0.03], [i * 2, 1.75, -5.9], '#d1d4c7'); }
  } else if (s.family === 'warehouse') {
    for (const x of [-5, 5]) for (const z of [-7, 1, 8]) { b.box([0.45, 4, 0.45], [x, 2, z], '#777f79'); b.box([10.5, 0.3, 0.4], [0, 4, z], '#747c76'); }
    if (s.id === 'warehouse') for (const x of [-3.5, 3.5]) for (let i = 0; i < 4; i++) b.box([1.15, 0.85, 1], [x + i % 2 * 0.1, 0.45 + Math.floor(i / 2) * 0.9, -3.8 + i % 2 * 1.15], i % 2 ? '#a79878' : '#927c58');
    else { for (const x of [-3.3, 3.3]) b.box([0.1, 0.015, 14], [x, 0, 0], '#c4b26e'); b.label('LEVEL 02  ·  EXIT →', [0, 2.6, -6.5], 3.8); }
  } else {
    b.skyline();
    if (s.id === 'alley') { for (const x of [-5, 5]) { b.box([0.3, 6, 18], [x, 3, -5], '#655b58'); b.box([0.04, 0.09, 12], [x + (x < 0 ? 0.2 : -0.2), 2.8, -4], '#ab9096'); } b.wall(12, 5, [0, 2.5, -9], '#69625a'); b.label('NIGHT MARKET', [0, 2.8, -8.9], 3, '#d7b6d5', '#575c78'); }
    else { b.box([20, 0.6, 0.25], [0, 0.3, -7], '#919387'); for (const x of [-3.6, 3.6]) b.box([1.3, 1.2, 1.4], [x, 0.6, -3.5], '#8f9893'); }
  }
}
function landscape(b: SetBuilder, s: SceneDefinition) {
  b.floor(s.id === 'desert-outpost' ? '#c1a77e' : '#a4a28a');
  if (s.id === 'desert-outpost') {
    for (let i = 0; i < 8; i++) b.ball([10, 2.5 + i % 3, 7], [(i - 4) * 8, -0.8, -17 - i % 2 * 7], i % 2 ? '#baa27e' : '#cfb78b');
    for (const x of [-3.6, 3.6]) b.box([0.16, 2.6, 0.16], [x, 1.3, -4], '#9b8462'); b.box([8, 0.08, 3], [0, 2.6, -4.2], '#b7a482'); b.box([1.1, 0.8, 0.8], [3.8, 0.4, -2], '#9a855f');
  } else {
    for (let i = 0; i < 14; i++) b.tree((i % 2 ? 1 : -1) * (4 + i % 4 * 2), -5 - Math.floor(i / 2) * 3, 4 + i % 3);
    if (s.id === 'campsite') { const tent = b.mesh(b.geometry('tent', () => new THREE.ConeGeometry(1.6, 2, 3)), b.material('#ac8a5e'), [-3.6, 1, -2.4]); tent.rotation.y = Math.PI / 6;
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; b.ball([0.18, 0.1, 0.15], [3 + Math.cos(a) * 0.5, 0.1, -2.5 + Math.sin(a) * 0.5], '#79796c'); }
      const fire = b.mesh(b.geometry('fire', () => new THREE.ConeGeometry(0.2, 0.55, 7)), b.material('#ce9257', 0.8, 0, 1.2), [3, 0.3, -2.5]); fire.castShadow = false;
    } else if (s.id === 'mountain-lake') { b.water(-24, 100, 30, '#7faaa9'); for (let i = 0; i < 7; i++) b.mesh(b.geometry('mountain', () => new THREE.ConeGeometry(1, 1, 5)), b.material(i % 2 ? '#8e9b94' : '#abb0a2'), [(i - 3) * 9, 4, -47], [9, 12 + i % 3 * 4, 8]); }
    else b.box([2.7, 0.015, 36], [0, -0.005, -10], '#b7ad92');
  }
}
function yacht(b: SetBuilder, s: SceneDefinition) {
  b.floor('#ad9875'); b.water(-25, 100, 35, '#659da8');
  for (let i = -5; i <= 5; i++) { b.box([0.06, 1, 0.06], [i * 1.5, 0.5, -5], '#b6bdb6', 0.3, 0.7); b.box([1.5, 0.045, 0.045], [i * 1.5, 1, -5], '#c6cbc3', 0.3, 0.7); }
  for (const x of [-3.7, 3.7]) {
    if (s.id === 'harbour') { b.cylinder(0.18, 0.65, [x, 0.33, -2], '#7a7666'); const hull = b.box([1.8, 0.5, 4.5], [x, 0.1, -11], '#d7d6c9'); hull.rotation.y = x * 0.05; b.box([0.8, 0.7, 1.7], [x, 0.7, -11], '#c4cbbb'); }
    else { b.box([1.2, 0.4, 2.5], [x, 0.2, -1.8], '#d1cbb6'); b.box([1.1, 0.1, 2.4], [x, 0.46, -1.8], '#dbe1d1'); }
  }
}
function studio(b: SetBuilder, s: SceneDefinition) {
  const white = s.id === 'cyclorama'; if(white||s.id==='black-box'){b.floor(white?'#d9dbd1':'#33373c');b.wall(20,8,[0,4,-6],white?'#e6e5dc':'#252a32');}else b.room('#b3b0a4','#8d8e87');
  if (s.id === 'art-gallery') { for (const x of [-3.5, 3.5]) { b.box([1.2, 1, 1.2], [x, 0.5, -2.5], '#c9c6b8'); b.ball([0.42, 0.65, 0.42], [x, 1.65, -2.5], '#978874'); } b.label('FORM / SPACE', [0, 2.6, -5.3], 2.7); }
  else if (s.id === 'photo-loft') { for (const x of [-3.5, 3.5]) { b.cylinder(0.025, 2.4, [x, 1.2, -0.5], '#424b4d'); b.box([1, 0.85, 0.12], [x, 2.4, -0.5], '#e5e3d4'); } b.wall(6, 3.7, [0, 1.85, -4.4], '#bdad94'); }
  else if (s.id === 'black-box') { for (const x of [-4, 4]) for (const z of [-4, 0, 4]) { const light = b.box([0.05, 2.8, 0.05], [x, 1.4, z], '#d0b68c'); light.material = b.material('#d0b68c', 0.7, 0, 1); } }
}
export function createSet(id: SetId): StudioSet {
  if (id === 'portrait' || id === 'runway' || id === 'courtyard') return createOriginalSet(id);
  const s = sceneById.get(id); if (!s) throw new Error('Unknown scene.');
  const surface = s.family==='bedroom'||s.family==='lounge'||s.family==='yacht'?'wood':s.family==='beach'||s.id==='desert-outpost'?'sand':s.family==='landscape'||s.family==='garden'?'grass':'stone';
  const b = new SetBuilder(s.mood,surface);
  const builders = { studio, office, bedroom, lounge, kitchen, beach: coast, pool: coast, garden, street: urban, transit: urban, warehouse: urban, restaurant, landscape, yacht };
  builders[s.family](b, s); b.group.name = id;
  if(s.mood==='sunset'&&['beach','pool','landscape','yacht','garden'].includes(s.family)){const sun=b.ball([1.1,1.1,1.1],[-18,5,-42],'#efc995');sun.material=b.material('#efc995',1,0,1);sun.castShadow=false;}
  const night = s.mood === 'night', sunset = s.mood === 'sunset';
  return { group: b.group, background: night ? '#27313e' : sunset ? '#c8b49c' : '#afc5cb', floor: '#b2aa96',
    key: night ? '#e8d2b4' : sunset ? '#ffdfad' : '#fff3de', fill: night ? '#9db7d4' : '#d4e7ef', exposure: night ? 0.95 : 1.06 };
}
export function disposeSet(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  group.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; geometries.add(m.geometry);
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { materials.add(mat); for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); group.removeFromParent();
}
