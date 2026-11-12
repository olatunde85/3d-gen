/**
 * The race scene: road, kerbs and walls built from the sampled circuit, themed scenery drawn in batches, Ara cars
 * with their fitted drivers, a translucent best-lap ghost, boost flames, sparks and drift smoke, and a chase camera
 * that widens with speed. Drivers far from the camera are hidden to keep frame time steady.
 */
import * as T from 'three';
import { DrivingView } from '../driving-view';
import type { CarState } from '../driving';
import type { GameActor } from '../actor';
import type { Body } from '../runtime';
import { trackPoint, type Track } from './track';
import type { RaceCarState, RaceEvent, RaceGame } from './race';
import type { SpeedFeel } from './feel';
import { VehicleFeel } from '../vehicle-feel';
import { reflections } from './lighting';
import { applyLook, glowMaterial, poolTexture, Precipitation, skyLook, type ArcadeAtmosphere, type SkyLook } from './weather';

const THEME = {
  city: { sky: '#aebfca', ground: '#6f7b6c', wall: '#d9d6cc', accent: '#c4413a', fog: [90, 420] },
  desert: { sky: '#e5cfa8', ground: '#d2ad73', wall: '#e8e1cf', accent: '#d36b2b', fog: [110, 520] },
  harbour: { sky: '#b5c6cf', ground: '#7f8a86', wall: '#e3e5df', accent: '#2c6f9e', fog: [90, 420] },
  forest: { sky: '#bccbbd', ground: '#4f6b43', wall: '#ece7da', accent: '#3f8a55', fog: [70, 360] },
} as const;

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = true) {
  const canvas = document.createElement('canvas');canvas.width = w;canvas.height = h;draw(canvas.getContext('2d')!);
  const texture = new T.CanvasTexture(canvas);texture.colorSpace = T.SRGBColorSpace;texture.anisotropy = 4;
  if (repeat) texture.wrapS = texture.wrapT = T.RepeatWrapping;return texture;
}
/** A strip following the circuit between two lateral offsets, with v measured in metres along the road. */
function ribbon(track: Track, inner: number, outer: number, y: number, vScale: number, samples = track.samples, closed = true) {
  const n = samples.length, steps = closed ? n : n - 1, pos = new Float32Array((steps + 1) * 6), uv = new Float32Array((steps + 1) * 4), index: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const s = samples[k % n], lx = s.tz, lz = -s.tx;
    pos.set([s.x + lx * inner, y, s.z + lz * inner, s.x + lx * outer, y, s.z + lz * outer], k * 6);uv.set([0, (k * track.spacing) / vScale, 1, (k * track.spacing) / vScale], k * 4);
    if (k < steps) { const a = k * 2;index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new T.BufferGeometry();g.setAttribute('position', new T.BufferAttribute(pos, 3));g.setAttribute('uv', new T.BufferAttribute(uv, 2));g.setIndex(index);g.computeVertexNormals();
  return g;
}
/** A vertical strip at one lateral offset, for walls. */
function wall(track: Track, lateral: number, height: number) {
  const n = track.samples.length, pos = new Float32Array((n + 1) * 6), uv = new Float32Array((n + 1) * 4), index: number[] = [];
  for (let k = 0; k <= n; k++) {
    const s = track.samples[k % n], x = s.x + s.tz * lateral, z = s.z - s.tx * lateral;
    pos.set([x, 0, z, x, height, z], k * 6);uv.set([(k * track.spacing) / 4, 0, (k * track.spacing) / 4, 1], k * 4);
    if (k < n) { const a = k * 2;index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new T.BufferGeometry();g.setAttribute('position', new T.BufferAttribute(pos, 3));g.setAttribute('uv', new T.BufferAttribute(uv, 2));g.setIndex(index);g.computeVertexNormals();
  return g;
}

interface CarView { state: RaceCarState; actor: GameActor; view: DrivingView; car: CarState; flame: T.Mesh; body: Body; feel: VehicleFeel }
export class RaceView {
  readonly scene = new T.Scene(); readonly camera = new T.PerspectiveCamera(62, 1, 0.1, 1200);
  private cars: CarView[] = []; private ghost?: { actor: GameActor; view: DrivingView; car: CarState; body: Body };
  private items: T.InstancedMesh; private slicks: T.InstancedMesh; private sparks: T.Points; private sparkData: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[] = [];
  private smoke: T.InstancedMesh; private smokeData: { x: number; z: number; age: number; size: number }[] = []; private sun: T.DirectionalLight;
  private sky: SkyLook; private weather?: Precipitation; private beams?: T.InstancedMesh;
  private cameraPos = new T.Vector3(); private look = new T.Vector3(); private time = 0; private matrix = new T.Matrix4(); private disposables: { dispose(): void }[] = [];
  constructor(readonly game: RaceGame, player: GameActor, drivers: GameActor[], ghostDriver?: GameActor, renderer?: T.WebGLRenderer, atmosphere?: ArcadeAtmosphere) {
    const track = game.track, theme = THEME[track.theme];
    if (renderer) this.scene.environment = reflections(renderer);
    const hemi = new T.HemisphereLight('#fff6e8', '#4b4a44', 1.05);this.scene.add(hemi);
    this.sun = new T.DirectionalLight('#fff0d6', 2.3);
    // Time and weather tint the theme; fog that closes in also shortens the draw distance.
    this.sky = skyLook({ sky: theme.sky, fog: theme.fog as unknown as [number, number] }, atmosphere);applyLook(this.sky, this.scene, hemi, this.sun, { hemi: 1.05, sun: 2.3, env: 0.85 });
    this.camera.far = Math.min(1200, this.sky.fog[1] * 1.15 + 40);
    if (atmosphere?.weather === 'rain' || atmosphere?.weather === 'sandstorm') { this.weather = new Precipitation(atmosphere.weather);this.scene.add(this.weather.object); }this.sun.castShadow = true;this.sun.shadow.mapSize.set(1024, 1024);Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.buildCircuit(track);
    // Item boxes and oil slicks are single batched meshes.
    this.items = new T.InstancedMesh(new T.BoxGeometry(1.1, 1.1, 1.1), new T.MeshStandardMaterial({ color: '#6fd3e8', transparent: true, opacity: 0.75, roughness: 0.2, metalness: 0.1 }), Math.max(1, game.items.length));this.scene.add(this.items);
    this.slicks = new T.InstancedMesh(new T.CircleGeometry(1.7, 20).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#15161a', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.85 }), 40);this.slicks.renderOrder = 1;this.scene.add(this.slicks);
    const sparkGeometry = new T.BufferGeometry();sparkGeometry.setAttribute('position', new T.BufferAttribute(new Float32Array(240 * 3), 3));
    this.sparks = new T.Points(sparkGeometry, new T.PointsMaterial({ color: '#ffcf6a', size: 0.22, transparent: true, depthWrite: false }));this.sparks.frustumCulled = false;this.scene.add(this.sparks);
    for (let i = 0; i < 240; i++) this.sparkData.push({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
    this.smoke = new T.InstancedMesh(new T.SphereGeometry(0.5, 8, 6), new T.MeshBasicMaterial({ color: '#d9d6cf', transparent: true, opacity: 0.35, depthWrite: false }), 120);this.smoke.frustumCulled = false;this.scene.add(this.smoke);
    for (let i = 0; i < 120; i++) this.smokeData.push({ x: 0, z: 0, age: 9, size: 1 });
    game.cars.forEach((state, i) => {
      const actor = i === 0 ? player : drivers[(i - 1) % drivers.length].clone(), view = new DrivingView(actor, { color: state.color, pace: 'standard', model: state.model }, 0.38, 0.38, { livery: 'racing', number: [7, 3, 11, 22, 5, 44, 9, 18][i % 8], accentColor: ['#ececec', '#16181b', '#e2b23a'][i % 3] === state.color ? '#16181b' : ['#ececec', '#16181b', '#e2b23a'][i % 3] });view.autoFeel = false;
      const flame = new T.Mesh(new T.ConeGeometry(0.28, 1.4, 10, 1, true).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending }));
      flame.visible = false;view.vehicle.group.add(flame);
      this.scene.add(view.vehicle.group, actor.render.group);
      actor.render.mesh.castShadow = true;view.vehicle.group.traverse((o) => { if ((o as T.Mesh).isMesh) o.castShadow = true; });
      const feel = new VehicleFeel();feel.headlights = this.sky.lamps;
      this.cars.push({ state, actor, view, flame, car: this.carState(view, state), body: { x: state.x, z: state.z, yaw: state.yaw } as Body, feel });
    });
    if (ghostDriver) {
      const view = new DrivingView(ghostDriver, { color: '#bfe3ff', pace: 'standard', model: game.settings.car.model }, 0.38);
      // Ghost materials are private copies, so the real cars keep their solid paint.
      for (const root of [view.vehicle.group, ghostDriver.render.group]) root.traverse((o) => {
        const mesh = o as T.Mesh;if (!mesh.isMesh) return;mesh.castShadow = false;
        mesh.material = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => { const c = m.clone();c.transparent = true;c.opacity = 0.32;c.depthWrite = false;return c; }) as unknown as T.Material;
        if (Array.isArray(mesh.material) && mesh.material.length === 1) mesh.material = mesh.material[0];
      });
      this.scene.add(view.vehicle.group, ghostDriver.render.group);
      this.ghost = { actor: ghostDriver, view, car: this.carState(view, game.player), body: { x: 0, z: 0, yaw: 0 } as Body };
    }
    if (this.sky.lamps >= 0.4) this.headlightBeams();
    this.snapCamera();
  }
  /** Headlight pools on the road ahead of every car: one batched additive decal. */
  private headlightBeams() {
    const canvas = document.createElement('canvas');canvas.width = 32;canvas.height = 64;const c = canvas.getContext('2d')!, image = c.createImageData(32, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) { const v = y / 63, u = Math.abs(x / 31 - 0.5) * 2, a = Math.pow(1 - v, 1.4) * Math.max(0, 1 - u * u) * Math.min(1, v * 8);image.data.set([255, 255, 255, Math.round(a * 255)], (y * 32 + x) * 4); }
    c.putImageData(image, 0, 0);const map = new T.CanvasTexture(canvas);map.colorSpace = T.SRGBColorSpace;map.flipY = false;
    // A trapezoid from the bumper (1.6 m wide) to 20 m ahead (8 m wide), lying on the road.
    const g = new T.BufferGeometry();g.setAttribute('position', new T.BufferAttribute(new Float32Array([-0.8, 0, 0, 0.8, 0, 0, -4, 0, 20, 4, 0, 20]), 3));g.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));g.setIndex([0, 2, 1, 1, 2, 3]);
    const material = glowMaterial(map, '#fff0c8', 0.42 * this.sky.lamps);material.side = T.DoubleSide;
    this.beams = new T.InstancedMesh(g, material, this.cars.length);this.beams.frustumCulled = false;this.beams.renderOrder = 1;this.scene.add(this.beams);this.disposables.push(g, material, map);
  }
  private carState(view: DrivingView, s: RaceCarState): CarState {
    return { x: s.x, z: s.z, yaw: s.yaw, speed: 0, steer: 0, distance: 0, phase: 'driving', time: 0, fit: view.fit, blocked: 0 };
  }
  private buildCircuit(track: Track) {
    const theme = THEME[track.theme], w = track.width / 2;
    const add = (geometry: T.BufferGeometry, material: T.Material, shadow = true) => { const mesh = new T.Mesh(geometry, material);mesh.receiveShadow = shadow;this.scene.add(mesh);this.disposables.push(geometry, material);return mesh; };
    // The ground sits well below the road: one huge quad loses depth precision, and 2 cm would let it show through.
    const ground = new T.MeshStandardMaterial({ color: theme.ground, roughness: 1 });add(new T.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), ground).position.y = -0.12;
    const asphalt = canvasTexture(256, 256, (c) => { c.fillStyle = '#2d3034';c.fillRect(0, 0, 256, 256);for (let i = 0; i < 2600; i++) { const g = 38 + Math.random() * 34;c.fillStyle = `rgb(${g},${g},${g + 4})`;c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); } });
    add(ribbon(track, -w, w, 0.02, 12), new T.MeshStandardMaterial({ map: asphalt, roughness: this.sky.wet ? 0.42 : 0.92, color: this.sky.wet ? '#7d838b' : '#ffffff', envMapIntensity: this.sky.wet ? 0.3 : 1 }));
    const dash = canvasTexture(16, 64, (c) => { c.clearRect(0, 0, 16, 64);c.fillStyle = '#f2efe4';c.fillRect(0, 0, 16, 34); });
    add(ribbon(track, -0.14, 0.14, 0.03, 6), new T.MeshStandardMaterial({ map: dash, transparent: true, roughness: 0.6 }), false);
    const kerb = canvasTexture(16, 64, (c) => { c.fillStyle = theme.accent;c.fillRect(0, 0, 16, 32);c.fillStyle = '#f4f1e8';c.fillRect(0, 32, 16, 32); });
    for (const side of [-1, 1]) add(ribbon(track, side * (w - 0.9), side * (w + 0.3), 0.035, 3), new T.MeshStandardMaterial({ map: kerb, roughness: 0.7 }));
    const barrier = canvasTexture(128, 32, (c) => { c.fillStyle = theme.wall;c.fillRect(0, 0, 128, 32);c.fillStyle = theme.accent;c.fillRect(0, 20, 128, 5); });
    for (const side of [-1, 1]) add(wall(track, side * (w + 0.9), 1.15), new T.MeshStandardMaterial({ map: barrier, roughness: 0.8, side: T.DoubleSide }));
    for (const c of track.shortcuts) add(ribbon(track, -c.width / 2, c.width / 2, 0.025, 10, c.samples.map((p, i, a) => { const q = a[Math.min(a.length - 1, i + 1)], r = a[Math.max(0, i - 1)], l = Math.hypot(q.x - r.x, q.z - r.z) || 1;return { ...p, tx: (q.x - r.x) / l, tz: (q.z - r.z) / l, curvature: 0, line: 0 }; }), false), new T.MeshStandardMaterial({ color: '#8c7a5c', roughness: 1 }));
    // Start line and gantry.
    const start = trackPoint(track, 0), checker = canvasTexture(64, 16, (c) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5';c.fillRect(x * 4, y * 4, 4, 4); } }, false);
    const line = add(new T.PlaneGeometry(track.width, 2.2).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: checker, roughness: 0.6 }), false);line.position.set(start.x, 0.04, start.z);line.rotation.y = start.yaw;
    const gantry = new T.Group(), metal = new T.MeshStandardMaterial({ color: '#2d3237', roughness: 0.5, metalness: 0.4 });this.disposables.push(metal);
    for (const side of [-1, 1]) { const post = new T.Mesh(new T.BoxGeometry(0.5, 7, 0.5), metal);post.position.set(side * (w + 1.8), 3.5, 0);gantry.add(post); }
    const banner = canvasTexture(512, 64, (c) => { c.fillStyle = '#1f2a2c';c.fillRect(0, 0, 512, 64);c.fillStyle = '#f4f1e8';c.font = 'bold 38px system-ui,sans-serif';c.textAlign = 'center';c.fillText(`ARA  ·  ${track.name.toUpperCase()}`, 256, 46); }, false);
    const beam = new T.Mesh(new T.BoxGeometry(track.width + 4, 1.4, 0.4), [metal, metal, metal, metal, new T.MeshStandardMaterial({ map: banner }), new T.MeshStandardMaterial({ map: banner })]);beam.position.y = 6.6;gantry.add(beam);
    gantry.position.set(start.x, 0, start.z);gantry.rotation.y = start.yaw;this.scene.add(gantry);
    // Ramps rise toward their launch point.
    for (const s of track.ramps) {
      const p = trackPoint(track, s - 3.5), g = new T.BufferGeometry(), half = track.width * 0.38, l = 3.5;
      g.setAttribute('position', new T.BufferAttribute(new Float32Array([-half, 0, -l, half, 0, -l, -half, 0.85, l, half, 0.85, l, -half, 0, l, half, 0, l]), 3));g.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5, 0, 4, 2, 1, 3, 5]);g.computeVertexNormals();
      const stripes = canvasTexture(64, 64, (c) => { c.fillStyle = '#2b2d30';c.fillRect(0, 0, 64, 64);c.fillStyle = '#e8b13a';for (let i = -64; i < 64; i += 16) { c.beginPath();c.moveTo(i, 64);c.lineTo(i + 8, 64);c.lineTo(i + 72, 0);c.lineTo(i + 64, 0);c.fill(); } });
      g.setAttribute('uv', new T.BufferAttribute(new Float32Array([0, 0, 4, 0, 0, 2, 4, 2, 0, 2, 4, 2]), 2));
      const ramp = add(g, new T.MeshStandardMaterial({ map: stripes, roughness: 0.7 }));ramp.position.set(p.x, 0.02, p.z);ramp.rotation.y = p.yaw;
    }
    const chevron = canvasTexture(64, 128, (c) => { c.fillStyle = '#1d1f22';c.fillRect(0, 0, 64, 128);c.strokeStyle = '#ff9e2c';c.lineWidth = 10;for (const y of [24, 64, 104]) { c.beginPath();c.moveTo(8, y + 18);c.lineTo(32, y - 6);c.lineTo(56, y + 18);c.stroke(); } }, false);
    for (const pad of this.game.pads) { const p = trackPoint(track, pad.s, pad.lateral), mesh = add(new T.PlaneGeometry(3, 5).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: chevron, emissive: '#ff8a1c', emissiveIntensity: 0.25, emissiveMap: chevron }), false);mesh.position.set(p.x, 0.045, p.z);mesh.rotation.y = p.yaw; }
    this.scenery(track);
    if (this.sky.lamps >= 0.5) this.lampPosts(track);
  }
  /** Lamp posts along alternate sides with glowing heads and light pools on the road: three batched meshes. */
  private lampPosts(track: Track) {
    const w = track.width / 2, every = Math.max(1, Math.round(38 / track.spacing)), spots: { x: number; z: number; yaw: number; side: number; s: (typeof track.samples)[number] }[] = [];
    for (let k = 0, n = 0; k < track.samples.length; k += every, n++) {
      const s = track.samples[k], side = n % 2 ? 1 : -1, x = s.x + s.tz * side * (w + 2.4), z = s.z - s.tx * side * (w + 2.4);
      if (track.shortcuts.some((c) => c.samples.some((p) => Math.hypot(p.x - x, p.z - z) < c.width / 2 + 2))) continue;
      spots.push({ x, z, yaw: Math.atan2(s.tx, s.tz), side, s });
    }
    if (!spots.length) return;
    const pole = new T.CylinderGeometry(0.09, 0.13, 7.2, 6).translate(0, 3.6, 0), head = new T.BoxGeometry(1.5, 0.16, 0.4), pool = new T.PlaneGeometry(13, 13).rotateX(-Math.PI / 2), map = poolTexture();
    const metal = new T.MeshStandardMaterial({ color: '#30363b', roughness: 0.6, metalness: 0.4 }), glow = new T.MeshBasicMaterial({ color: '#ffe3ad' }), light = glowMaterial(map, '#ffcf8a', 0.5 * this.sky.lamps);
    const poles = new T.InstancedMesh(pole, metal, spots.length), heads = new T.InstancedMesh(head, glow, spots.length), pools = new T.InstancedMesh(pool, light, spots.length), o = new T.Object3D();
    spots.forEach((p, i) => {
      const lx = p.s.tz * -p.side, lz = -p.s.tx * -p.side;
      o.position.set(p.x, 0, p.z);o.rotation.set(0, p.yaw, 0);o.updateMatrix();poles.setMatrixAt(i, o.matrix);
      o.position.set(p.x + lx * 0.9, 7.1, p.z + lz * 0.9);o.updateMatrix();heads.setMatrixAt(i, o.matrix);
      o.position.set(p.x + lx * 4.2, 0.06, p.z + lz * 4.2);o.updateMatrix();pools.setMatrixAt(i, o.matrix);
    });
    poles.castShadow = true;pools.renderOrder = 1;this.scene.add(poles, heads, pools);this.disposables.push(pole, head, pool, map, metal, glow, light);
  }
  /** Themed scenery in batches, kept clear of the road. */
  private scenery(track: Track) {
    const theme = track.theme, random = (() => { let a = 12345;return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
    const spots: { x: number; z: number; r: number }[] = [], clear = (x: number, z: number, r: number) => track.samples.every((s, i) => i % 3 || Math.hypot(s.x - x, s.z - z) > track.width / 2 + 4 + r);
    for (let i = 0; i < 900 && spots.length < 260; i++) {
      const s = track.samples[Math.floor(random() * track.samples.length)], side = random() < 0.5 ? -1 : 1, off = track.width / 2 + 7 + random() * 70, r = 2 + random() * 6;
      const x = s.x + s.tz * side * off, z = s.z - s.tx * side * off;if (clear(x, z, r)) spots.push({ x, z, r });
    }
    const batch = (geometry: T.BufferGeometry, material: T.Material, place: (m: T.Object3D, spot: { x: number; z: number; r: number }, i: number) => void, list = spots) => {
      const mesh = new T.InstancedMesh(geometry, material, list.length), o = new T.Object3D(), color = new T.Color();
      list.forEach((spot, i) => { o.position.set(spot.x, 0, spot.z);o.rotation.set(0, random() * Math.PI, 0);o.scale.set(1, 1, 1);place(o, spot, i);o.updateMatrix();mesh.setMatrixAt(i, o.matrix);mesh.setColorAt(i, color.setHSL(...(material.userData.hsl as [number, number, number]).map((v, k) => (k === 2 ? v + (random() - 0.5) * 0.12 : v)) as [number, number, number])); });
      mesh.castShadow = true;mesh.receiveShadow = true;this.scene.add(mesh);this.disposables.push(geometry, material);
    };
    const material = (hsl: [number, number, number], rough = 0.9) => { const m = new T.MeshStandardMaterial({ roughness: rough });m.userData.hsl = hsl;return m; };
    if (theme === 'city') batch(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), material([0.08, 0.06, 0.62]), (o, s) => { const h = 8 + random() * 38;o.scale.set(s.r * 2.2, h, s.r * 2.2); });
    if (theme === 'harbour') {
      batch(new T.BoxGeometry(2.6, 2.6, 6.1).translate(0, 1.3, 0), material([random(), 0.45, 0.42]), (o, s, i) => { o.position.y = (i % 3) * 2.6 * (s.r > 5 ? 1 : 0); });
      const water = new T.Mesh(new T.PlaneGeometry(4000, 1600).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#4b6f86', roughness: 0.25, metalness: 0.1 }));water.position.set(0, -0.1, -track.width * 6 - 900);this.scene.add(water);this.disposables.push(water.geometry, water.material);
    }
    if (theme === 'desert') { batch(new T.DodecahedronGeometry(1, 0), material([0.07, 0.35, 0.5]), (o, s) => { o.scale.set(s.r * 1.4, s.r * 0.8, s.r);o.position.y = s.r * 0.25; }); batch(new T.CylinderGeometry(0.35, 0.4, 4, 8).translate(0, 2, 0), material([0.3, 0.35, 0.33]), (o) => o.scale.setScalar(0.8 + random()), spots.filter((_, i) => i % 4 === 0)); }
    if (theme === 'forest') { batch(new T.ConeGeometry(2.4, 7, 8).translate(0, 5.5, 0), material([0.33, 0.35, 0.28]), (o, s) => o.scale.setScalar(0.7 + s.r / 6)); batch(new T.CylinderGeometry(0.3, 0.4, 2.2, 6).translate(0, 1.1, 0), material([0.07, 0.4, 0.25]), (o, s) => o.scale.setScalar(0.7 + s.r / 6)); }
  }
  private cameraYaw = 0; private cameraHeight = 2.5;
  private snapCamera() { const p = this.game.player;this.cameraYaw = p.yaw;this.cameraHeight = 2.5;this.cameraPos.set(p.x - Math.sin(p.yaw) * 7, 2.5, p.z - Math.cos(p.yaw) * 7);this.look.set(p.x, 1, p.z); }
  events(list: RaceEvent[], feel: SpeedFeel) {
    for (const e of list) {
      if ((e.type === 'wall' || e.type === 'bump') && e.car !== 'nobody') {
        const car = this.cars.find((c) => c.state.id === e.car) ?? this.cars[0];this.spark(car.state, Math.min(30, 6 + e.strength * 2));
        if (e.car === 'player') feel.shake(Math.min(0.9, e.strength / 18));
      }
      if (e.type === 'land' && e.car === 'player') feel.shake(Math.min(0.5, e.strength / 20));
      if ((e.type === 'boost' || e.type === 'pad') && e.car === 'player') feel.flash(0.22, '255,190,110');
      if (e.type === 'respawn' && e.car === 'player') this.snapCamera();
    }
  }
  private spark(car: RaceCarState, count: number) {
    for (let i = 0; i < count; i++) { const p = this.sparkData.find((s) => s.life <= 0);if (!p) return;Object.assign(p, { x: car.x + (Math.random() - 0.5) * 2, y: 0.4 + car.y, z: car.z + (Math.random() - 0.5) * 2, vx: car.vx * 0.3 + (Math.random() - 0.5) * 8, vy: 2 + Math.random() * 4, vz: car.vz * 0.3 + (Math.random() - 0.5) * 8, life: 0.4 + Math.random() * 0.4 }); }
  }
  update(dt: number, feel: SpeedFeel, aspect: number) {
    this.time += dt;const g = this.game, player = g.player;
    this.cars.forEach((c, i) => { c.state = g.cars[i]; });
    for (const c of this.cars) {
      const s = c.state;Object.assign(c.car, { x: s.x, z: s.z, yaw: s.yaw, speed: s.speed, steer: s.steer * 0.45, distance: s.distance });Object.assign(c.body, { x: s.x, z: s.z, yaw: s.yaw });
      const far = Math.hypot(s.x - this.cameraPos.x, s.z - this.cameraPos.z) > 95;
      c.actor.render.group.visible = !far && (s.respawning <= 0 || Math.floor(this.time * 10) % 2 === 0);c.view.vehicle.group.visible = true;
      if (!far) c.actor.update(c.body, dt, g.time, undefined, false, undefined, undefined, undefined, c.car);
      c.view.update(c.car, c.actor.vehicleFrame);
      // Body lean, pitch and brake lamps follow the handling; jumps add their own pitch.
      const lift = s.y, pitch = s.airborne ? -Math.max(-0.25, Math.min(0.25, s.vy * 0.03)) : 0;
      c.view.vehicle.group.position.y = lift;c.actor.render.group.position.y = lift;
      c.feel.update(c.view.vehicle, s, dt, [c.view.vehicle.group, c.actor.render.group], pitch);
      if (s.respawning > 0) c.view.vehicle.group.visible = Math.floor(this.time * 10) % 2 === 0;
      const burning = s.boost > 0 || s.nitroOn;c.flame.visible = burning;
      if (burning) { const box = c.view.fit.box;c.flame.position.set((box.minX + box.maxX) / 2, 0.55, box.minZ - 0.5);c.flame.scale.set(1, 1, 0.8 + Math.random() * 0.6);(c.flame.material as T.MeshBasicMaterial).color.set(s.nitroOn ? '#7fd1ff' : '#ffb347'); }
      if ((s.drift || s.spin > 0) && Math.random() < 0.7) { const p = this.smokeData.find((q) => q.age >= 1.1);if (p) Object.assign(p, { x: s.x - Math.sin(s.yaw) * 1.8 + (Math.random() - 0.5), z: s.z - Math.cos(s.yaw) * 1.8 + (Math.random() - 0.5), age: 0, size: 0.6 + Math.random() * 0.5 }); }
    }
    if (this.beams) {
      const o = new T.Object3D();
      this.cars.forEach((c, i) => {
        const s = c.state, front = c.view.fit.box.maxZ, hidden = !c.view.vehicle.group.visible || s.airborne;
        o.position.set(s.x + Math.sin(s.yaw) * front, 0.07, s.z + Math.cos(s.yaw) * front);o.rotation.set(0, s.yaw, 0);o.scale.setScalar(hidden ? 0.0001 : 1);o.updateMatrix();this.beams!.setMatrixAt(i, o.matrix);
      });
      this.beams.instanceMatrix.needsUpdate = true;
    }
    const pose = g.ghostPose();
    if (this.ghost) {
      this.ghost.view.vehicle.group.visible = this.ghost.actor.render.group.visible = !!pose;
      if (pose) { Object.assign(this.ghost.car, { x: pose.x, z: pose.z, yaw: pose.yaw });Object.assign(this.ghost.body, pose);this.ghost.actor.update(this.ghost.body, dt, g.time, undefined, false, undefined, undefined, undefined, this.ghost.car);this.ghost.view.update(this.ghost.car, this.ghost.actor.vehicleFrame); }
    }
    // Item boxes spin; collected boxes shrink away until they return.
    const o = new T.Object3D();
    g.items.forEach((box, i) => { const p = trackPoint(g.track, box.s, box.lateral);o.position.set(p.x, 1 + Math.sin(this.time * 2 + i) * 0.15, p.z);o.rotation.set(this.time * 0.8, this.time * 1.3, 0);o.scale.setScalar(box.respawn > 0 ? 0.001 : 1);o.updateMatrix();this.items.setMatrixAt(i, o.matrix); });
    this.items.instanceMatrix.needsUpdate = true;
    this.slicks.count = Math.min(40, g.slicks.length);g.slicks.slice(0, 40).forEach((s, i) => { this.slicks.setMatrixAt(i, this.matrix.makeTranslation(s.x, 0.05, s.z)); });this.slicks.instanceMatrix.needsUpdate = true;
    const positions = this.sparks.geometry.getAttribute('position') as T.BufferAttribute;
    this.sparkData.forEach((p, i) => { if (p.life > 0) { p.life -= dt;p.vy -= 18 * dt;p.x += p.vx * dt;p.y = Math.max(0.05, p.y + p.vy * dt);p.z += p.vz * dt; } positions.setXYZ(i, p.x, p.life > 0 ? p.y : -50, p.z); });positions.needsUpdate = true;
    this.smokeData.forEach((p, i) => { p.age += dt;const k = p.age < 1.1 ? 1 + p.age * 2.2 : 0.001;o.position.set(p.x, 0.4 + p.age * 0.8, p.z);o.rotation.set(0, 0, 0);o.scale.setScalar(p.size * k);o.updateMatrix();this.smoke.setMatrixAt(i, o.matrix); });this.smoke.instanceMatrix.needsUpdate = true;
    // Chase camera: pulled back and lowered as speed rises, with shake and a wider lens.
    const ratio = Math.max(0, player.speed) / player.stats.top, fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    feel.ratio = Math.min(1.2, ratio);feel.boosting = player.boost > 0 || player.nitroOn;
    // The camera stays locked to the car and only its angle lags, so it never trails at top speed.
    const finished = g.status === 'finished', back = finished ? 9 : 6.4 + ratio * 1.6, height = finished ? 3.4 : 2.5 + ratio * 0.2 + player.y * 0.6;
    const heading = finished ? this.cameraYaw + dt * 0.25 : player.yaw;this.cameraYaw += Math.atan2(Math.sin(heading - this.cameraYaw), Math.cos(heading - this.cameraYaw)) * (finished ? 1 : 1 - Math.exp(-dt * 5));
    this.cameraHeight += (height - this.cameraHeight) * (1 - Math.exp(-dt * 4));
    this.cameraPos.set(player.x - Math.sin(this.cameraYaw) * back, this.cameraHeight, player.z - Math.cos(this.cameraYaw) * back);
    this.look.set(player.x + fx * 7, 1.1 + player.y * 0.5, player.z + fz * 7);
    const shake = feel.offset(this.time);this.camera.position.set(this.cameraPos.x + shake.x, this.cameraPos.y + shake.y, this.cameraPos.z + shake.z);this.camera.lookAt(this.look);
    this.camera.fov = feel.fov(60);this.camera.aspect = aspect;this.camera.updateProjectionMatrix();
    this.sun.position.set(player.x - 30, 60, player.z + 25);this.sun.target.position.set(player.x, 0, player.z);
    this.weather?.update(this.time, this.camera.position);
  }
  dispose() {
    // The view owns every driver it shows: the player and ghost arrive as clones, opponents are cloned here.
    for (const c of [...this.cars, ...(this.ghost ? [this.ghost] : [])]) { c.view.dispose();c.actor.render.group.removeFromParent();c.actor.dispose(); }
    for (const d of this.disposables) d.dispose();this.weather?.dispose();
    this.scene.clear();
  }
}
