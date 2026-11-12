/**
 * The runner scene. Every repeated thing (floor tiles, edges, pillars, obstacles, coins, power-ups) is one batched
 * mesh refilled from the simulation each frame, so a long run draws in a few calls and allocates nothing. The hero
 * runs, jumps, slides, leans into turns and stumbles with Ara clips; the chaser follows behind. The one object waiting
 * to be found is a small model of its own, turning inside a beam of light.
 */
import * as T from 'three';
import { clipById } from '../../core/anim/clips';
import type { GameActor } from '../actor';
import { forwardOf, leftOf, LANE, RUN, type RunnerEvent, type RunnerGame, type RunnerSegment } from './runner';
import type { RunnerTheme } from './modes';
import type { SpeedFeel } from './feel';
import { minibusGeometry, tricycleGeometry, umbrellaGeometry, UMBRELLA_COLORS } from './market';
import { objectMarker, objectMaterials, objectModel } from './runner-objects';
import type { RunnerObjectType } from './objects';
import { applyLook, glowMaterial, poolTexture, Precipitation, skyLook, type ArcadeAtmosphere, type SkyLook } from './weather';

const PATH = LANE * 3 + 1.2;
const THEME: Record<RunnerTheme, { sky: string; fog: [number, number]; floor: [string, string]; edge: string; decor: string; below: string; low: string; block: string }> = {
  'temple-ruins': { sky: '#a7bea6', fog: [35, 160], floor: ['#aaa189', '#988f78'], edge: '#6f6a58', decor: '#a0977f', below: '#3d5a37', low: '#6f5034', block: '#8a8370' },
  'city-rooftops': { sky: '#bccad6', fog: [40, 190], floor: ['#80848b', '#72767d'], edge: '#d3cfc5', decor: '#b5b7b3', below: '#4a5562', low: '#c0632d', block: '#5d6670' },
  'market-street': { sky: '#cfd6d6', fog: [40, 170], floor: ['#7b766f', '#716c66'], edge: '#ddd5c4', decor: '#a8835a', below: '#9a8e7c', low: '#c9822f', block: '#7d6a55' },
  'desert-canyon': { sky: '#e6cda3', fog: [40, 170], floor: ['#cfa36b', '#c0945e'], edge: '#9b6a42', decor: '#a8683f', below: '#8a5a37', low: '#7b5532', block: '#9a6b47' },
};
const POWER_COLORS = { magnet: '#d8473d', shield: '#3d8ad8', boost: '#f0a02d', multiplier: '#3fae63' } as const;

