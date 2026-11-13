/**
 * Arcade race rules on a closed circuit: fixed-step handling with drift-charged boosts and nitro, forgiving wall
 * bounces, laps with sector splits, wrong-way detection, quick respawn, a field of AI racers following a racing line
 * with optional rubber-banding, pickups and best-lap ghost recording. Deterministic for a given seed and input.
 */
import { locate, resolveTrack, roadHeight, trackPoint, type Track, type TrackPosition } from './track';
import type { AiSkill, RaceCar, RaceSettings } from './modes';

export const RACE_STEP = 1 / 120;
export interface CarStats { top: number; accel: number; grip: number; turn: number; mass: number; radius: number; name: string }
/** Arcade handling per vehicle; speeds in metres per second. */
export const CAR_STATS: Record<RaceCar, CarStats> = {
  sports_car: { name: 'Sports car', top: 60, accel: 17, grip: 9, turn: 1.25, mass: 1, radius: 1.25 },
  suv: { name: 'SUV', top: 52, accel: 14, grip: 8, turn: 1.1, mass: 1.5, radius: 1.35 },
  pickup: { name: 'Pickup', top: 54, accel: 15, grip: 7.5, turn: 1.08, mass: 1.4, radius: 1.35 },
  motorcycle: { name: 'Motorcycle', top: 58, accel: 19, grip: 10, turn: 1.4, mass: 0.6, radius: 0.85 },
  muscle: { name: 'Muscle car', top: 63, accel: 18, grip: 7.5, turn: 1.12, mass: 1.2, radius: 1.3 },
  saloon: { name: 'Saloon', top: 55, accel: 15, grip: 8.5, turn: 1.18, mass: 1.1, radius: 1.3 },
  kart: { name: 'Go-kart', top: 50, accel: 20, grip: 11, turn: 1.55, mass: 0.5, radius: 0.85 },
  danfo: { name: 'Danfo', top: 47, accel: 12, grip: 7, turn: 1.0, mass: 1.7, radius: 1.45 },
  van: { name: 'Van', top: 48, accel: 12.5, grip: 7.5, turn: 1.0, mass: 1.7, radius: 1.45 },
  truck: { name: 'Box truck', top: 44, accel: 11, grip: 7, turn: 0.92, mass: 2.3, radius: 1.6 },
  scooter: { name: 'Scooter', top: 46, accel: 18, grip: 10, turn: 1.5, mass: 0.45, radius: 0.8 },
  quad: { name: 'Quad bike', top: 52, accel: 18, grip: 9.5, turn: 1.35, mass: 0.7, radius: 1.0 },
  keke: { name: 'Keke', top: 40, accel: 13, grip: 7.5, turn: 1.2, mass: 0.8, radius: 1.05 },
};
/** Pace is a share of the car's top speed, lateral the cornering grip the line is planned for, brake the deceleration
 * planned into each corner, ease how far the pack lifts when it leads the player, and nitro the meter level it fires at. */
