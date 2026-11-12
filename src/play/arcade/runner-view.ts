/**
 * The runner scene. Every repeated thing (floor tiles, edges, pillars, obstacles, coins, power-ups) is one batched
 * mesh refilled from the simulation each frame, so a long run draws in a few calls and allocates nothing. The hero
 * runs, jumps, slides, leans into turns and stumbles with Ara clips; the chaser follows behind.
 */
import * as T from 'three';
import { clipById } from '../../core/anim/clips';
import type { GameActor } from '../actor';
import { forwardOf, leftOf, LANE, RUN, type RunnerEvent, type RunnerGame, type RunnerSegment } from './runner';
import type { RunnerTheme } from './modes';
import type { SpeedFeel } from './feel';

const PATH = LANE * 3 + 1.2;
const THEME: Record<RunnerTheme, { sky: string; fog: [number, number]; floor: [string, string]; edge: string; decor: string; below: string; low: string; block: string }> = {
  'temple-ruins': { sky: '#a7bea6', fog: [35, 160], floor: ['#aaa189', '#988f78'], edge: '#6f6a58', decor: '#a0977f', below: '#3d5a37', low: '#6f5034', block: '#8a8370' },
  'city-rooftops': { sky: '#bccad6', fog: [40, 190], floor: ['#80848b', '#72767d'], edge: '#d3cfc5', decor: '#b5b7b3', below: '#4a5562', low: '#c0632d', block: '#5d6670' },
  'desert-canyon': { sky: '#e6cda3', fog: [40, 170], floor: ['#cfa36b', '#c0945e'], edge: '#9b6a42', decor: '#a8683f', below: '#8a5a37', low: '#7b5532', block: '#9a6b47' },
};
const POWER_COLORS = { magnet: '#d8473d', shield: '#3d8ad8', boost: '#f0a02d', multiplier: '#3fae63' } as const;

