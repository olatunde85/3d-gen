/**
 * Vehicle interiors: a train carriage, a city bus, a private jet and an airliner cabin. Each vehicle's front is at +Z,
 * so the camera looks from the front towards the back and seated passengers face it. Every seat is registered, so
 * sitting actions use the real seats. The views through the windows are painted; the vehicles don't move.
 */
import * as THREE from 'three';
import type {SetBuilder} from '../builder';
import {block,glow,METAL,practical,ring} from './details';

type View = 'country' | 'city' | 'sky' | 'sunset-sky';
interface Cabin { width: number; length: number; height: number; wall: string; floor: string; ceiling: string }

/** Walls, floor and ceiling of a closed cabin. Single-sided walls and ceiling disappear from outside, for cutaway views. */
function cabin(b: SetBuilder, c: Cabin) {
  const {width: w, length: l, height: h} = c;
  b.floor(c.floor);
  for (const side of [-1, 1]) b.wall(l, h, [side * w / 2, h / 2, 0], c.wall, side < 0 ? Math.PI / 2 : -Math.PI / 2);
  b.wall(w, h, [0, h / 2, -l / 2], c.wall);
  b.wall(w, h, [0, h / 2, l / 2], c.wall, Math.PI);
  const ceiling = b.wall(w, l, [0, h, 0], c.ceiling);ceiling.rotation.x = Math.PI / 2;ceiling.castShadow = false;ceiling.userData.ceiling = true;
  b.group.userData.roomBounds = {minX: -w / 2, maxX: w / 2, minZ: -l / 2, maxZ: l / 2};
}

/** The painted view through every window: bands of sky and land, no gradients (the map builder has no real canvas). */
function viewMaterial(b: SetBuilder, view: View) {
  const canvas = document.createElement('canvas');canvas.width = 256;canvas.height = 128;
  const ctx = canvas.getContext('2d')!, night = b.mood === 'night';
  const band = (color: string, y: number, height: number) => { ctx.fillStyle = color;ctx.fillRect(0, y, 256, height); };
  if (view === 'sky' || view === 'sunset-sky') {
    const sunset = view === 'sunset-sky';
    ['#6f9fd0', '#82afd9', '#98bfe0', '#b2d0e8'].forEach((c, i) => band(night ? '#1c2a44' : sunset ? ['#c98f6a', '#e0a476', '#efbd88', '#f6d29e'][i] : c, i * 16, 16));
    band(night ? '#2a3550' : sunset ? '#f3dfc0' : '#eef3f6', 64, 22);band(night ? '#222b40' : sunset ? '#e6c7a4' : '#dfe8ee', 86, 42);
    ctx.fillStyle = night ? '#3a4766' : '#ffffff';for (let i = 0; i < 7; i++) ctx.fillRect(i * 41 - 10, 58 + (i % 3) * 5, 46, 9);
  } else if (view === 'country') {
    ['#8fb6d6', '#a3c3de', '#b7d0e4'].forEach((c, i) => band(night ? '#1d2940' : c, i * 18, 18));
    band(night ? '#2b3a36' : '#7c9a83', 54, 16);band(night ? '#25342b' : '#6f9a5d', 70, 22);band(night ? '#1f2c24' : '#5f8a4b', 92, 36);
    ctx.fillStyle = night ? '#1a2620' : '#4f7341';for (let i = 0; i < 12; i++) ctx.fillRect(i * 23, 62 - (i % 4) * 4, 13, 14 + (i % 4) * 4);
  } else {
    ['#95b8d3', '#a8c5dc', '#bdd2e2'].forEach((c, i) => band(night ? '#1b2436' : c, i * 14, 14));
    for (let i = 0; i < 10; i++) { const top = 18 + (i * 37 % 40), x = i * 27;ctx.fillStyle = night ? '#2c3446' : ['#8b8f96', '#a09a90', '#7d8792'][i % 3];ctx.fillRect(x, top, 25, 128 - top);
      ctx.fillStyle = night ? '#d8b86a' : '#c7d5df';for (let y = top + 6; y < 100; y += 12) for (let wx = x + 4; wx < x + 22; wx += 7) ctx.fillRect(wx, y, 3, 5); }
    band(night ? '#30343b' : '#6c7075', 100, 28);
  }
  const map = new THREE.CanvasTexture(canvas);map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: night ? .35 : .85, roughness: .4});
}