const SKILL: Record<AiSkill, { pace: number; lateral: number; wobble: number; brake: number; ease: number; nitro: number }> = {
  easy: { pace: 0.84, lateral: 15, wobble: 0.6, brake: 24, ease: 0.09, nitro: 0.7 }, medium: { pace: 0.93, lateral: 18, wobble: 0.25, brake: 24, ease: 0.09, nitro: 0.7 },
  hard: { pace: 1, lateral: 21, wobble: 0, brake: 24, ease: 0.09, nitro: 0.3 }, expert: { pace: 1.07, lateral: 24.5, wobble: 0, brake: 29, ease: 0.025, nitro: 0.15 },
};
export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
export type RaceItem = 'boost' | 'oil' | 'nitro';
export interface RaceInput { throttle: number; steer: number; brake: boolean; drift: boolean; nitro: boolean; item: boolean; respawn: boolean }
export const idleInput = (): RaceInput => ({ throttle: 0, steer: 0, brake: false, drift: false, nitro: false, item: false, respawn: false });
export interface RaceCarState {
  id: string; driver: string; model: RaceCar; color: string; ai: boolean; stats: CarStats;
  x: number; z: number; y: number; vy: number; yaw: number; vx: number; vz: number; speed: number; steer: number;
  hint: number; s: number; progress: number; best: number; lap: number; lapStart: number; lapTimes: number[]; sectors: number[]; nextSector: number;
  drift: number; driftCharge: number; boost: number; nitro: number; nitroOn: boolean; spin: number; item?: RaceItem;
  wrongWay: number; stuck: number; respawning: number; slickImmune: number; ice: number; mud: number; finished?: number; lateralBias: number; distance: number; airborne: boolean; lastShortcut?: { x: number; z: number };
}
export type RaceEvent =
  | { type: 'beep'; count: number } | { type: 'go'; launch: boolean } | { type: 'wall' | 'bump' | 'land'; car: string; strength: number }
  | { type: 'boost' | 'pad' | 'spin' | 'respawn' | 'item' | 'oil' | 'nitro-empty'; car: string } | { type: 'drift-ready'; car: string; level: number }
  | { type: 'lap'; car: string; lap: number; time: number; best: boolean } | { type: 'sector'; car: string; sector: number; split: number; delta?: number }
  | { type: 'finish'; car: string; position: number } | { type: 'near-miss'; car: string };
export interface GhostFrame { t: number; x: number; z: number; yaw: number }