export class RunnerView {
  readonly scene = new T.Scene(); readonly camera = new T.PerspectiveCamera(64, 1, 0.1, 400);
  private floor: T.InstancedMesh; private edges: T.InstancedMesh; private decor: T.InstancedMesh; private walls: T.InstancedMesh;
  private low: T.InstancedMesh; private beams: T.InstancedMesh; private blocks: T.InstancedMesh; private carts: T.InstancedMesh; private wheels: T.InstancedMesh;
  private umbrellas?: T.InstancedMesh; private pavement?: T.InstancedMesh; private umbrellaColors = UMBRELLA_COLORS.map((c) => new T.Color(c));
  private coins: T.InstancedMesh; private powers: T.InstancedMesh; private shadow: T.Mesh; private shield: T.Mesh; private below: T.Mesh;
  private hero = new T.Group(); private chaserGroup = new T.Group(); private sun: T.DirectionalLight;
  private sky: SkyLook; private weather?: Precipitation; private lantern?: T.Mesh; private glows?: T.InstancedMesh;
  private o = new T.Object3D(); private color = new T.Color(); private time = 0; private phase = 0; private chasePhase = 0;
  private yaw = 0; private turn = { age: 9, span: 0.4, dir: 0, from: 0, x: 0, z: 0, run: 0 }; private cameraPos = new T.Vector3(); private look = new T.Vector3(); private disposables: { dispose(): void }[] = [];
  /** Character moments: look around on the start card, dance after reaching the goal. */
  moments = { lookAround: true, dance: true }; private wonAge = 0;
  private finds = new Map<RunnerObjectType, T.Object3D>(); private findMarker?: ReturnType<typeof objectMarker>; private findGroup = new T.Group();
  constructor(readonly game: RunnerGame, readonly runner: GameActor, readonly chaser?: GameActor, atmosphere?: ArcadeAtmosphere) {
    const theme = THEME[game.settings.theme], mat = (color: string, rough = 0.9, extra: T.MeshStandardMaterialParameters = {}) => { const m = new T.MeshStandardMaterial({ color, roughness: rough, ...extra });this.disposables.push(m);return m; };
    const batch = (geometry: T.BufferGeometry, material: T.Material, count: number, shadow = true) => { const m = new T.InstancedMesh(geometry, material, count);m.count = 0;m.castShadow = shadow;m.receiveShadow = true;m.frustumCulled = false;this.scene.add(m);this.disposables.push(geometry);return m; };
    const hemi = new T.HemisphereLight('#fff5e6', theme.below, 1.5);this.scene.add(hemi);
    this.sun = new T.DirectionalLight('#fff1d8', 2.4);
    this.sky = skyLook(theme, atmosphere);applyLook(this.sky, this.scene, hemi, this.sun, { hemi: 1.5, sun: 2.4, env: 1 });
    // Night runs stay readable: a bright moonlit fill and sky, a longer view, obstacles that glow faintly in their own
    // colour, and a lantern pool that follows the runner. Dusk and bad weather keep a floor under the fill as well.
    hemi.intensity = Math.max(hemi.intensity, 1.05);
    if (this.sky.night) {
      hemi.intensity = 1.35;hemi.color.set('#b4c6ee');hemi.groundColor.set('#3a3f4c');this.sun.intensity = 1.5;this.sun.color.set('#c4d4f6');
      const sky = new T.Color('#2a3c5e');this.scene.background = sky;this.scene.fog = new T.Fog(sky.clone(), theme.fog[0] * 0.85, theme.fog[1] * 0.9);this.sky = { ...this.sky, sky, fog: [theme.fog[0] * 0.85, theme.fog[1] * 0.9] };
    }
    const glowAtNight = (color: string, k = 0.22): T.MeshStandardMaterialParameters => this.sky.night ? { emissive: new T.Color(color).multiplyScalar(k) } : {};
    this.camera.far = Math.min(400, this.sky.fog[1] * 1.15 + 20);this.sun.castShadow = true;this.sun.shadow.mapSize.set(1024, 1024);Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });this.sun.shadow.normalBias = 0.03;this.scene.add(this.sun, this.sun.target);
    this.floor = batch(new T.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), mat(this.sky.wet ? '#8d9196' : '#ffffff', this.sky.wet ? 0.45 : 0.95, { envMapIntensity: this.sky.wet ? 0.3 : 1 }), 260, false);
    this.edges = batch(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat(theme.edge, 0.9, glowAtNight(theme.edge, 0.12)), 520);
    const decorGeometry = game.settings.theme === 'temple-ruins' ? new T.CylinderGeometry(0.45, 0.55, 1, 10).translate(0, 0.5, 0) : new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.decor = batch(decorGeometry, mat(theme.decor, 0.95), 320);this.walls = batch(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat(theme.edge, 0.9), 24);
    this.low = batch(new T.BoxGeometry(LANE * 0.92, 0.7, 0.5).translate(0, 0.35, 0), mat(theme.low, 0.85, glowAtNight(theme.low, 0.35)), 60);
    this.beams = batch(new T.BoxGeometry(1, 1, 1), mat('#5b4a3a', 0.8, glowAtNight('#c79a6a', 0.3)), 120);
    // The market street parks tricycles as lane blockers and rolls minibuses down the lanes in place of carts.
    const market = game.settings.theme === 'market-street', painted = (k: number) => mat('#ffffff', 0.6, { vertexColors: true, ...glowAtNight('#ffffff', k) });
    this.blocks = batch(market ? tricycleGeometry() : new T.BoxGeometry(LANE * 0.9, 2.6, 1.4).translate(0, 1.3, 0), market ? painted(0.12) : mat(theme.block, 0.95, glowAtNight(theme.block, 0.3)), 60);
    this.carts = batch(market ? minibusGeometry() : new T.BoxGeometry(1.4, 1.15, 2.2).translate(0, 0.85, 0), market ? painted(0.12) : mat('#6b4a2c', 0.7, { metalness: 0.2, ...glowAtNight('#b07a48', 0.3) }), 20);
    // Pavements line the street so the stalls stand on ground and gaps read as trenches cut into the road.
    if (market) this.pavement = batch(new T.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), mat('#b5a891', 0.95), 520, false);
    if (market) this.umbrellas = batch(umbrellaGeometry(), mat('#ffffff', 0.8, glowAtNight('#ffffff', 0.15)), 320);
    this.wheels = batch(new T.CylinderGeometry(0.3, 0.3, 0.16, 12).rotateZ(Math.PI / 2), mat('#2c2c2e', 0.5, { metalness: 0.6 }), 80);
    this.coins = batch(new T.CylinderGeometry(0.3, 0.3, 0.07, 18).rotateX(Math.PI / 2), mat('#f2c23c', 0.25, { metalness: 0.85, emissive: '#6b4c08', emissiveIntensity: 0.4 + this.sky.lamps * 1.4 }), 420, false);
    if (this.sky.lamps >= 0.5) {
      // Lamps on the pillars and roof posts (the canyon walls stay dark) and a lantern pool around the runner.
      if (game.settings.theme !== 'desert-canyon') { const glow = new T.MeshBasicMaterial({ color: '#ffd9a0' });this.disposables.push(glow);this.glows = batch(new T.SphereGeometry(0.22, 10, 8), glow, 160, false); }
      const map = poolTexture(), light = glowMaterial(map, '#ffd49a', 0.55 * this.sky.lamps);this.lantern = new T.Mesh(new T.PlaneGeometry(9, 12).rotateX(-Math.PI / 2), light);this.lantern.renderOrder = 1;this.scene.add(this.lantern);this.disposables.push(map, light, this.lantern.geometry);
    }
    if (atmosphere?.weather === 'rain' || atmosphere?.weather === 'sandstorm') { this.weather = new Precipitation(atmosphere.weather);this.scene.add(this.weather.object); }
    this.powers = batch(new T.IcosahedronGeometry(0.42, 0), mat('#ffffff', 0.3, { emissive: '#222222' }), 24, false);
    this.below = new T.Mesh(new T.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), mat(theme.below, 1));this.below.position.y = game.settings.theme === 'city-rooftops' ? -40 : game.settings.theme === 'market-street' ? -1.2 : -18;this.scene.add(this.below);this.disposables.push(this.below.geometry);
    this.shadow = new T.Mesh(new T.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false }));this.scene.add(this.shadow);this.disposables.push(this.shadow.geometry, this.shadow.material as T.Material);
    this.shield = new T.Mesh(new T.SphereGeometry(1.15, 24, 16), new T.MeshBasicMaterial({ color: '#7fc4ff', transparent: true, opacity: 0.18, depthWrite: false }));this.disposables.push(this.shield.geometry, this.shield.material as T.Material);
    const types = [...new Set((game.settings.objects ?? []).map((o) => o.type))];
    if (types.length) {
      const materials = objectMaterials();this.disposables.push(...Object.values(materials));this.findMarker = objectMarker();this.disposables.push(this.findMarker);
      for (const type of types) { const model = objectModel(type, materials);model.position.y = 1.15;model.visible = false;model.traverse((o) => { if (o instanceof T.Mesh) this.disposables.push(o.geometry); });this.finds.set(type, model);this.findGroup.add(model); }
      this.findGroup.add(this.findMarker.group);this.findGroup.visible = false;this.scene.add(this.findGroup);
    }
    this.hero.add(runner.render.group, this.shield);this.scene.add(this.hero);runner.render.mesh.castShadow = true;
    if (chaser) { this.chaserGroup.add(chaser.render.group);this.scene.add(this.chaserGroup);chaser.render.mesh.castShadow = true; }
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
      if (e.type === 'power' || e.type === 'revive') feel.flash(0.25, e.type === 'power' && e.kind === 'boost' ? '255,190,110' : '255,255,255');
      if (e.type === 'near-miss') feel.slowMotion(0.4);
      if (e.type === 'smash' || e.type === 'shield-break') feel.shake(0.4);
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
    const g = this.game, theme = THEME[g.settings.theme], shades = theme.floor.map((c) => new T.Color(c));
    const batches = [this.floor, this.edges, this.decor, this.walls, this.low, this.beams, this.blocks, this.carts, this.wheels, this.coins, this.powers, ...(this.glows ? [this.glows] : []), ...(this.umbrellas ? [this.umbrellas] : []), ...(this.pavement ? [this.pavement] : [])], market = g.settings.theme === 'market-street';
    for (const m of batches) m.count = 0;
    this.findGroup.visible = false;
    const visible = [...g.behind, ...g.segments, ...g.branches];
    visible.forEach((s) => {
      // The straight covers its corner square; the next straight starts beyond it.
      const from = s.start === 0 ? -6 : PATH / 2, to = s.length + PATH / 2, cuts = [...s.gaps].sort((a, b) => a[0] - b[0]);
      let d = from;
      for (const [a, b] of [...cuts, [to, to] as [number, number]]) {
        while (d < Math.min(a, to) - 0.01) { const len = Math.min(3, Math.min(a, to) - d);this.put(this.floor, s, d + len / 2, 0, 0, PATH, 0.6, len - 0.04, shades[((Math.floor((s.start + d) / 3) % 2) + 2) % 2]);d += len; }
        d = Math.max(d, b);
      }
      const openLeft = s.end === 'left' || s.end === 'junction', openRight = s.end === 'right' || s.end === 'junction';
      for (const side of [1, -1]) {
        const end = (side > 0 ? openLeft : openRight) ? s.length - PATH / 2 : to;
        for (let e = from; e < end - 0.01; e += 4) { const len = Math.min(4, end - e);if (cuts.some(([a, b]) => e + len > a && e < b)) continue;this.put(this.edges, s, e + len / 2, side * (PATH / 2 + 0.15), 0, 0.3, 0.45, len);if (this.pavement) this.put(this.pavement, s, e + len / 2, side * (PATH / 2 + 2.9), -0.01, 5.2, 1.2, len); }
        for (let e = Math.ceil(from / 7) * 7; e < end - 1; e += 7) {
          if (cuts.some(([a, b]) => e > a - 1 && e < b + 1)) continue;const h = market ? 0.9 : g.settings.theme === 'desert-canyon' ? 7 + ((s.decor >> (e % 13)) % 6) : g.settings.theme === 'temple-ruins' ? 3.2 + ((s.decor >> (e % 11)) % 3) * 0.6 : 0.9 + ((s.decor >> (e % 7)) % 3) * 0.5;
          const off = market ? PATH / 2 + 1.6 : g.settings.theme === 'desert-canyon' ? PATH / 2 + 2.2 : PATH / 2 + 1, size = market ? 1.5 : g.settings.theme === 'desert-canyon' ? 3.5 : g.settings.theme === 'temple-ruins' ? 1 : 1.6;
          this.put(this.decor, s, e, side * off, 0, size, h, size);
          // A stall: a table of goods under an umbrella in one of the market colours.
          if (this.umbrellas) this.put(this.umbrellas, s, e, side * off, 0, 1, 1, 1, this.umbrellaColors[((s.decor >> ((e + (side > 0 ? 3 : 0)) % 17)) % this.umbrellaColors.length + this.umbrellaColors.length) % this.umbrellaColors.length], e * 0.7);
          if (this.glows && (e / 7) % 2 === 0) this.put(this.glows, s, e, side * off, market ? 2.15 : h + 0.2, 1, 1, 1);
        }
      }
      this.put(this.walls, s, s.length + PATH / 2 + 0.3, 0, -0.3, PATH + 0.6, s.end === 'junction' ? 3.4 : 2.6, 0.6);
      for (const t of s.things) {
        if (t.hit && t.kind !== 'gap') continue;
        const lanes = [-1, 0, 1].filter((_, i) => t.lanes & (1 << i));
        if (t.kind === 'barrier-low') for (const l of lanes) this.put(this.low, s, t.d + 0.25, l * LANE, 0, 1, 1, 1);
        if (t.kind === 'bar-high') { this.put(this.beams, s, t.d + 0.25, 0, 1.38, PATH, 0.32, 0.32);for (const side of [-1, 1]) this.put(this.beams, s, t.d + 0.25, side * (PATH / 2 - 0.1), 0.75, 0.22, 1.5, 0.22); }
        if (t.kind === 'blocker') for (const l of lanes) this.put(this.blocks, s, t.d + t.length / 2, l * LANE, 0, 1, 1, 1, undefined, market ? Math.PI : 0);
        // Minibuses face the runner, since they drive toward them.
        if (t.kind === 'cart') for (const l of lanes) { this.put(this.carts, s, t.d + 1.1, l * LANE, 0, 1, 1, 1, undefined, market ? Math.PI : 0);for (const [x, z] of market ? [[-0.8, 0.25], [0.8, 0.25], [-0.8, 2.0], [0.8, 2.0]] : [[-0.75, 0.6], [0.75, 0.6], [-0.75, 1.6], [0.75, 1.6]]) this.put(this.wheels, s, t.d + z, l * LANE + x, 0.3, 1, 1, 1); }
      }
      for (const c of s.coins) if (!c.taken) this.put(this.coins, s, c.d, c.lane * LANE, c.y, 1, 1, 1, undefined, this.time * 4);
      for (const f of s.finds) if (!f.taken) {
        const type = g.settings.objects![f.item].type, fwd = forwardOf(s.heading), l = leftOf(s.heading);
        this.findGroup.visible = true;this.findGroup.position.set(s.x + fwd[0] * f.d + l[0] * f.lane * LANE, 0, s.z + fwd[1] * f.d + l[1] * f.lane * LANE);
        for (const [t, model] of this.finds) { model.visible = t === type;if (t === type) { model.rotation.y = this.time * 1.6;model.position.y = f.y + 0.15 + Math.sin(this.time * 2.4) * 0.08; } }
        if (this.findMarker) this.findMarker.ring.scale.setScalar(1 + 0.12 * Math.sin(this.time * 4));
      }
      for (const p of s.pickups) if (!p.taken) this.put(this.powers, s, p.d, p.lane * LANE, 1 + Math.sin(this.time * 3 + p.id) * 0.15, 1, 1, 1, this.color.set(POWER_COLORS[p.kind]), this.time * 1.5);
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
      else if (!g.grounded) { clip = clipById.get('jump_air')!;t = (this.phase * 0.6) % clip.duration; }
      else if (g.sliding > 0) { clip = clipById.get('run_slide')!;t = ((RUN.slide - g.sliding) / RUN.slide) * clip.duration * 0.85; }
      else if (g.recover > 0) { clip = clipById.get('stumble_recover')!;t = (1 - g.recover / 1.1) * clip.duration; }
    }
    const frame = actor.render.animator.frame(clip, t, { rootMotion: false });
    actor.applyFrame(frame, { x: 0, y: 0, z: 0 }, 0);
  }
  update(dt: number, feel: SpeedFeel, aspect: number) {
    this.time += dt;const g = this.game, sim = g.position, f = forwardOf(g.heading), target = g.heading * Math.PI / 2, turn = this.turn;
    // Turns ease the heading, position and bank together; the simulation has already turned.
    if (g.status === 'running') { turn.age += dt;turn.run += g.speed * dt; }
    this.wonAge = g.status === 'won' ? this.wonAge + dt : 0;
    // Blend from carrying on along the old heading to the simulated path: the drawn path is a curve that leaves the
    // old straight and joins the new one at running speed.
    const k = Math.min(1, turn.age / turn.span), ease = k * k * (3 - 2 * k), ahead = { x: turn.x + Math.sin(turn.from) * turn.run, z: turn.z + Math.cos(turn.from) * turn.run };
    const p = k < 1 ? { x: ahead.x + (sim.x - ahead.x) * ease, z: ahead.z + (sim.z - ahead.z) * ease } : sim;
    if (k < 1) this.yaw = turn.from + Math.atan2(Math.sin(target - turn.from), Math.cos(target - turn.from)) * ease;
    else this.yaw += Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw)) * (1 - Math.exp(-dt * 9));
    this.course();
    this.animate(this.runner, g.status === 'running' ? dt : dt * 0.3, g.speed);
    // The whole body banks into the turn from the feet, so the run cycle never changes clip mid-stride.
    const bank = k < 1 ? -turn.dir * 0.24 * Math.sin(Math.PI * k) : 0;
    this.hero.position.set(p.x, g.y, p.z);this.hero.rotation.set(0, this.yaw, bank, 'YXZ');
    this.shield.visible = g.power.shield > 0;this.shield.position.y = 0.95;
    this.shadow.position.set(p.x, 0.02, p.z);this.shadow.scale.setScalar(Math.max(0.4, 1 - g.y * 0.25));this.shadow.visible = g.grounded || g.y > -0.2;
    if (this.chaser) {
      const c = Math.max(0.6, g.chaser), show = g.settings.chaser !== 'none' && c < 13 && g.status !== 'won';this.chaserGroup.visible = show;
      if (show) { this.animate(this.chaser, g.status === 'running' ? dt : 0, g.speed, true);this.chaserGroup.position.set(p.x - f[0] * c, 0, p.z - f[1] * c);this.chaserGroup.rotation.set(0, this.yaw, 0); }
    }
    feel.ratio = Math.min(1.2, g.speed / Math.max(1, g.settings.maxSpeed));feel.boosting = g.power.boost > 0;
    const cf = [Math.sin(this.yaw), Math.cos(this.yaw)], lateralFollow = g.x * 0.45, l = leftOf(g.heading);
    if (g.status === 'won') {
      // The camera swings round to face the runner as they celebrate.
      const k = Math.min(1, this.wonAge / 1.4), a = this.yaw + Math.PI * (k * k * (3 - 2 * k)), r = 4.2 - k * 0.8;
      this.cameraPos.set(p.x - Math.sin(a) * r, 2.2 - k * 0.6, p.z - Math.cos(a) * r);this.look.set(p.x, 1.05, p.z);
    } else {
      const desired = new T.Vector3(p.x - cf[0] * (4.6 + feel.ratio * 0.6) - l[0] * (g.x - lateralFollow), 2.5 + g.y * 0.35, p.z - cf[1] * (4.6 + feel.ratio * 0.6) - l[1] * (g.x - lateralFollow));
      this.cameraPos.lerp(desired, 1 - Math.exp(-dt * 10));this.look.lerp(new T.Vector3(p.x + cf[0] * 7, 1.1 + g.y * 0.4, p.z + cf[1] * 7), 1 - Math.exp(-dt * 12));
    }
    const shake = feel.offset(this.time);this.camera.position.set(this.cameraPos.x + shake.x, this.cameraPos.y + shake.y, this.cameraPos.z + shake.z);this.camera.lookAt(this.look);
    this.camera.fov = feel.fov(62);this.camera.aspect = aspect;this.camera.updateProjectionMatrix();
    this.sun.position.set(p.x - 15, 40, p.z + 10);this.sun.target.position.set(p.x, 0, p.z);this.below.position.x = p.x;this.below.position.z = p.z;
    // The lantern pool sits a little ahead of the runner, on the floor.
    if (this.lantern) { this.lantern.position.set(p.x + cf[0] * 2.5, 0.03, p.z + cf[1] * 2.5);this.lantern.rotation.y = this.yaw;this.lantern.visible = g.y > -0.5; }
    this.weather?.update(this.time, this.camera.position);
  }
  reset() { this.phase = 0;this.wonAge = 0;this.turn.age = 9;this.snapCamera(); }
  dispose() {
    for (const actor of [this.runner, this.chaser]) if (actor) { actor.render.group.removeFromParent();actor.dispose(); }
    for (const d of this.disposables) d.dispose();this.weather?.dispose();this.scene.clear();
  }
}