export class RunnerView {
  readonly scene = new T.Scene(); readonly camera = new T.PerspectiveCamera(64, 1, 0.1, 400);
  private floor: T.InstancedMesh; private edges: T.InstancedMesh; private decor: T.InstancedMesh; private walls: T.InstancedMesh;
  private low: T.InstancedMesh; private beams: T.InstancedMesh; private blocks: T.InstancedMesh; private carts: T.InstancedMesh; private wheels: T.InstancedMesh;
  private coins: T.InstancedMesh; private powers: T.InstancedMesh; private shadow: T.Mesh; private shield: T.Mesh; private below: T.Mesh;
  private hero = new T.Group(); private chaserGroup = new T.Group(); private sun: T.DirectionalLight;
  private o = new T.Object3D(); private color = new T.Color(); private time = 0; private phase = 0; private chasePhase = 0;
  private yaw = 0; private cameraPos = new T.Vector3(); private look = new T.Vector3(); private disposables: { dispose(): void }[] = [];
  constructor(readonly game: RunnerGame, readonly runner: GameActor, readonly chaser?: GameActor) {
    const theme = THEME[game.settings.theme], mat = (color: string, rough = 0.9, extra: T.MeshStandardMaterialParameters = {}) => { const m = new T.MeshStandardMaterial({ color, roughness: rough, ...extra });this.disposables.push(m);return m; };
    const batch = (geometry: T.BufferGeometry, material: T.Material, count: number, shadow = true) => { const m = new T.InstancedMesh(geometry, material, count);m.count = 0;m.castShadow = shadow;m.receiveShadow = true;m.frustumCulled = false;this.scene.add(m);this.disposables.push(geometry);return m; };
    this.scene.background = new T.Color(theme.sky);this.scene.fog = new T.Fog(theme.sky, theme.fog[0], theme.fog[1]);
    this.scene.add(new T.HemisphereLight('#fff5e6', theme.below, 1.5));
    this.sun = new T.DirectionalLight('#fff1d8', 2.4);this.sun.castShadow = true;this.sun.shadow.mapSize.set(1024, 1024);Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });this.sun.shadow.normalBias = 0.03;this.scene.add(this.sun, this.sun.target);
    this.floor = batch(new T.BoxGeometry(1, 1, 1).translate(0, -0.5, 0), mat('#ffffff', 0.95), 260, false);
    this.edges = batch(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat(theme.edge, 0.9), 520);
    const decorGeometry = game.settings.theme === 'temple-ruins' ? new T.CylinderGeometry(0.45, 0.55, 1, 10).translate(0, 0.5, 0) : new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.decor = batch(decorGeometry, mat(theme.decor, 0.95), 320);this.walls = batch(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat(theme.edge, 0.9), 24);
    this.low = batch(new T.BoxGeometry(LANE * 0.92, 0.7, 0.5).translate(0, 0.35, 0), mat(theme.low, 0.85), 60);
    this.beams = batch(new T.BoxGeometry(1, 1, 1), mat('#5b4a3a', 0.8), 120);
    this.blocks = batch(new T.BoxGeometry(LANE * 0.9, 2.6, 1.4).translate(0, 1.3, 0), mat(theme.block, 0.95), 60);
    this.carts = batch(new T.BoxGeometry(1.4, 1.15, 2.2).translate(0, 0.85, 0), mat('#6b4a2c', 0.7, { metalness: 0.2 }), 20);
    this.wheels = batch(new T.CylinderGeometry(0.3, 0.3, 0.16, 12).rotateZ(Math.PI / 2), mat('#2c2c2e', 0.5, { metalness: 0.6 }), 80);
    this.coins = batch(new T.CylinderGeometry(0.3, 0.3, 0.07, 18).rotateX(Math.PI / 2), mat('#f2c23c', 0.25, { metalness: 0.85, emissive: '#6b4c08', emissiveIntensity: 0.4 }), 420, false);
    this.powers = batch(new T.IcosahedronGeometry(0.42, 0), mat('#ffffff', 0.3, { emissive: '#222222' }), 24, false);
    this.below = new T.Mesh(new T.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), mat(theme.below, 1));this.below.position.y = game.settings.theme === 'city-rooftops' ? -40 : -18;this.scene.add(this.below);this.disposables.push(this.below.geometry);
    this.shadow = new T.Mesh(new T.CircleGeometry(0.45, 20).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.3, depthWrite: false }));this.scene.add(this.shadow);this.disposables.push(this.shadow.geometry, this.shadow.material as T.Material);
    this.shield = new T.Mesh(new T.SphereGeometry(1.15, 24, 16), new T.MeshBasicMaterial({ color: '#7fc4ff', transparent: true, opacity: 0.18, depthWrite: false }));this.disposables.push(this.shield.geometry, this.shield.material as T.Material);
    this.hero.add(runner.render.group, this.shield);this.scene.add(this.hero);runner.render.mesh.castShadow = true;
    if (chaser) { this.chaserGroup.add(chaser.render.group);this.scene.add(this.chaserGroup);chaser.render.mesh.castShadow = true; }
    this.snapCamera();
  }
  private snapCamera() { const p = this.game.position, f = forwardOf(this.game.heading);this.yaw = this.game.heading * Math.PI / 2;this.cameraPos.set(p.x - f[0] * 5, 2.8, p.z - f[1] * 5);this.look.set(p.x + f[0] * 6, 1.1, p.z + f[1] * 6); }
  events(list: RunnerEvent[], feel: SpeedFeel) {
    for (const e of list) {
      if (e.type === 'rebase') { this.cameraPos.x += e.dx;this.cameraPos.z += e.dz;this.look.x += e.dx;this.look.z += e.dz; }
      if (e.type === 'stumble') feel.shake(0.55);
      if (e.type === 'crash' || e.type === 'caught') feel.shake(1);
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
    for (const m of [this.floor, this.edges, this.decor, this.walls, this.low, this.beams, this.blocks, this.carts, this.wheels, this.coins, this.powers]) m.count = 0;
    const visible = [...g.segments, ...g.branches];
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
        for (let e = from; e < end - 0.01; e += 4) { const len = Math.min(4, end - e);if (cuts.some(([a, b]) => e + len > a && e < b)) continue;this.put(this.edges, s, e + len / 2, side * (PATH / 2 + 0.15), 0, 0.3, 0.45, len); }
        for (let e = Math.ceil(from / 7) * 7; e < end - 1; e += 7) {
          if (cuts.some(([a, b]) => e > a - 1 && e < b + 1)) continue;const h = g.settings.theme === 'desert-canyon' ? 7 + ((s.decor >> (e % 13)) % 6) : g.settings.theme === 'temple-ruins' ? 3.2 + ((s.decor >> (e % 11)) % 3) * 0.6 : 0.9 + ((s.decor >> (e % 7)) % 3) * 0.5;
          const off = g.settings.theme === 'desert-canyon' ? PATH / 2 + 2.2 : PATH / 2 + 1, size = g.settings.theme === 'desert-canyon' ? 3.5 : g.settings.theme === 'temple-ruins' ? 1 : 1.6;
          this.put(this.decor, s, e, side * off, 0, size, h, size);
        }
      }
      this.put(this.walls, s, s.length + PATH / 2 + 0.3, 0, -0.3, PATH + 0.6, s.end === 'junction' ? 3.4 : 2.6, 0.6);
      for (const t of s.things) {
        if (t.hit && t.kind !== 'gap') continue;
        const lanes = [-1, 0, 1].filter((_, i) => t.lanes & (1 << i));
        if (t.kind === 'barrier-low') for (const l of lanes) this.put(this.low, s, t.d + 0.25, l * LANE, 0, 1, 1, 1);
        if (t.kind === 'bar-high') { this.put(this.beams, s, t.d + 0.25, 0, 1.38, PATH, 0.32, 0.32);for (const side of [-1, 1]) this.put(this.beams, s, t.d + 0.25, side * (PATH / 2 - 0.1), 0.75, 0.22, 1.5, 0.22); }
        if (t.kind === 'blocker') for (const l of lanes) this.put(this.blocks, s, t.d + t.length / 2, l * LANE, 0, 1, 1, 1);
        if (t.kind === 'cart') for (const l of lanes) { this.put(this.carts, s, t.d + 1.1, l * LANE, 0, 1, 1, 1);for (const [x, z] of [[-0.75, 0.6], [0.75, 0.6], [-0.75, 1.6], [0.75, 1.6]]) this.put(this.wheels, s, t.d + z, l * LANE + x, 0.3, 1, 1, 1); }
      }
      for (const c of s.coins) if (!c.taken) this.put(this.coins, s, c.d, c.lane * LANE, c.y, 1, 1, 1, undefined, this.time * 4);
      for (const p of s.pickups) if (!p.taken) this.put(this.powers, s, p.d, p.lane * LANE, 1 + Math.sin(this.time * 3 + p.id) * 0.15, 1, 1, 1, this.color.set(POWER_COLORS[p.kind]), this.time * 1.5);
    });
    for (const m of [this.floor, this.edges, this.decor, this.walls, this.low, this.beams, this.blocks, this.carts, this.wheels, this.coins, this.powers]) { m.instanceMatrix.needsUpdate = true;if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  /** Choose the clip and its time for the runner's state. */
  private animate(actor: GameActor, dt: number, speed: number, chaser = false) {
    const g = this.game, run = clipById.get('run')!, rate = Math.min(1.9, 0.95 + speed / 28);
    let clip = run, t: number;
    if (chaser) { this.chasePhase += dt * rate;t = this.chasePhase % run.duration; }
    else {
      this.phase += dt * rate;t = this.phase % run.duration;
      if (g.status === 'ready') { clip = clipById.get('idle')!;t = this.time % clip.duration; }
      else if (g.status === 'down' || g.status === 'over') { clip = clipById.get('fall')!;t = Math.min(clip.duration - 0.01, g.downTime ?? 0); }
      else if (!g.grounded) { clip = clipById.get('jump_air')!;t = (this.phase * 0.6) % clip.duration; }
      else if (g.sliding > 0) { clip = clipById.get('run_slide')!;t = ((RUN.slide - g.sliding) / RUN.slide) * clip.duration * 0.85; }
      else if (g.recover > 0) { clip = clipById.get('stumble_recover')!;t = (1 - g.recover / 1.1) * clip.duration; }
      else if (Math.abs(g.turnLean) > 0.35) { clip = clipById.get(g.turnLean > 0 ? 'run_lean_left' : 'run_lean_right')!;t = this.phase % clip.duration; }
    }
    const frame = actor.render.animator.frame(clip, t, { rootMotion: false });
    actor.applyFrame(frame, { x: 0, y: 0, z: 0 }, 0);
  }
  update(dt: number, feel: SpeedFeel, aspect: number) {
    this.time += dt;const g = this.game, p = g.position, f = forwardOf(g.heading), target = g.heading * Math.PI / 2;
    // Turns swing the view smoothly; the simulation has already turned.
    this.yaw += Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw)) * (1 - Math.exp(-dt * 9));
    this.course();
    this.animate(this.runner, g.status === 'running' ? dt : dt * 0.3, g.speed);
    this.hero.position.set(p.x, g.y, p.z);this.hero.rotation.set(0, this.yaw, 0);
    this.shield.visible = g.power.shield > 0;this.shield.position.y = 0.95;
    this.shadow.position.set(p.x, 0.02, p.z);this.shadow.scale.setScalar(Math.max(0.4, 1 - g.y * 0.25));this.shadow.visible = g.grounded || g.y > -0.2;
    if (this.chaser) {
      const c = Math.max(0.6, g.chaser), show = g.settings.chaser !== 'none' && c < 13;this.chaserGroup.visible = show;
      if (show) { this.animate(this.chaser, g.status === 'running' ? dt : 0, g.speed, true);this.chaserGroup.position.set(p.x - f[0] * c, 0, p.z - f[1] * c);this.chaserGroup.rotation.set(0, this.yaw, 0); }
    }
    feel.ratio = Math.min(1.2, g.speed / Math.max(1, g.settings.maxSpeed));feel.boosting = g.power.boost > 0;
    const cf = [Math.sin(this.yaw), Math.cos(this.yaw)], lateralFollow = g.x * 0.45, l = leftOf(g.heading);
    const desired = new T.Vector3(p.x - cf[0] * (4.6 + feel.ratio * 0.6) - l[0] * (g.x - lateralFollow), 2.5 + g.y * 0.35, p.z - cf[1] * (4.6 + feel.ratio * 0.6) - l[1] * (g.x - lateralFollow));
    this.cameraPos.lerp(desired, 1 - Math.exp(-dt * 10));this.look.lerp(new T.Vector3(p.x + cf[0] * 7, 1.1 + g.y * 0.4, p.z + cf[1] * 7), 1 - Math.exp(-dt * 12));
    const shake = feel.offset(this.time);this.camera.position.set(this.cameraPos.x + shake.x, this.cameraPos.y + shake.y, this.cameraPos.z + shake.z);this.camera.lookAt(this.look);
    this.camera.fov = feel.fov(62);this.camera.aspect = aspect;this.camera.updateProjectionMatrix();
    this.sun.position.set(p.x - 15, 40, p.z + 10);this.sun.target.position.set(p.x, 0, p.z);this.below.position.x = p.x;this.below.position.z = p.z;
  }
  reset() { this.phase = 0;this.snapCamera(); }
  dispose() {
    for (const actor of [this.runner, this.chaser]) if (actor) { actor.render.group.removeFromParent();actor.dispose(); }
    for (const d of this.disposables) d.dispose();this.scene.clear();
  }
}