/** Small seeded generator, so a race and its daily challenge replay identically. */
export function seeded(seed: number) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class RaceGame {
  readonly track: Track;
  cars: RaceCarState[] = [];
  status: 'countdown' | 'racing' | 'finished' = 'countdown';
  time = 0; countdown = 3.6; events: RaceEvent[] = [];
  pads: { s: number; lateral: number }[]; items: { s: number; lateral: number; respawn: number }[]; slicks: { x: number; z: number; age: number; owner?: string }[] = [];
  bestLap?: number; bestGhost?: GhostFrame[]; ghost?: GhostFrame[]; private recording: GhostFrame[] = []; private lastRecord = -1;
  private limits = new Map<AiSkill, Float32Array>(); private random: () => number; private accumulator = 0; private launchWindow = 0; private nearMiss = -10;
  /** Best-lap sector splits, for live deltas. */
  bestSplits: number[] = [];
  /** Seconds already shown to the player: the player's finishing position and time. */
  result?: { position: number; time: number; bestLap: number };
  constructor(readonly settings: RaceSettings, readonly names: { player: string; drivers: string[] }, readonly seed = 1, ghost?: { lap: number; frames: GhostFrame[] }) {
    this.track = resolveTrack(settings.track);
    this.random = seeded(seed);
    this.pads = settings.pickups.includes('boost-pad') ? this.track.pads : [];
    this.items = settings.pickups.includes('item-box') ? this.track.items.map((p) => ({ ...p, respawn: 0 })) : [];
    if (settings.pickups.includes('hazard')) for (const h of this.track.hazards) { const p = trackPoint(this.track, h.s, h.lateral); this.slicks.push({ x: p.x, z: p.z, age: -Infinity }); }
    if (ghost && settings.ghost) { this.bestLap = ghost.lap; this.bestGhost = ghost.frames; this.ghost = ghost.frames; }
    this.reset();
  }
  get player() { return this.cars[0]; }
  /** Icy roads loosen every car's grip; the setting falls back to the theme's ground. */
  get icy() { return (this.settings.traction ?? this.track.ground.traction) === 'icy'; }
  /** Grid of two columns behind the start line; the player starts mid-pack. */
  reset() {
    const s = this.settings, total = s.opponents + 1, gridSlot = Math.min(total - 1, Math.floor(total / 2));
    const models: RaceCar[] = ['sports_car', 'muscle', 'suv', 'motorcycle', 'saloon', 'pickup', 'danfo', 'quad'], colors = ['#2d6fc8', '#e2b23a', '#3c9a5f', '#8a4fc0', '#e47b2d', '#ececec', '#2b2b30'];
    this.cars = [];this.status = 'countdown';this.countdown = 3.6;this.time = 0;this.events = [];this.accumulator = 0;this.result = undefined;this.recording = [];this.lastRecord = -1;this.ghost = this.bestGhost;
    this.slicks = this.slicks.filter((o) => o.age === -Infinity);for (const item of this.items) item.respawn = 0;
    const order = Array.from({ length: total }, (_, i) => i);
    order.splice(gridSlot, 0, ...order.splice(0, 1));
    order.forEach((who, slot) => {
      const ai = who > 0, model = ai ? models[(who - 1 + (s.car.model === 'sports_car' ? 1 : 0)) % models.length] : s.car.model;
      const back = -8 - slot * 7, lateral = (slot % 2 ? -1 : 1) * this.track.width * 0.2, p = trackPoint(this.track, back, lateral);
      this.cars[who] = {
        id: ai ? `ai-${who}` : 'player', driver: ai ? this.names.drivers[(who - 1) % Math.max(1, this.names.drivers.length)] ?? `Racer ${who}` : this.names.player, model, color: ai ? colors[(who - 1) % colors.length] : s.car.color, ai, stats: CAR_STATS[model],
        x: p.x, z: p.z, y: 0, vy: 0, yaw: p.yaw, vx: 0, vz: 0, speed: 0, steer: 0, hint: p.index, s: (back + this.track.length) % this.track.length, progress: back, best: back, lap: 0, lapStart: 0, lapTimes: [], sectors: [], nextSector: 1,
        drift: 0, driftCharge: 0, boost: 0, nitro: s.nitro ? 0.5 : 0, nitroOn: false, spin: 0, wrongWay: 0, stuck: 0, respawning: 0, slickImmune: 0, ice: 0, mud: 0, lateralBias: ai ? (this.random() - 0.5) * this.track.width * 0.25 : 0, distance: 0, airborne: false,
      };
    });
  }
  /** Fixed 120 Hz steps; `scale` slows time for effects without changing the physics step. */
  update(dt: number, input: RaceInput, scale = 1) {
    this.accumulator = Math.min(0.25, this.accumulator + dt * scale);
    while (this.accumulator >= RACE_STEP) { this.step(RACE_STEP, input); this.accumulator -= RACE_STEP; input = { ...input, respawn: false, item: false }; }
  }
  private step(dt: number, input: RaceInput) {
    if (this.status === 'countdown') {
      const before = Math.ceil(this.countdown);this.countdown -= dt;
      if (input.throttle > 0.3) this.launchWindow += dt; else this.launchWindow = 0;
      if (Math.ceil(this.countdown) !== before && this.countdown > 0) this.events.push({ type: 'beep', count: Math.ceil(this.countdown) });
      if (this.countdown <= 0) {
        // A launch boost rewards throttle pressed just before the light, not held through the whole countdown.
        const launch = this.launchWindow > 0 && this.launchWindow < 0.6;this.status = 'racing';this.events.push({ type: 'go', launch });
        if (launch) this.player.boost = 0.9;
        for (const car of this.cars) if (car.ai && this.random() < 0.6) car.boost = 0.4 + this.random() * 0.4;
      }
      return;
    }
    this.time += dt;
    for (const car of this.cars) {
      if (car.finished !== undefined && !car.ai) this.drive(car, dt, { ...idleInput(), throttle: 0.3, steer: this.autoSteer(car) });
      else this.drive(car, dt, car.ai || car.finished !== undefined ? this.aiInput(car) : input);
    }
    this.collideCars();
    for (const item of this.items) item.respawn = Math.max(0, item.respawn - dt);
    for (const slick of this.slicks) slick.age += dt;
    this.slicks = this.slicks.filter((o) => o.age < 20);
    this.recordGhost();
    if (this.player.finished !== undefined && this.status === 'racing') {
      this.status = 'finished';
      const order = this.standings(), position = order.indexOf(this.player) + 1;
      this.result = { position, time: this.player.finished, bestLap: Math.min(...this.player.lapTimes) };
    }
  }
  /** Race order: finished cars by time, then by distance covered. */
  standings() {
    return [...this.cars].sort((a, b) => (a.finished !== undefined || b.finished !== undefined ? (a.finished ?? Infinity) - (b.finished ?? Infinity) : b.best - a.best));
  }
  /** Finishing times for cars still racing, estimated from their remaining distance at their recent pace. */
  projectedTimes() {
    const total = this.settings.laps * this.track.length;
    return new Map(this.cars.map((c) => [c.id, c.finished ?? this.time + Math.max(0, total - c.best) / Math.max(18, (c.best + 40) / Math.max(1, this.time))]));
  }
  position(car: RaceCarState) { return this.standings().indexOf(car) + 1; }
  private drive(car: RaceCarState, dt: number, input: RaceInput) {
    const st = car.stats, fx = Math.sin(car.yaw), fz = Math.cos(car.yaw), lx = Math.cos(car.yaw), lz = -Math.sin(car.yaw);
    if (input.respawn && car.respawning <= 0) { this.respawn(car); return; }
    car.respawning = Math.max(0, car.respawning - dt);car.slickImmune = Math.max(0, car.slickImmune - dt);car.ice = Math.max(0, car.ice - dt);car.mud = Math.max(0, car.mud - dt);
    let vF = car.vx * fx + car.vz * fz, vL = car.vx * lx + car.vz * lz;
    const spinning = car.spin > 0;car.spin = Math.max(0, car.spin - dt);
    const throttle = spinning || car.airborne ? 0 : clamp(input.throttle, -1, 1), steerInput = spinning ? 0 : clamp(input.steer, -1, 1) * (car.airborne ? 0.3 : 1);
    car.steer += (steerInput - car.steer) * (1 - Math.exp(-dt * 7));
    // Drift: a held drift with steering at speed loosens grip and charges a boost released on exit.
    const canDrift = this.settings.handling === 'drift' && input.drift && Math.abs(steerInput) > 0.3 && vF > 14 && !car.airborne;
    if (canDrift) {
      if (!car.drift) car.drift = Math.sign(steerInput);
      const before = car.driftCharge;car.driftCharge += dt * (0.55 + Math.abs(steerInput) * 0.5);
      for (const level of [0.9, 2]) if (before < level && car.driftCharge >= level) this.events.push({ type: 'drift-ready', car: car.id, level: level < 1 ? 1 : 2 });
    } else if (car.drift) {
      if (car.driftCharge >= 0.9) { car.boost = Math.max(car.boost, car.driftCharge >= 2 ? 1.25 : 0.7);car.nitro = Math.min(1, car.nitro + (this.settings.nitro ? 0.12 : 0));this.events.push({ type: 'boost', car: car.id }); }
      car.drift = 0;car.driftCharge = 0;
    }
    const nitroOn = this.settings.nitro && input.nitro && car.nitro > 0 && !spinning;
    if (nitroOn) { car.nitro = Math.max(0, car.nitro - dt * 0.32);if (car.nitro === 0) this.events.push({ type: 'nitro-empty', car: car.id }); }
    else if (this.settings.nitro) car.nitro = Math.min(1, car.nitro + dt * 0.035);
    car.nitroOn = nitroOn;car.boost = Math.max(0, car.boost - dt);
    const surge = (car.boost > 0 ? 1.22 : 1) * (nitroOn ? 1.28 : 1), top = st.top * surge * (car.ai ? this.aiPace(car) : 1);
    if (input.brake && !canDrift && vF > 0.5) vF = Math.max(0, vF - 34 * dt);
    else if (throttle > 0) vF += (vF < top * throttle ? st.accel * surge * throttle * (1 - Math.max(0, vF) / (top * 1.08)) + (car.boost > 0 ? 6 : 0) : -9) * dt;
    else if (throttle < 0) vF = vF > 0.5 ? Math.max(0, vF - 30 * dt) : Math.max(-14, vF + st.accel * throttle * dt);
    vF -= (0.02 * vF + Math.sign(vF) * 0.6) * dt;if (Math.abs(vF) < 0.05 && !throttle) vF = 0;
    // Climbs pull cars back and descents speed them up; soft verges and mud drag.
    if (!car.airborne) { const slope = roadHeight(this.track, car.s), along = Math.sign(fx * this.track.samples[car.hint].tx + fz * this.track.samples[car.hint].tz);vF -= 9.8 * slope.grade * along * 0.55 * dt; }
    if (car.mud > 0 && vF > 12) vF -= vF * 1.5 * dt;
    if (car.drift) vF *= 1 - dt * 0.035;
    // Turning: strongest at middle speeds, softened at top speed; drifting turns tighter.
    const grip = (car.drift ? 1.7 : spinning ? 0.6 : st.grip) * (this.icy ? 0.42 : 1) * (car.ice > 0 ? 0.25 : 1), ratio = Math.abs(vF) / st.top;
    let yawRate = -car.steer * st.turn * 1.55 * Math.min(1, Math.abs(vF) / 10) * (1 - 0.3 * Math.min(1, ratio)) * Math.sign(vF || 1);
    if (car.drift) yawRate = yawRate * 1.3 - car.drift * 0.35;
    if (spinning) yawRate = 7 * (car.id.length % 2 ? 1 : -1);
    car.yaw = wrap(car.yaw + yawRate * dt);
    vL *= Math.exp(-grip * dt);
    const nfx = Math.sin(car.yaw), nfz = Math.cos(car.yaw), nlx = Math.cos(car.yaw), nlz = -Math.sin(car.yaw);
    // Velocity follows the new heading through grip, so a drift keeps sideways momentum.
    car.vx = nfx * vF + nlx * vL;car.vz = nfz * vF + nlz * vL;
    if (car.airborne) { car.vy -= 22 * dt;car.y += car.vy * dt;if (car.y <= 0) { car.y = 0;car.airborne = false;this.events.push({ type: 'land', car: car.id, strength: Math.abs(car.vy) });car.vy = 0; } }
    car.x += car.vx * dt;car.z += car.vz * dt;car.speed = vF;car.distance += Math.abs(vF) * dt;
    this.progress(car, this.contain(car), dt);
    this.features(car, input);
    // Stuck against something with the throttle down, or wrong way for long: return to the track.
    car.stuck = throttle > 0.4 && Math.abs(car.speed) < 1.5 && this.status === 'racing' ? car.stuck + dt : 0;
    if (car.stuck > 2.5 || (car.ai && car.wrongWay > 3)) this.respawn(car);
  }
  /** Walls bounce cars back without wrecking them; shortcuts are part of the road. */
  private contain(car: RaceCarState) {
    const t = this.track, pos = locate(t, car.x, car.z, car.hint), limit = t.width / 2 + t.ground.verge - car.stats.radius * 0.8;
    car.hint = pos.index;
    if (t.ground.verge && Math.abs(pos.lateral) > t.width / 2 + 0.4 && !pos.onShortcut) car.mud = Math.max(car.mud, 0.1);
    if (pos.onShortcut) { car.lastShortcut = { x: car.x, z: car.z };return pos; }
    if (car.lastShortcut && Math.abs(pos.lateral) > limit) {
      const back = car.lastShortcut, d = Math.hypot(car.x - back.x, car.z - back.z);
      if (d > 0.01) this.bounce(car, (back.x - car.x) / d, (back.z - car.z) / d, d);
      return pos;
    }
    car.lastShortcut = undefined;
    if (Math.abs(pos.lateral) > limit) {
      const s = t.samples[pos.index], side = Math.sign(pos.lateral), nx = -s.tz * side, nz = s.tx * side;
      this.bounce(car, nx, nz, Math.abs(pos.lateral) - limit);
    }
    return pos;
  }
  private bounce(car: RaceCarState, nx: number, nz: number, depth: number) {
    car.x += nx * depth;car.z += nz * depth;
    const vn = car.vx * nx + car.vz * nz;
    if (vn < 0) {
      car.vx -= 1.35 * vn * nx;car.vz -= 1.35 * vn * nz;
      const scrub = Math.min(0.35, -vn * 0.03);car.vx *= 1 - scrub;car.vz *= 1 - scrub;
      if (-vn > 3) this.events.push({ type: 'wall', car: car.id, strength: -vn });
      if (car.drift) { car.drift = 0;car.driftCharge = 0; }
    }
  }
  /** Unwrapped progress drives laps, sectors and wrong-way warnings. */
  private progress(car: RaceCarState, pos: TrackPosition, dt: number) {
    const t = this.track;
    let ds = pos.s - car.s;if (ds < -t.length / 2) ds += t.length;else if (ds > t.length / 2) ds -= t.length;
    car.s = pos.s;car.progress += ds;
    const tangent = t.samples[pos.index], along = car.vx * tangent.tx + car.vz * tangent.tz;
    car.wrongWay = along < -3 ? car.wrongWay + dt : Math.max(0, car.wrongWay - dt * 2);
    if (car.progress <= car.best || car.finished !== undefined) return;
    car.best = car.progress;
    // Sectors 1 and 2 end a third and two thirds of the way round; the third ends the lap.
    while (car.finished === undefined) {
      const k = car.nextSector, boundary = car.lap * t.length + (k * t.length) / 3;
      if (car.best < boundary) break;
      if (k < 3) {
        const split = this.time - car.lapStart, previous = !car.ai ? this.bestSplits[k - 1] : undefined;
        car.sectors[k - 1] = split;car.nextSector++;
        this.events.push({ type: 'sector', car: car.id, sector: k, split, ...(previous === undefined ? {} : { delta: split - previous }) });
      } else this.completeLap(car);
    }
  }
  private completeLap(car: RaceCarState) {
    const time = this.time - car.lapStart, best = !car.lapTimes.length || time < Math.min(...car.lapTimes);
    if (!car.ai) car.sectors = car.sectors.slice(0, 2);
    car.lapTimes.push(time);car.lap++;car.lapStart = this.time;car.nextSector = 1;car.sectors = [];
    if (!car.ai && (this.bestLap === undefined || time < this.bestLap)) { this.bestLap = time;this.bestGhost = this.recording.map((f) => ({ ...f }));this.bestSplits = [...car.sectors]; }
    if (!car.ai) { this.recording = [];this.lastRecord = -1;this.ghost = this.bestGhost; }
    this.events.push({ type: 'lap', car: car.id, lap: car.lap, time, best: !car.ai && best });
    if (car.lap >= this.settings.laps) { car.finished = this.time;this.events.push({ type: 'finish', car: car.id, position: this.cars.filter((c) => c.finished !== undefined).length }); }
  }
  /** The player's lap is sampled at 10 Hz from the lap start, which is all a ghost needs. */
  private recordGhost() {
    const p = this.player;if (p.finished !== undefined || p.progress < 0) return;
    const t = this.time - p.lapStart, frame = Math.floor(t * 10);
    if (frame > this.lastRecord) { this.lastRecord = frame;this.recording.push({ t, x: p.x, z: p.z, yaw: p.yaw }); }
  }
  /** Where the best-lap ghost is at this point of the player's current lap. */
  ghostPose() {
    const g = this.ghost;if (!g?.length || this.status !== 'racing' || this.player.finished !== undefined) return;
    const t = this.time - this.player.lapStart;if (t > g.at(-1)!.t) return;
    let i = Math.min(g.length - 2, Math.max(0, Math.floor(t * 10)));while (i > 0 && g[i].t > t) i--;while (i < g.length - 2 && g[i + 1].t < t) i++;
    const a = g[i], b = g[i + 1], f = clamp((t - a.t) / Math.max(1e-3, b.t - a.t), 0, 1);
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, yaw: a.yaw + wrap(b.yaw - a.yaw) * f };
  }
  private features(car: RaceCarState, input: RaceInput) {
    const t = this.track, near = (s: number, lateral: number, r: number) => { const p = trackPoint(t, s, lateral);return Math.hypot(p.x - car.x, p.z - car.z) < r; };
    for (const ramp of t.ramps) if (!car.airborne && car.speed > 12 && Math.abs(((car.s - ramp + t.length * 1.5) % t.length) - t.length / 2) > t.length / 2 - 1.2 && Math.abs(locate(t, car.x, car.z, car.hint).lateral) < t.width * 0.4) {
      car.airborne = true;car.vy = Math.min(9, car.speed * 0.17);car.y = 0.05;
    }
    for (const pad of this.pads) if (car.boost < 0.6 && near(pad.s, pad.lateral, 2.6)) { car.boost = 1.1;this.events.push({ type: 'pad', car: car.id }); }
    for (const box of this.items) if (!box.respawn && near(box.s, box.lateral, 2.2)) {
      box.respawn = 4;if (!car.item) { const roll = this.random();car.item = roll < 0.45 ? 'boost' : roll < 0.75 ? 'oil' : this.settings.nitro ? 'nitro' : 'boost';this.events.push({ type: 'item', car: car.id }); }
    }
    if (input.item && car.item) {
      if (car.item === 'boost') { car.boost = 1.5;this.events.push({ type: 'boost', car: car.id }); }
      else if (car.item === 'nitro') car.nitro = 1;
      else { this.slicks.push({ x: car.x - Math.sin(car.yaw) * 3.5, z: car.z - Math.cos(car.yaw) * 3.5, age: 0, owner: car.id });this.events.push({ type: 'oil', car: car.id }); }
      car.item = undefined;
    }
    for (const p of t.patches) if (!car.airborne && near(p.s, p.lateral, p.r)) { if (p.kind === 'ice') car.ice = 0.45;else car.mud = 0.35; }
    // One spin per slick crossing: the car slides clear before it can catch the oil again.
    for (const slick of this.slicks) if (car.slickImmune <= 0 && car.respawning <= 0 && slick.owner !== car.id && Math.hypot(slick.x - car.x, slick.z - car.z) < 1.9 && !car.airborne) {
      car.spin = 0.75;car.slickImmune = 2.5;car.vx *= 0.7;car.vz *= 0.7;car.drift = 0;car.driftCharge = 0;this.events.push({ type: 'spin', car: car.id });if (slick.age >= 0) slick.age = 20;
    }
  }
  private collideCars() {
    for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) {
      const a = this.cars[i], b = this.cars[j];if (a.respawning > 0 || b.respawning > 0 || a.airborne !== b.airborne) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.stats.radius + b.stats.radius;
      if (d >= min || d < 1e-6) { if (!a.ai !== !b.ai && d < min + 1 && Math.abs(this.player.speed) > 32 && this.player.finished === undefined && this.time - this.nearMiss > 2) { this.nearMiss = this.time;this.events.push({ type: 'near-miss', car: 'player' }); } continue; }
      const nx = dx / d, nz = dz / d, overlap = min - d, wa = b.stats.mass / (a.stats.mass + b.stats.mass), wb = 1 - wa;
      a.x -= nx * overlap * wa;a.z -= nz * overlap * wa;b.x += nx * overlap * wb;b.z += nz * overlap * wb;
      const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rel < 0) { const impulse = -1.4 * rel;a.vx -= nx * impulse * wa;a.vz -= nz * impulse * wa;b.vx += nx * impulse * wb;b.vz += nz * impulse * wb;if (-rel > 2.5) this.events.push({ type: 'bump', car: !a.ai || !b.ai ? 'player' : a.id, strength: -rel }); }
    }
  }
  respawn(car: RaceCarState) {
    const s = car.best >= 0 ? car.s : (car.progress + this.track.length) % this.track.length, sample = this.track.samples[Math.round(s / this.track.spacing) % this.track.samples.length], p = trackPoint(this.track, s, sample.line * 0.5);
    Object.assign(car, { x: p.x, z: p.z, y: 0, vy: 0, airborne: false, yaw: p.yaw, vx: Math.sin(p.yaw) * 10, vz: Math.cos(p.yaw) * 10, speed: 10, steer: 0, spin: 0, drift: 0, driftCharge: 0, stuck: 0, wrongWay: 0, respawning: 1.6, hint: p.index, lastShortcut: undefined });
    this.events.push({ type: 'respawn', car: car.id });
  }
  /** Rubber-banding keeps the pack close to the player without overtaking on pace alone. */
  private aiPace(car: RaceCarState) {
    const skill = SKILL[this.settings.aiSkill];if (!this.settings.rubberBand || car.finished !== undefined) return skill.pace;
    const gap = this.player.best - car.best;
    return skill.pace * (gap > 0 ? 1 + Math.min(0.12, gap / 350) : 1 - Math.min(skill.ease, -gap / 550));
  }
  /** Corner speed limits along the racing line, braking back from each corner. */
  private limitsFor(skill: AiSkill) {
    let limit = this.limits.get(skill);if (limit) return limit;
    const t = this.track, n = t.samples.length, lateral = SKILL[skill].lateral * (this.icy ? 0.6 : 1);limit = new Float32Array(n);
    for (let i = 0; i < n; i++) { let k = 0;for (let j = -3; j <= 3; j++) k += Math.abs(t.samples[(i + j + n) % n].curvature);limit[i] = Math.sqrt(lateral / Math.max(1e-4, k / 7)); }
    for (let pass = 0; pass < 2; pass++) for (let i = n - 1; i >= 0; i--) limit[i] = Math.min(limit[i], Math.sqrt(limit[(i + 1) % n] ** 2 + 2 * SKILL[skill].brake * t.spacing));
    this.limits.set(skill, limit);return limit;
  }
  private aiInput(car: RaceCarState): RaceInput {
    const t = this.track, n = t.samples.length, skill = SKILL[this.settings.aiSkill], v = Math.max(0, car.speed);
    const look = (car.hint + Math.round((7 + v * 0.42) / t.spacing)) % n, sample = t.samples[look];
    // Make room around a car ahead in the same part of the road.
    for (const other of this.cars) {
      if (other === car) continue;const ahead = other.best - car.best;
      if (ahead > 0 && ahead < 14) { const mine = locate(t, car.x, car.z, car.hint).lateral, theirs = locate(t, other.x, other.z, other.hint).lateral;if (Math.abs(mine - theirs) < 2.6) car.lateralBias += Math.sign(mine - theirs || 1) * 0.08; }
    }
    // Steer around oil seen on the road ahead.
    for (const slick of this.slicks) {
      const at = locate(t, slick.x, slick.z, (car.hint + 20) % n), ahead = (at.s - car.s + t.length) % t.length;
      if (ahead > 3 && ahead < 45) { const planned = sample.line + car.lateralBias;if (Math.abs(planned - at.lateral) < 3) car.lateralBias += Math.sign(planned - at.lateral || 1) * 0.12; }
    }
    car.lateralBias = clamp(car.lateralBias * 0.995, -t.width * 0.3, t.width * 0.3);
    const lateral = clamp(sample.line + car.lateralBias + Math.sin(this.time * 0.7 + car.id.length) * skill.wobble, -t.width * 0.38, t.width * 0.38);
    const target = trackPoint(t, sample.s, lateral), angle = wrap(Math.atan2(target.x - car.x, target.z - car.z) - car.yaw);
    const limits = this.limitsFor(this.settings.aiSkill), limit = limits[(car.hint + 3) % n] * (car.ai ? this.aiPace(car) / skill.pace : 1);
    const want = Math.min(car.stats.top * (car.ai ? this.aiPace(car) : 0.7), limit), straight = limits[(car.hint + 40) % n] > car.stats.top;
    return {
      throttle: car.speed < want ? 1 : car.speed > want + 4 ? -1 : 0.3, steer: clamp(-angle * 2.4, -1, 1), brake: car.speed > want + 6, drift: false,
      nitro: straight && car.nitro > skill.nitro && car.speed > 25, item: !!car.item && (car.item !== 'oil' || this.cars.some((c) => c !== car && car.best - c.best > 0 && car.best - c.best < 12)), respawn: false,
    };
  }
  /** After the flag, a finished player car cruises along the racing line. */
  private autoSteer(car: RaceCarState) { return this.aiInput(car).steer; }
  drain() { const out = this.events;this.events = [];return out; }
}