/** A window on a side wall: the painted view inside a frame. */
function sideWindow(b: SetBuilder, material: THREE.Material, side: -1 | 1, wallX: number, z: number, width: number, height: number, y: number, frame: string) {
  const x = side * (wallX - .012), yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  const pane = b.wall(width, height, [x, y, z], '#9db4c4', yaw);pane.material = material;pane.castShadow = false;
  const fx = side * (wallX - .03);
  for (const dz of [-width / 2, width / 2]) block(b, [.05, height + .08, .06], [fx, y, z + dz], frame);
  for (const dy of [-height / 2, height / 2]) block(b, [.05, .06, width + .08], [fx, y + dy, z], frame);
}

/** A passenger seat facing +Z (turned by `yaw`), registered for sitting. */
function cabinSeat(b: SetBuilder, x: number, z: number, fabric: string, trim: string, yaw = 0, width = .48, high = true) {
  b.at(x, z, yaw, () => {
    block(b, [width, .3, .42], [x, .21, z], trim);
    block(b, [width, .13, .5], [x, .425, z], fabric);
    const back = block(b, [width, high ? .74 : .5, .11], [x, high ? .86 : .74, z - .27], fabric);back.rotation.x = -.12;
    if (high) block(b, [width * .72, .2, .11], [x, 1.3, z - .33], fabric);
    for (const dx of [-width / 2, width / 2]) block(b, [.055, .06, .42], [x + dx, .66, z - .03], trim);
    b.seat(x, .49, z + .02);
  });
}

/** A door in a side wall, with a sign above it. */
function sideDoor(b: SetBuilder, side: -1 | 1, wallX: number, z: number, width: number, height: number, color: string, label: string) {
  const yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2, x = side * (wallX - .01);
  b.wall(width, height, [x, height / 2, z], color, yaw);
  b.at(x, z, yaw, () => {
    for (const dz of [-width / 2, width / 2]) block(b, [.07, height, .05], [x + dz, height / 2, z + .02], METAL);
    b.label(label, [x, height + .14, z + .02], Math.min(.9, width * .7), '#f1e6c8', '#2c3338');
  });
}

export function trainCarriage(b: SetBuilder) {
  const w = 2.9, l = 18, h = 2.4, fabric = '#3e5e7a', trim = '#2e3439', view = viewMaterial(b, 'country');
  cabin(b, {width: w, length: l, height: h, wall: '#d9d6cc', floor: '#5c5f63', ceiling: '#e6e4dc'});
  block(b, [.6, .006, l], [0, .004, 0], '#4a4d52');
  // Facing bays of four around a table on each side; the vestibule (z 0..3) is open, with doors on both sides.
  for (const zc of [-7.1, -4.6, -2.1, 5.2]) {
    for (const side of [-1, 1] as const) {
      for (const x of [side * .58, side * 1.08]) { cabinSeat(b, x, zc - .72, fabric, trim);cabinSeat(b, x, zc + .72, fabric, trim, Math.PI); }
      block(b, [.95, .05, .6], [side * .85, .74, zc], '#8c7a63');block(b, [.08, .7, .08], [side * .85, .36, zc], METAL);
      sideWindow(b, view, side, w / 2, zc, 1.75, .85, 1.32, '#8a8f93');
    }
  }
  for (const side of [-1, 1] as const) {
    sideDoor(b, side, w / 2, 1.5, 1.2, 2.05, '#8e3b3b', 'DOORS');
    // Luggage racks run above the windows.
    block(b, [.42, .03, l - 1], [side * (w / 2 - .24), 1.95, 0], '#b9c0c4');block(b, [.02, .1, l - 1], [side * (w / 2 - .45), 1.99, 0], METAL);
    for (const zc of [-7.1, -4.6, -2.1, 5.2]) block(b, [.6, .5, .4], [side * (w / 2 - .32), 2.22, zc - .3], ['#5d4c3f', '#3c4a57', '#6b6355', '#2e4250'][Math.round(zc * 3 + 30) % 4]);
  }
  for (const pole of [[-.3, .6], [.3, 2.4]]) block(b, [.04, h, .04], [pole[0], h / 2, pole[1]], '#c8a23c');
  b.wall(.9, 1.95, [0, .98, -l / 2 + .01], '#7a858c');b.label('COACH C', [0, 2.12, -l / 2 + .02], .8, '#f2f2ea', '#2d3a46');
  for (let z = -l / 2 + 1; z < l / 2; z += 2.2) glow(b, [.5, .02, 1.5], [0, h - .015, z], '#f1efe4', .9);
  practical(b, '#f3eedf', [0, 2.1, -3], 6, 9);practical(b, '#f3eedf', [0, 2.1, 2], 5, 8);
}

