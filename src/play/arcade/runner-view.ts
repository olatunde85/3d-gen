/**
 * The runner scene. Every repeated thing (floor tiles, edges, props, obstacles, coins, power-ups) is one batched mesh
 * refilled from the simulation each frame, so a long run draws in a few calls and allocates nothing. Each theme is a
 * kit of obstacle shapes, props, floor, ground below and sky. The hero runs, jumps, slides, leans into turns and
 * stumbles with Ara clips; the chaser follows behind. The one object waiting to be found is a small model of its own,
 * turning inside a beam of light.
 */
import * as T from 'three';
import { clipById } from '../../core/anim/clips';
import type { GameActor } from '../actor';
import { combatClip } from '../combat-animation';
import type { Combatant } from '../combat';
import { forwardOf, leftOf, LANE, RUN, TRAIN_CAR, type RunnerEvent, type RunnerGame, type RunnerSegment } from './runner';
import type { SpeedFeel } from './feel';
import { UMBRELLA_COLORS } from './market';
import { objectMarker, objectMaterials, objectModel } from './runner-objects';
import type { RunnerObjectType } from './objects';
import { RUNNER_KITS, umbrellaGeometry, type Decor, type RunnerKit } from './runner-kits';
import { hoverboardBody, POWER_MODELS } from './power-models';
import type { RunnerPowerUp } from './modes';
import { canvasTexture, cyl, lavaMaterial, painted, Sky, waterMaterial, type Part } from './scenery';
import { applyLook, glowMaterial, poolTexture, Precipitation, skyLook, type ArcadeAtmosphere, type SkyLook } from './weather';

const PATH = LANE * 3 + 1.2;
/** The hoverboard stance: standing tall on the pads. */
const HOVER_CLIP = 'idle', HOVER_AT = 0;
/** Height of the hoverboard's foot pads above its wheels' contact. */
const BOARD_TOP = 0.18;
const POWER_COLORS = { magnet: '#d8473d', shield: '#3d8ad8', boost: '#f0a02d', multiplier: '#3fae63', springs: '#b45cff', hoverboard: '#20c4d8', 'coin-rush': '#f2c23c' } as const;
/** A repeatable 0..1 value from a segment's decor seed and a position. */
const hashed = (seed: number, k: number) => { const v = Math.sin(seed * 0.000123 + k * 12.9898) * 43758.5453;return v - Math.floor(v); };