export function cityBus(b: SetBuilder) {
  const w = 2.5, l = 11, h = 2.3, fabric = '#2f5a8c', trim = '#33363b', view = viewMaterial(b, 'city'), yellow = '#d8b23a';
  cabin(b, {width: w, length: l, height: h, wall: '#e4e4dc', floor: '#585d61', ceiling: '#eeeee8'});
  for (const side of [-1, 1]) block(b, [.04, .006, l], [side * .32, .004, 0], yellow);
  // Paired seats at the back, a rear bench, and an open standing area by the middle door.
  for (const z of [-1.3, -2.1, -2.9, -3.7]) for (const x of [-.92, -.46, .46, .92]) cabinSeat(b, x, z, fabric, trim, 0, .44, false);
  block(b, [w - .2, .25, .5], [0, .62, -4.85], trim);
  for (const x of [-.92, -.46, 0, .46, .92]) { block(b, [.44, .12, .48], [x, .8, -4.75], fabric);const back = block(b, [.44, .55, .1], [x, 1.12, -5.03], fabric);back.rotation.x = -.1;b.seat(x, .86, -4.73); }
  for (const z of [3.1, 3.9]) for (const x of [-.92, -.46]) cabinSeat(b, x, z, fabric, trim, 0, .44, false);
  // Driver's cab at the front left; doors on the right.
  cabinSeat(b, -.72, 4.75, '#3a3d42', trim, 0, .5);
  block(b, [1.1, .9, .5], [-.72, .5, 5.35], '#3b4045');const wheel = b.cylinder(.2, .03, [-.72, 1.05, 5.08], '#24272b');wheel.rotation.x = -1.1;
  block(b, [.06, 1.2, .9], [-.15, .6, 4.75], '#9aa3a8');
  for (const [z, label] of [[4.25, 'ENTRANCE'], [.7, 'EXIT']] as const) sideDoor(b, 1, w / 2, z, 1.15, 2, '#7f8a8f', label);
  for (const side of [-1, 1] as const) for (const z of [-3.9, -2.5, -.5, 2.4]) { if (side > 0 && z === -.5) continue;sideWindow(b, view, side, w / 2, z, 1.25, .95, 1.45, '#6d7378'); }
  sideWindow(b, view, -1, w / 2, 1.05, 1.25, .95, 1.45, '#6d7378');
  // Grab poles, rails and hanging straps; stop buttons on the poles.
  for (const [x, z] of [[-.4, .1], [.4, -.2], [-.4, 1.9], [.4, 2.1], [.4, -1.7], [-.4, 3.5]]) { block(b, [.04, h, .04], [x, h / 2, z], yellow);block(b, [.05, .07, .04], [x, 1.35, z + .03], '#b83b33'); }
  for (const x of [-.4, .4]) {
    block(b, [.035, .035, l - 1.5], [x, 1.98, -.3], yellow);
    for (let z = -.6; z < 3; z += .45) { block(b, [.012, .26, .012], [x, 1.84, z], '#2d3034');const handle = ring(b, .055, .011, [x, 1.66, z], '#2d3034');handle.rotation.y = Math.PI / 2; }
  }
  block(b, [w - .2, .32, .05], [0, 2.05, -l / 2 + .03], '#20262c');b.label('41  CENTRAL STATION', [0, 2.06, -l / 2 + .06], 1.6, '#f3b545', '#20262c');
  for (let z = -l / 2 + 1; z < l / 2; z += 2) for (const x of [-.75, .75]) glow(b, [.25, .02, 1.3], [x, h - .015, z], '#f4f2ea', .85);
  practical(b, '#f5f1e6', [0, 2, -1], 5, 8);
}