export class RunnerView {
  readonly scene = new T.Scene(); readonly camera = new T.PerspectiveCamera(64, 1, 0.1, 400);
  private floor: T.InstancedMesh; private edges: T.InstancedMesh; private walls: T.InstancedMesh;
  private low: T.InstancedMesh; private bars: T.InstancedMesh; private blocks: T.InstancedMesh; private carts: T.InstancedMesh; private wheels?: T.InstancedMesh;
  private decor: { mesh: T.InstancedMesh; spec: Decor; colors?: T.Color[] }[] = []; private side?: T.InstancedMesh; private arches?: T.InstancedMesh; private umbrellas?: T.InstancedMesh;
  private umbrellaColors = UMBRELLA_COLORS.map((c) => new T.Color(c));
  private coins: T.InstancedMesh; private powers = new Map<RunnerPowerUp, T.InstancedMesh>(); private halos: T.InstancedMesh; private shadow: T.Mesh; private shield: T.Mesh; private below: T.Mesh;
  private hero = new T.Group(); private chaserGroup = new T.Group(); private sun: T.DirectionalLight;
  private sky: SkyLook; private dome: Sky; private weather?: Precipitation; private lantern?: T.Mesh; private glows?: T.InstancedMesh; private flows: ((time: number) => void)[] = [];
  private o = new T.Object3D(); private color = new T.Color(); private time = 0; private phase = 0; private chasePhase = 0;
  private yaw = 0; private turn = { age: 9, span: 0.4, dir: 0, from: 0, x: 0, z: 0, run: 0 }; private cameraPos = new T.Vector3(); private look = new T.Vector3(); private disposables: { dispose(): void }[] = [];
  /** Character moments: look around on the start card, dance after reaching the goal. */
  moments = { lookAround: true, dance: true }; private wonAge = 0;
  private finds = new Map<RunnerObjectType, T.Object3D>(); private findMarker?: ReturnType<typeof objectMarker>; private findGroup = new T.Group();
  private kit: RunnerKit;
  /** Spring boots: a coil under each foot while the power-up lasts. */
  private board: T.Mesh; private hover = 0; private lastX = 0; private sway = 0;
  /** Arms posed on top of the clip while riding, held out for balance. */
  private limbs = new Map<string, T.Bone>(); private qa = new T.Quaternion(); private qb = new T.Quaternion(); private axis = new T.Vector3();
  private springs: T.Mesh[] = []; private feet: T.Bone[] = []; private foot = new T.Vector3();
  /** Armed enemies standing in the lanes: a few clones of one figure, each following the nearest enemy ahead. */
  private foes: { actor: GameActor; group: T.Group; id?: number; shotAt?: number }[] = []; private tracer: T.Mesh; private flash: T.Mesh; private tracerAge = 9; private flashAge = 9; private shotAge = 9; private foeFired = new Map<number, number>();
  constructor(readonly game: RunnerGame, readonly runner: GameActor, readonly chaser?: GameActor, atmosphere?: ArcadeAtmosphere, gunman?: GameActor) {
    const kit = this.kit = RUNNER_KITS[game.settings.theme], mat = (color: string, rough = 0.9, extra: T.MeshStandardMaterialParameters = {}) => { const m = new T.MeshStandardMaterial({ color, roughness: rough, ...extra });this.disposables.push(m);return m; };
    const batch = (geometry: T.BufferGeometry, material: T.Material, count: number, shadow = true) => { const m = new T.InstancedMesh(geometry, material, count);m.count = 0;m.castShadow = shadow;m.receiveShadow = true;m.frustumCulled = false;this.scene.add(m);this.disposables.push(geometry);return m; };
    // Night themes are always seen at night.
    if (kit.night) atmosphere = { time: 'night', weather: atmosphere?.weather ?? 'clear' };
    const hemi = new T.HemisphereLight('#fff5e6', kit.below.color, 1.5);this.scene.add(hemi);
    this.sun = new T.DirectionalLight('#fff1d8', 2.4);
    this.sky = skyLook(kit, atmosphere);applyLook(this.sky, this.scene, hemi, this.sun, { hemi: 1.5, sun: 2.4, env: 1 });
    // Night runs stay readable: a bright moonlit fill, a longer view, obstacles that glow faintly in their own colour,
    // and a lantern pool that follows the runner. Dusk and bad weather keep a floor under the fill as well.
    hemi.intensity = Math.max(hemi.intensity, 1.05);
    if (this.sky.night) {
      const moon = kit.night ? new T.Color(kit.sky) : new T.Color('#2a3c5e');
      hemi.intensity = 1.35;hemi.color.set('#b4c6ee');hemi.groundColor.set('#3a3f4c');this.sun.intensity = 1.5;this.sun.color.set('#c4d4f6');
      this.scene.background = moon;this.scene.fog = new T.Fog(moon.clone(), kit.fog[0] * 0.85, kit.fog[1] * 0.9);this.sky = { ...this.sky, sky: moon, fog: [kit.fog[0] * 0.85, kit.fog[1] * 0.9] };
    }
    if (kit.fill) { hemi.intensity *= kit.fill;this.sun.intensity *= kit.fill; }
    if (kit.below.kind === 'lava') { hemi.groundColor.set('#ff6a2a');hemi.intensity *= 1.1; }
    const glowAtNight = (color: string, k = 0.22): T.MeshStandardMaterialParameters => this.sky.night ? { emissive: new T.Color(color).multiplyScalar(k) } : {};
    this.camera.far = Math.min(400, this.sky.fog[1] * 1.15 + 20);this.sun.castShadow = true;this.sun.shadow.mapSize.set(1024, 1024);Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });this.sun.shadow.normalBias = 0.03;this.scene.add(this.sun, this.sun.target);
    const zenith = new T.Color(kit.zenith).lerp(this.sky.sky, this.sky.night || kit.night ? 0 : atmosphere?.weather && atmosphere.weather !== 'clear' ? 0.75 : atmosphere?.time === 'dusk' || atmosphere?.time === 'dawn' ? 0.45 : 0);
    if (this.sky.night && !kit.night) zenith.set('#0a1226');
    this.dome = new Sky({ horizon: `#${this.sky.sky.getHexString()}`, zenith: `#${zenith.getHexString()}`, sunColor: this.sky.sunColor, silhouette: kit.silhouette, tint: kit.tint, lit: this.sky.night, stars: this.sky.night && (atmosphere?.weather ?? 'clear') === 'clear' ? 1 : 0, sun: new T.Vector3(-15, 40, 10) }, this.camera.far * 0.9);this.scene.add(this.dome.group);
    // The floor: a textured tile per few metres, in two alternating shades.
    const map = kit.paintFloor ? canvasTexture(128, 128, kit.paintFloor, false) : undefined, emissiveMap = kit.glowFloor ? canvasTexture(128, 128, kit.glowFloor, false) : undefined;
    if (map) this.disposables.push(map);if (emissiveMap) this.disposables.push(emissiveMap);
    this.floor = batch(new T.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), mat(this.sky.wet ? '#9a9ea3' : '#ffffff', this.sky.wet ? 0.4 : kit.floorRough ?? 0.95, { map, envMapIntensity: this.sky.wet ? 0.4 : 1, ...(emissiveMap ? { emissiveMap, emissive: '#ffffff', emissiveIntensity: kit.below.kind === 'lava' ? 0.75 : 1.2 } : {}) }), 260, false);
    const glowK = kit.nightGlow ?? 1, paint = (k = 0.12) => mat('#ffffff', 0.8, { vertexColors: true, ...glowAtNight('#ffffff', k * glowK) }), props = paint(), obstacles = paint(kit.nightGlow === undefined ? 0.3 : 0.06);
    this.edges = batch(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat(kit.edge, 0.9, glowAtNight(kit.edge, 0.12)), 520);
    this.walls = batch(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat(kit.wall ?? kit.edge, 0.9), 24);
    this.low = batch(kit.low(), obstacles, 60);this.bars = batch(kit.bar(PATH), obstacles, 60);this.blocks = batch(kit.blocker(), obstacles, 60);this.carts = batch(kit.cart(), obstacles, 48);
    if (kit.wheels) this.wheels = batch(new T.CylinderGeometry(0.3, 0.3, 0.16, 12).rotateZ(Math.PI / 2), mat('#2c2c2e', 0.5, { metalness: 0.6 }), 80);
    if (kit.side) this.side = batch(new T.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), mat(kit.side.color, 0.95, glowAtNight(kit.side.color, 0.08)), 520, false);
    if (kit.umbrellas) this.umbrellas = batch(umbrellaGeometry(), mat('#ffffff', 0.8, glowAtNight('#ffffff', 0.15)), 320);
    if (kit.arch) this.arches = batch(kit.arch.geo(PATH), props, 24);
    const signs = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false });this.disposables.push(signs);
    // Towers with lit windows, for city skylines beside the course.
    const windows = kit.decor.some((d) => d.windows) ? (() => {
      const r = (k: number) => { const v = Math.sin(k * 91.7) * 43758.5;return v - Math.floor(v); };
      const tex = canvasTexture(128, 256, (c) => { c.fillStyle = '#1c1f28';c.fillRect(0, 0, 128, 256);for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) { c.fillStyle = '#2a2f3a';c.fillRect(x * 16 + 3, y * 16 + 4, 10, 9); } });
      const glow = canvasTexture(128, 256, (c) => { c.fillStyle = '#000';c.fillRect(0, 0, 128, 256);for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) if (r(x * 31 + y) < 0.4) { c.fillStyle = ['#ffcf8a', '#8fe3ff', '#ff9ad5'][Math.floor(r(x + y * 7) * 3)];c.fillRect(x * 16 + 3, y * 16 + 4, 10, 9); } });
      tex.wrapS = tex.wrapT = glow.wrapS = glow.wrapT = T.RepeatWrapping;tex.repeat.set(1, 3);glow.repeat.set(1, 3);this.disposables.push(tex, glow);
      return mat('#ffffff', 0.7, { map: tex, emissiveMap: glow, emissive: '#ffffff', emissiveIntensity: this.sky.night ? 1.1 : 0 });
    })() : undefined;
    for (const spec of kit.decor) this.decor.push({ mesh: batch(spec.geo(), spec.glow ? signs : spec.windows && windows ? windows : props, Math.ceil(900 / spec.every) * (spec.centre ? 1 : 2) + 8, !spec.glow), spec, colors: spec.colors?.map((c) => new T.Color(c)) });
    this.coins = batch(new T.CylinderGeometry(0.3, 0.3, 0.07, 18).rotateX(Math.PI / 2), mat('#f2c23c', 0.25, { metalness: 0.85, emissive: '#6b4c08', emissiveIntensity: 0.4 + this.sky.lamps * 1.4 }), 420, false);
    if (this.sky.lamps >= 0.5) {
      // Lamps on posts and pillars, and a lantern pool around the runner.
      if (kit.decor.some((d) => d.lamp)) { const glow = new T.MeshBasicMaterial({ color: '#ffd9a0' });this.disposables.push(glow);this.glows = batch(new T.SphereGeometry(0.22, 10, 8), glow, 200, false); }
      const pool = poolTexture(), light = glowMaterial(pool, '#ffd49a', 0.55 * this.sky.lamps);this.lantern = new T.Mesh(new T.PlaneGeometry(9, 12).rotateX(-Math.PI / 2), light);this.lantern.renderOrder = 1;this.scene.add(this.lantern);this.disposables.push(pool, light, this.lantern.geometry);
    }
    // Weather first; otherwise the theme's own particles (snow, embers, fireflies).
    const weather = atmosphere?.weather === 'rain' ? (kit.particles === 'snow' ? 'snow' : 'rain') : atmosphere?.weather === 'sandstorm' ? 'sandstorm' : kit.particles;
    if (weather) { this.weather = new Precipitation(weather);this.scene.add(this.weather.object); }
    // Each power-up is a small model of what it does, over a glowing ring in its colour.
    const powerMat = mat('#ffffff', 0.35, { vertexColors: true, metalness: 0.2 }), glow = this.sky.night ? 0.45 : 0.08;
    // They glow in their own painted colours, so a red magnet stays red under moonlight.
    powerMat.onBeforeCompile = (shader) => { shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * ${glow.toFixed(2)};`); };
    for (const kind of game.settings.powerUps) this.powers.set(kind, batch(POWER_MODELS[kind](), powerMat, 12));
    const halo = new T.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });this.disposables.push(halo);
    this.halos = batch(new T.RingGeometry(0.42, 0.55, 28).rotateX(-Math.PI / 2), halo, 24, false);this.halos.receiveShadow = false;
    // Below the course: ground, water or lava, seen through the gaps.
    const below = kit.below.kind === 'water' ? waterMaterial(kit.below.color, 220) : kit.below.kind === 'lava' ? lavaMaterial(120) : undefined;
    if (below) { this.disposables.push(below);this.flows.push(below.flow); }
    this.below = new T.Mesh(new T.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), below?.material ?? mat(kit.below.color, 1));this.below.position.y = kit.below.y;this.scene.add(this.below);this.disposables.push(this.below.geometry);
    this.shadow = new T.Mesh(new T.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false }));this.scene.add(this.shadow);this.disposables.push(this.shadow.geometry, this.shadow.material as T.Material);
    this.shield = new T.Mesh(new T.SphereGeometry(1.15, 24, 16), new T.MeshBasicMaterial({ color: '#7fc4ff', transparent: true, opacity: 0.18, depthWrite: false }));this.disposables.push(this.shield.geometry, this.shield.material as T.Material);
    const types = [...new Set((game.settings.objects ?? []).map((o) => o.type))];
    if (types.length) {
      const materials = objectMaterials();this.disposables.push(...Object.values(materials));this.findMarker = objectMarker();this.disposables.push(this.findMarker);
      for (const type of types) { const model = objectModel(type, materials);model.position.y = 1.15;model.visible = false;model.traverse((o) => { if (o instanceof T.Mesh) this.disposables.push(o.geometry); });this.finds.set(type, model);this.findGroup.add(model); }
      this.findGroup.add(this.findMarker.group);this.findGroup.visible = false;this.scene.add(this.findGroup);
    }
    const coil = painted([[cyl(0.11, 0.12, 0.04, 14, 0, 0.02, 0), '#3a2a52'], ...[0.07, 0.12, 0.17].map((y) => [new T.TorusGeometry(0.075, 0.018, 6, 16).rotateX(Math.PI / 2).translate(0, y, 0), '#d9dde3'] as Part), [cyl(0.1, 0.1, 0.04, 14, 0, 0.22, 0), '#b45cff']]);
    const coilMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.5, emissive: '#3c1466', emissiveIntensity: 0.6 });this.disposables.push(coil, coilMat);
    for (const b of runner.render.mesh.skeleton.bones) if (/^(Left|Right)(Arm|ForeArm)$/.test(b.name)) this.limbs.set(b.name, b);
    this.feet = runner.render.mesh.skeleton.bones.filter((b) => /^(Left|Right)Foot$|^foot\.[LR]$/.test(b.name)).slice(0, 2);
    for (const _ of this.feet) { const m = new T.Mesh(coil, coilMat);m.castShadow = true;m.visible = false;this.springs.push(m);this.scene.add(m); }
    // The hoverboard rides under the runner, who stands on it a little above the floor.
    const deck = hoverboardBody(), deckMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.35 });this.disposables.push(deck, deckMat);
    this.board = new T.Mesh(deck, deckMat);this.board.castShadow = true;this.board.visible = false;this.scene.add(this.board);
    this.hero.add(runner.render.group, this.shield);this.scene.add(this.hero);runner.render.mesh.castShadow = true;
    if (chaser) { this.chaserGroup.add(chaser.render.group);this.scene.add(this.chaserGroup);chaser.render.mesh.castShadow = true; }
    if (gunman && game.armed) for (const actor of [gunman, gunman.clone(), gunman.clone()]) { const group = new T.Group();group.add(actor.render.group);group.visible = false;actor.render.mesh.castShadow = true;this.scene.add(group);this.foes.push({ actor, group }); }
    // A shot is a bright streak down the lane and a flash at the muzzle, both gone within a few frames.
    const streak = new T.BoxGeometry(0.05, 0.05, 1).translate(0, 0, 0.5), streakMat = new T.MeshBasicMaterial({ color: '#ffe7a0', transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false });
    this.tracer = new T.Mesh(streak, streakMat);this.tracer.visible = false;this.tracer.frustumCulled = false;this.scene.add(this.tracer);
    const flashGeo = new T.SphereGeometry(0.16, 10, 8), flashMat = new T.MeshBasicMaterial({ color: '#fff1b8', transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false });
    this.flash = new T.Mesh(flashGeo, flashMat);this.flash.visible = false;this.scene.add(this.flash);this.disposables.push(streak, streakMat, flashGeo, flashMat);
    this.snapCamera();
  }
  private snapCamera() { const p = this.game.position, f = forwardOf(this.game.heading);this.yaw = this.game.heading * Math.PI / 2;this.cameraPos.set(p.x - f[0] * 5, 2.8, p.z - f[1] * 5);this.look.set(p.x + f[0] * 6, 1.1, p.z + f[1] * 6); }
  events(list: RunnerEvent[], feel: SpeedFeel) {
    for (const e of list) if (e.type === 'rebase') { this.cameraPos.x += e.dx;this.cameraPos.z += e.dz;this.look.x += e.dx;this.look.z += e.dz;this.hero.position.x += e.dx;this.hero.position.z += e.dz;this.turn.x += e.dx;this.turn.z += e.dz; }
    for (const e of list) {
      if (e.type === 'turn') {
        // The simulation turns at the corner in one step; the runner is shown carving an arc from where they were
        // drawn onto the new straight, turning and banking over a stride or two.
        this.turn = { age: 0, span: Math.min(0.5, Math.max(0.3, 5 / Math.max(1, this.game.speed))), dir: Math.sign(this.game.turnLean), from: this.yaw, x: this.hero.position.x, z: this.hero.position.z, run: 0 };
      }
      if (e.type === 'stumble') feel.shake(0.55);
      if (e.type === 'crash' || e.type === 'caught') feel.shake(1);
      if (e.type === 'find') feel.flash(0.3, '255,215,120');
      if (e.type === 'power' || e.type === 'revive') feel.flash(e.type === 'power' && e.kind === 'coin-rush' ? 0.45 : 0.25, e.type === 'power' && e.kind === 'boost' ? '255,190,110' : e.type === 'power' && e.kind === 'coin-rush' ? '255,215,90' : '255,255,255');
      if (e.type === 'near-miss') feel.slowMotion(0.4);
      if (e.type === 'shoot') { this.shot(e.target);this.shotAge = 0; }
      if (e.type === 'enemy-fire') { this.foeFired.set(e.target, this.time);feel.shake(e.blocked ? 0.25 : 0.5);const foe = this.foes.find((f) => f.id === e.target);if (foe) { foe.group.getWorldPosition(this.foot);this.muzzle(this.foot.x, 1.35, this.foot.z); } }
      if (e.type === 'smash' || e.type === 'shield-break' || e.type === 'board-break') feel.shake(0.4);
    }
  }
  private put(mesh: T.InstancedMesh, s: RunnerSegment, d: number, lateral: number, y: number, sx: number, sy: number, sz: number, color?: T.Color, spin = 0) {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    const f = forwardOf(s.heading), l = leftOf(s.heading);
    this.o.position.set(s.x + f[0] * d + l[0] * lateral, y, s.z + f[1] * d + l[1] * lateral);this.o.rotation.set(0, s.heading * Math.PI / 2 + spin, 0);this.o.scale.set(sx, sy, sz);this.o.updateMatrix();
    mesh.setMatrixAt(mesh.count, this.o.matrix);if (color) mesh.setColorAt(mesh.count, color);mesh.count++;
  }
  /** Refill every batch from the visible course. */
  private course() {
    const g = this.game, kit = this.kit, shades = kit.floor.map((c) => new T.Color(c)), cartLength = kit.cartLength ?? 2.2;
    const batches = [this.floor, this.edges, this.walls, this.low, this.bars, this.blocks, this.carts, this.coins, this.halos, ...this.powers.values(), ...this.decor.map((d) => d.mesh), ...[this.wheels, this.glows, this.umbrellas, this.side, this.arches].filter((m): m is T.InstancedMesh => !!m)];
    for (const m of batches) m.count = 0;
    this.findGroup.visible = false;
    const visible = [...g.behind, ...g.segments, ...g.branches];
    // Props beside the path stand on the side platform when they are on it.
    const side = kit.side, standOn = (spec: Decor) => side && !spec.centre && Math.abs(spec.offset - side.offset) < side.width / 2 ? Math.max(0, side.top) : 0;
    visible.forEach((s) => {
      // The straight covers its corner square; the next straight starts beyond it.
      const from = s.start === 0 ? -6 : PATH / 2, to = s.length + PATH / 2, cuts = [...s.gaps].sort((a, b) => a[0] - b[0]);
      let d = from;
      for (const [a, b] of [...cuts, [to, to] as [number, number]]) {
        while (d < Math.min(a, to) - 0.01) { const len = Math.min(3, Math.min(a, to) - d);this.put(this.floor, s, d + len / 2, 0, 0, PATH, 0.6, len - 0.04, shades[((Math.floor((s.start + d) / 3) % 2) + 2) % 2]);d += len; }
        d = Math.max(d, b);
      }
      const openLeft = s.end === 'left' || s.end === 'junction', openRight = s.end === 'right' || s.end === 'junction', inGap = (e: number, pad = 1) => cuts.some(([a, b]) => e > a - pad && e < b + pad);
      for (const side of [1, -1]) {
        const end = (side > 0 ? openLeft : openRight) ? s.length - PATH / 2 : to;
        for (let e = from; e < end - 0.01; e += 4) { const len = Math.min(4, end - e);if (cuts.some(([a, b]) => e + len > a && e < b)) continue;this.put(this.edges, s, e + len / 2, side * (PATH / 2 + 0.15), 0, 0.3, 0.45, len);if (this.side && kit.side) this.put(this.side, s, e + len / 2, side * (PATH / 2 + kit.side.offset), kit.side.top, kit.side.width, 1.2 + kit.side.top, len); }
        this.decor.forEach(({ mesh, spec, colors }, n) => {
          if (spec.centre && side < 0) return;
          for (let e = Math.ceil((from - (spec.start ?? 0)) / spec.every) * spec.every + (spec.start ?? 0); e < end - 1; e += spec.every) {
            if (inGap(e, spec.centre ? 2 : 1)) continue;
            const h = hashed(s.decor, e * 7 + n * 131 + (side > 0 ? 3 : 0)), k = spec.scale ? spec.scale[0] + (spec.scale[1] - spec.scale[0]) * h : 1, tall = spec.height ? spec.height[0] + (spec.height[1] - spec.height[0]) * hashed(s.decor, e * 3 + n) : k;
            const spin = spec.spin === 'face' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : spec.spin === 'random' ? h * Math.PI * 2 : 0;
            this.put(mesh, s, e, spec.centre ? 0 : side * (PATH / 2 + spec.offset), standOn(spec), k, tall, k, colors?.[Math.floor(h * colors.length) % colors.length], spin);
            if (this.glows && spec.lamp && Math.round(e / spec.every) % 2 === 0) this.put(this.glows, s, e, spec.centre ? 0 : side * (PATH / 2 + spec.offset), standOn(spec) + spec.lamp * (spec.height ? tall : k), 1, 1, 1);
            // Market stalls carry an umbrella in one of the market colours.
            if (this.umbrellas && n === 0) this.put(this.umbrellas, s, e, side * (PATH / 2 + spec.offset), 0, 1, 1, 1, this.umbrellaColors[Math.floor(h * this.umbrellaColors.length) % this.umbrellaColors.length], e * 0.7);
          }
        });
      }
      if (this.arches && kit.arch) for (let e = Math.ceil(from / kit.arch.every) * kit.arch.every + kit.arch.every / 2; e < s.length - PATH; e += kit.arch.every) if (!inGap(e, 3)) this.put(this.arches, s, e, 0, 0, 1, 1, 1);
      this.put(this.walls, s, s.length + PATH / 2 + 0.3, 0, -0.3, PATH + 0.6, s.end === 'junction' ? 3.4 : 2.6, 0.6);
      for (const t of s.things) {
        if (t.hit && t.kind !== 'gap') continue;
        const lanes = [-1, 0, 1].filter((_, i) => t.lanes & (1 << i));
        if (t.kind === 'barrier-low') for (const l of lanes) this.put(this.low, s, t.d + 0.25, l * LANE, 0, 1, 1, 1);
        if (t.kind === 'bar-high') this.put(this.bars, s, t.d + 0.25, 0, 0, 1, 1, 1);
        // Blockers and carts face the runner; carts drive toward them.
        if (t.kind === 'blocker') for (const l of lanes) this.put(this.blocks, s, t.d + t.length / 2, l * LANE, 0, 1, 1, 1, undefined, Math.PI);
        // A parked train is several carriages coupled end to end.
        if (t.kind === 'cart') for (const l of lanes) { for (let k = 0; k < (kit.cartLength ? Math.max(1, Math.round(t.length / TRAIN_CAR)) : 1); k++) this.put(this.carts, s, t.d + cartLength * (k + 0.5), l * LANE, 0, 1, 1, 1, undefined, Math.PI);if (this.wheels && kit.wheels) for (const [x, z] of kit.wheels) this.put(this.wheels, s, t.d + z, l * LANE + x, 0.3, 1, 1, 1); }
      }
      for (const c of s.coins) if (!c.taken) this.put(this.coins, s, c.d, c.lane * LANE, c.y, 1, 1, 1, undefined, this.time * 4);
      for (const f of s.finds) if (!f.taken) {
        const type = g.settings.objects![f.item].type, fwd = forwardOf(s.heading), l = leftOf(s.heading);
        this.findGroup.visible = true;this.findGroup.position.set(s.x + fwd[0] * f.d + l[0] * f.lane * LANE, 0, s.z + fwd[1] * f.d + l[1] * f.lane * LANE);
        for (const [t, model] of this.finds) { model.visible = t === type;if (t === type) { model.rotation.y = this.time * 1.6;model.position.y = f.y + 0.15 + Math.sin(this.time * 2.4) * 0.08; } }
        if (this.findMarker) this.findMarker.ring.scale.setScalar(1 + 0.12 * Math.sin(this.time * 4));
      }
      for (const p of s.pickups) if (!p.taken) { const mesh = this.powers.get(p.kind);if (!mesh) continue;this.put(mesh, s, p.d, p.lane * LANE, 1.05 + Math.sin(this.time * 3 + p.id) * 0.12, 1.45, 1.45, 1.45, undefined, p.kind === 'hoverboard' ? Math.sin(this.time * 1.5 + p.id) * 0.3 : this.time * 1.8);this.put(this.halos, s, p.d, p.lane * LANE, 0.04, 1, 1, 1, this.color.set(POWER_COLORS[p.kind])); }
    });
    for (const m of batches) { m.instanceMatrix.needsUpdate = true;if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  /** Choose the clip and its time for the runner's state. */
  private animate(actor: GameActor, dt: number, speed: number, chaser = false) {
    const g = this.game, run = clipById.get('run')!, rate = Math.min(1.9, 0.95 + speed / 28);
    let clip = run, t: number;
    if (chaser) { this.chasePhase += dt * rate;t = this.chasePhase % run.duration; }
    else {
      this.phase += dt * rate;t = this.phase % run.duration;
      if (g.status === 'ready') { clip = clipById.get(this.moments.lookAround ? 'look_around' : 'idle')!;t = this.time % clip.duration; }
      else if (g.status === 'won') { clip = clipById.get(this.moments.dance ? 'dance_groove' : 'idle')!;t = this.wonAge % clip.duration; }
      else if (g.status === 'down' || g.status === 'over') { clip = clipById.get('fall')!;t = Math.min(clip.duration - 0.01, g.downTime ?? 0); }
      else if (g.hovering && g.sliding <= 0) { clip = clipById.get(HOVER_CLIP)!;t = (HOVER_AT + this.time * 0.6) % clip.duration; }
      else if (!g.grounded) { clip = clipById.get('jump_air')!;t = (this.phase * 0.6) % clip.duration; }
      else if (g.sliding > 0) { clip = clipById.get('run_slide')!;t = ((RUN.slide - g.sliding) / RUN.slide) * clip.duration * 0.85; }
      else if (g.recover > 0) { clip = clipById.get('stumble_recover')!;t = (1 - g.recover / 1.1) * clip.duration; }
    }
    // In an armed run the runner raises the gun and aims down the lane for each shot, legs still running.
    const weapon = actor.render.character.params.weapon;
    if (!chaser && g.armed && this.shotAge < 0.55 && (weapon === 'pistol' || weapon === 'rifle') && (clip.id === 'run' || clip.id === 'jump_air')) clip = combatClip(clip, this.gun(weapon, true, this.shotAge));
    const frame = actor.render.animator.frame(clip, t, { rootMotion: false });
    actor.applyFrame(frame, { x: 0, y: 0, z: 0 }, 0);
  }
  /** Just enough of a combatant for the gun layer: which gun, whether it is raised, and time since the last shot. */
  private gun(weapon: 'pistol' | 'rifle', aiming: boolean, fireAge: number) { return { weapon, aiming, fireAge, reload: 0 } as unknown as Combatant; }
  update(dt: number, feel: SpeedFeel, aspect: number) {
    this.time += dt;this.shotAge += dt;const g = this.game, sim = g.position, f = forwardOf(g.heading), target = g.heading * Math.PI / 2, turn = this.turn;
    // Turns ease the heading, position and bank together; the simulation has already turned.
    if (g.status === 'running') { turn.age += dt;turn.run += g.speed * dt; }
    this.wonAge = g.status === 'won' ? this.wonAge + dt : 0;
    // Blend from carrying on along the old heading to the simulated path: the drawn path is a curve that leaves the
    // old straight and joins the new one at running speed.
    const k = Math.min(1, turn.age / turn.span), ease = k * k * (3 - 2 * k), ahead = { x: turn.x + Math.sin(turn.from) * turn.run, z: turn.z + Math.cos(turn.from) * turn.run };
    const p = k < 1 ? { x: ahead.x + (sim.x - ahead.x) * ease, z: ahead.z + (sim.z - ahead.z) * ease } : sim;
    if (k < 1) this.yaw = turn.from + Math.atan2(Math.sin(target - turn.from), Math.cos(target - turn.from)) * ease;
    else this.yaw += Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw)) * (1 - Math.exp(-dt * 9));
    this.course();this.updateFoes(dt);
    this.animate(this.runner, g.status === 'running' ? dt : dt * 0.3, g.speed);
    // The whole body banks into the turn from the feet, so the run cycle never changes clip mid-stride.
    const bank = k < 1 ? -turn.dir * 0.24 * Math.sin(Math.PI * k) : 0;
    // On the board the runner stands on the foot pads; the wheels roll on the floor.
    this.hover += ((g.hovering && g.status !== 'won' ? 1 : 0) - this.hover) * (1 - Math.exp(-dt * 10));
    // Riding is never still: the rider leans into lane changes and turns, tips forward with speed, carves gently from
    // side to side, and the board tilts with them.
    const lateral = dt > 0 ? (g.x - this.lastX) / dt : 0;this.lastX = g.x;
    this.sway += (Math.max(-1, Math.min(1, lateral / 9)) - this.sway) * (1 - Math.exp(-dt * 8));
    const h = this.hover, carve = Math.sin(this.time * 1.7) * 0.07 * h;
    const roll = bank * (1 + h * 0.6) - this.sway * 0.32 * h + carve * 0.5, pitch = h * (0.06 + 0.1 * Math.min(1, g.speed / Math.max(1, g.settings.maxSpeed)) + Math.sin(this.time * 3.1) * 0.025);
    const lift = h * BOARD_TOP;
    this.hero.position.set(p.x, g.y + lift, p.z);
    this.board.visible = h > 0.05;if (this.board.visible) { this.board.position.set(p.x, g.y + lift - BOARD_TOP, p.z);this.board.rotation.set(pitch * 0.25, this.yaw + carve, roll * 0.8, 'YXZ'); }
    this.hero.rotation.set(pitch, this.yaw + carve, roll, 'YXZ');
    if (h > 0.05) this.balance(h, carve);
    this.shield.visible = g.power.shield > 0;this.shield.position.y = 0.95;
    this.shadow.position.set(p.x, g.floor + 0.02, p.z);this.shadow.scale.setScalar(Math.max(0.4, 1 - (g.y - g.floor) * 0.25));this.shadow.visible = g.grounded || g.y > g.floor - 0.2;
    // Coils sit under the feet, following each foot through the stride.
    const springy = g.power.springs > 0 && g.status !== 'won';
    if (springy) this.hero.updateMatrixWorld(true);
    this.feet.forEach((bone, i) => { const m = this.springs[i];m.visible = springy;if (!springy) return;bone.getWorldPosition(this.foot);m.position.set(this.foot.x, this.foot.y - 0.2, this.foot.z);m.rotation.set(0, this.yaw, 0); });
    if (this.chaser) {
      const c = Math.max(0.6, g.chaser), show = g.settings.chaser !== 'none' && c < 13 && g.status !== 'won';this.chaserGroup.visible = show;
      if (show) { this.animate(this.chaser, g.status === 'running' ? dt : 0, g.speed, true);this.chaserGroup.position.set(p.x - f[0] * c, 0, p.z - f[1] * c);this.chaserGroup.rotation.set(0, this.yaw, 0); }
    }
    feel.ratio = Math.min(1.2, g.speed / Math.max(1, g.settings.maxSpeed));feel.boosting = g.power.boost > 0 || g.hovering;
    const cf = [Math.sin(this.yaw), Math.cos(this.yaw)], lateralFollow = g.x * 0.45, l = leftOf(g.heading);
    if (g.status === 'won') {
      // The camera swings round to face the runner as they celebrate.
      const k = Math.min(1, this.wonAge / 1.4), a = this.yaw + Math.PI * (k * k * (3 - 2 * k)), r = 4.2 - k * 0.8;
      this.cameraPos.set(p.x - Math.sin(a) * r, 2.2 - k * 0.6, p.z - Math.cos(a) * r);this.look.set(p.x, 1.05, p.z);
    } else {
      const desired = new T.Vector3(p.x - cf[0] * (4.6 + feel.ratio * 0.6) - l[0] * (g.x - lateralFollow), 2.5 + g.floor + (g.y - g.floor) * 0.35, p.z - cf[1] * (4.6 + feel.ratio * 0.6) - l[1] * (g.x - lateralFollow));
      this.cameraPos.lerp(desired, 1 - Math.exp(-dt * 10));this.look.lerp(new T.Vector3(p.x + cf[0] * 7, 1.1 + g.floor + (g.y - g.floor) * 0.4, p.z + cf[1] * 7), 1 - Math.exp(-dt * 12));
    }
    const shake = feel.offset(this.time);this.camera.position.set(this.cameraPos.x + shake.x, this.cameraPos.y + shake.y, this.cameraPos.z + shake.z);this.camera.lookAt(this.look);
    this.camera.fov = feel.fov(62);this.camera.aspect = aspect;this.camera.updateProjectionMatrix();
    this.sun.position.set(p.x - 15, 40, p.z + 10);this.sun.target.position.set(p.x, 0, p.z);this.below.position.x = p.x;this.below.position.z = p.z;
    // The lantern pool sits a little ahead of the runner, on the floor.
    if (this.lantern) { this.lantern.position.set(p.x + cf[0] * 2.5, g.floor + 0.03, p.z + cf[1] * 2.5);this.lantern.rotation.y = this.yaw;this.lantern.visible = g.y > -0.5; }
    this.weather?.update(this.time, this.camera.position);this.dome.update(this.camera, Math.min(0, this.kit.below.y * 0.25));for (const flow of this.flows) flow(this.time);
  }
  /** Turn a bone about a world axis, keeping the rest of its pose. */
  private turnBone(name: string, axis: T.Vector3, angle: number) {
    const bone = this.limbs.get(name);if (!bone?.parent) return;
    bone.parent.getWorldQuaternion(this.qa);this.qb.setFromAxisAngle(axis, angle);
    bone.quaternion.premultiply(this.qa.clone().invert().multiply(this.qb).multiply(this.qa));bone.updateMatrixWorld(true);
  }
  /** Riding pose: arms held out and swinging against the lean; the legs stay straight under the body. */
  private balance(h: number, carve: number) {
    this.hero.updateMatrixWorld(true);
    const forward = this.axis.set(Math.sin(this.yaw + carve), 0, Math.cos(this.yaw + carve)), right = new T.Vector3(-forward.z, 0, forward.x);
    for (const [side, s] of [['Left', 1], ['Right', -1]] as const) {
      this.turnBone(`${side}Arm`, forward, s * h * (0.75 + this.sway * s * 0.35 + Math.sin(this.time * 2.3 + s) * 0.1));
      this.turnBone(`${side}ForeArm`, right, -h * 0.35);
    }
  }
  /** Where an enemy thing stands, and how far ahead of the runner along the course. */
  private foeSpots() {
    const g = this.game, here = g.current.start + g.d, spots: { id: number; x: number; z: number; yaw: number; ahead: number; shot: boolean }[] = [];
    for (const s of [...g.segments, ...g.branches]) for (const t of s.things) {
      if (t.kind !== 'gunman' || t.hit && !t.shot) continue;
      const ahead = s.start + t.d - here;if (ahead < -4 || ahead > 60) continue;
      const lane = [-1, 0, 1].find((_, i) => t.lanes & (1 << i)) ?? 0, w = g.worldAt(s, t.d + t.length / 2, lane * LANE);
      spots.push({ id: t.id, x: w.x, z: w.z, yaw: s.heading * Math.PI / 2 + Math.PI, ahead, shot: !!t.shot });
    }
    return spots.sort((a, b) => a.ahead - b.ahead).slice(0, this.foes.length);
  }
  /** Enemies rise into view about 32 m ahead, walk toward the runner with the gun ready, aim when close, and fall when shot. */
  private updateFoes(dt: number) {
    if (!this.foes.length) return;
    const spots = this.foeSpots(), walk = clipById.get('walk')!, death = clipById.get('death_backward')!;
    for (const foe of this.foes) if (foe.id !== undefined && !spots.some((s) => s.id === foe.id)) { foe.id = undefined;foe.shotAt = undefined;foe.group.visible = false; }
    for (const spot of spots) {
      const foe = this.foes.find((f) => f.id === spot.id) ?? this.foes.find((f) => f.id === undefined);if (!foe) continue;
      foe.id = spot.id;const group = foe.group;
      if (spot.shot && foe.shotAt === undefined) foe.shotAt = this.time;
      const fallen = foe.shotAt !== undefined ? this.time - foe.shotAt : -1, rise = Math.max(0, Math.min(1, (32 - spot.ahead) / 4));
      group.visible = rise > 0 && fallen < death.duration + 0.6;if (!group.visible) continue;
      group.position.set(spot.x, -1.9 * (1 - rise) * (1 - rise), spot.z);group.rotation.set(0, spot.yaw, 0);
      // Walking in with the gun at the ready, raising it within 18 m; the walk slows to a stop for the shot.
      const gunType = foe.actor.render.character.params.weapon === 'rifle' ? 'rifle' : 'pistol', fired = this.foeFired.get(spot.id), close = spot.ahead < 18;
      const walking = combatClip(walk, this.gun(gunType, close, fired === undefined ? 9 : this.time - fired));
      const frame = fallen >= 0 ? foe.actor.render.animator.frame(death, Math.min(death.duration - 0.01, fallen), { rootMotion: false }) : foe.actor.render.animator.frame(walking, (this.time * 0.8 + spot.id * 0.37) % walk.duration, { rootMotion: false });
      foe.actor.applyFrame(frame, { x: 0, y: 0, z: 0 }, 0);
    }
    this.tracerAge += dt;this.flashAge += dt;this.tracer.visible = this.tracerAge < 0.09;this.flash.visible = this.flashAge < 0.05;
  }
  /** A shot from the runner's hand down their lane, to the enemy hit or 30 m out. */
  private shot(target?: number) {
    const g = this.game, f = forwardOf(g.heading), from = new T.Vector3(this.hero.position.x + f[0] * 0.5, this.hero.position.y + 1.3, this.hero.position.z + f[1] * 0.5);
    const foe = this.foes.find((x) => x.id === target), to = new T.Vector3();
    if (foe && target !== undefined) { foe.group.getWorldPosition(to);to.y = 1.2; } else to.set(from.x + f[0] * 30, 1.3, from.z + f[1] * 30);
    this.tracer.position.copy(from);this.tracer.lookAt(to);this.tracer.scale.set(1, 1, from.distanceTo(to));this.tracerAge = 0;this.muzzle(from.x, from.y, from.z);
  }
  private muzzle(x: number, y: number, z: number) { this.flash.position.set(x, y, z);this.flashAge = 0; }
  reset() { this.foeFired.clear();this.shotAge = 9;for (const foe of this.foes) { foe.id = undefined;foe.shotAt = undefined;foe.group.visible = false; } this.phase = 0;this.wonAge = 0;this.turn.age = 9;this.snapCamera(); }
  dispose() {
    for (const actor of [this.runner, this.chaser, ...this.foes.map((f) => f.actor)]) if (actor) { actor.render.group.removeFromParent();actor.dispose(); }
    for (const d of this.disposables) d.dispose();this.weather?.dispose();this.dome.dispose();this.scene.clear();
  }
}