export function privateJet(b: SetBuilder) {
  const w = 2.6, l = 10, h = 2, leather = '#9c7a4e', walnut = '#432c1f', view = viewMaterial(b, b.mood === 'sunset' ? 'sunset-sky' : 'sky');
  cabin(b, {width: w, length: l, height: h, wall: '#b9ab93', floor: '#5e5144', ceiling: '#cfc4b1'});
  block(b, [.7, .008, l - 1], [0, .006, 0], '#5f5142');
  // Club seats: two facing pairs around tables, then a divan along the right wall.
  for (const side of [-1, 1] as const) {
    const x = side * .78;
    cabinSeat(b, x, -1.55, leather, walnut, 0, .62);cabinSeat(b, x, .15, leather, walnut, Math.PI, .62);
    block(b, [.7, .04, .55], [x, .72, -.7], walnut);block(b, [.08, .68, .08], [x, .35, -.7], '#b49d6a');
    for (const z of [-1.55, -.7, .15]) sideWindow(b, view, side, w / 2, z, .34, .42, 1.25, '#cfc6b4');
    block(b, [.22, .55, l - 1], [side * (w / 2 - .11), .28, 0], '#7a6447');
  }
  b.at(.88, -3.3, -Math.PI / 2, () => {
    block(b, [2, .38, .62], [.88, .2, -3.3], walnut);block(b, [2, .12, .62], [.88, .45, -3.28], leather);
    const back = block(b, [2, .5, .14], [.88, .76, -3.6], leather);back.rotation.x = -.15;
    for (const dx of [-.6, 0, .6]) b.seat(.88 + dx, .51, -3.26);
  });
  for (const z of [-4, -3.3, -2.6]) sideWindow(b, view, 1, w / 2, z, .34, .42, 1.25, '#cfc6b4');
  cabinSeat(b, -.82, -3.6, leather, walnut, Math.PI / 2, .62);
  block(b, [.5, .5, .5], [-.95, .25, -2.8], walnut);b.cylinder(.08, .12, [-.95, .56, -2.8], '#c9c2b2');
  // Galley and entry door at the front; the rear bulkhead has the washroom door.
  block(b, [1, .95, .55], [-.75, .48, 4.6], walnut);block(b, [1, .04, .58], [-.75, .97, 4.6], '#e9e1d0');
  sideDoor(b, -1, w / 2, 3.3, .9, 1.75, '#ded5c3', 'EXIT');
  b.wall(.75, 1.8, [0, .9, -l / 2 + .01], '#cdbfa6');for (const dx of [-.375, .375]) block(b, [.05, 1.8, .05], [dx, .9, -l / 2 + .03], walnut);
  glow(b, [.08, .015, l - 1], [-.55, h - .02, 0], '#ffe3b5', 1);glow(b, [.08, .015, l - 1], [.55, h - .02, 0], '#ffe3b5', 1);
  practical(b, '#ffe1b0', [0, 1.8, -1.5], 5, 7);
}

export function airlinerCabin(b: SetBuilder) {
  const w = 3.6, l = 16, h = 2.3, fabric = '#2d4766', trim = '#2a2f36', view = viewMaterial(b, b.mood === 'sunset' ? 'sunset-sky' : 'sky');
  cabin(b, {width: w, length: l, height: h, wall: '#e8e8e4', floor: '#47546a', ceiling: '#f0f0ec'});
  block(b, [.5, .006, l], [0, .004, 0], '#5b6880');
  // Nine rows of three-and-three behind an open galley area with the boarding door.
  for (let row = 0; row < 9; row++) {
    const z = -7.1 + row * .84;
    for (const side of [-1, 1] as const) {
      for (const x of [.5, .98, 1.46]) cabinSeat(b, side * x, z, fabric, trim, 0, .46);
      sideWindow(b, view, side, w / 2, z - .1, .26, .36, 1.22, '#d9dbd8');
    }
  }
  for (const side of [-1, 1] as const) {
    // Overhead bins over the seats, with reading lights under them.
    const bin = block(b, [.62, .42, 7.9], [side * (w / 2 - .31), 1.95, -3.75], '#efefea');bin.castShadow = false;
    block(b, [.6, .02, 7.9], [side * (w / 2 - .31), 1.73, -3.75], '#d4d6d2').castShadow = false;
    glow(b, [.02, .03, 7.9], [side * (w / 2 - .62), 1.76, -3.75], '#a9c8f0', .5);
  }
  sideDoor(b, -1, w / 2, 2.6, 1, 1.95, '#d8d9d5', 'EXIT');sideWindow(b, view, -1, w / 2, 2.6, .22, .26, 1.4, '#b3b6b3');
  sideDoor(b, 1, w / 2, 2.6, 1, 1.95, '#d8d9d5', 'EXIT');
  for (const x of [-1.1, 1.1]) { block(b, [1.2, 1.05, .6], [x, .53, 7.6], '#c8cbc8');block(b, [1.2, .04, .62], [x, 1.07, 7.6], '#9ea3a6'); }
  block(b, [1.7, 1.95, .08], [0, .98, -l / 2 + .05], '#d9dad6');for (const x of [-.45, .45]) b.label('LAVATORY', [x, 1.85, -l / 2 + .1], .55, '#30343a', '#e6e7e3');
  b.label('EXIT', [0, h - .18, 1.1], .5, '#ffffff', '#3b8f5a');
  glow(b, [.2, .015, l - 1], [0, h - .02, 0], '#e7eef8', 1);
  practical(b, '#eef2f8', [0, 2.1, -3], 6, 10);practical(b, '#eef2f8', [0, 2.1, 2.5], 4, 7);
}
