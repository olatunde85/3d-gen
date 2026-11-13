/**
 * Endless runner rules: a seeded course of straights joined by corners and T-junctions, three lanes, jumps, slides
 * and turns, obstacles with a guaranteed way through, coins and power-ups, a chaser that closes after stumbles, and
 * scoring with multipliers, and the creator's objects to find, placed one at a time. Course pieces are generated ahead, recycled behind, and the world origin follows the run.
 */
import { seeded } from './race';
import type { RunnerObstacle, RunnerPowerUp, RunnerSettings } from './modes';

export const RUNNER_STEP = 1 / 120;
export const LANE = 1.8;
export const RUN = { jump: 7.4, gravity: 21, slide: 0.72, laneSpeed: 13, height: 1.8, slideHeight: 0.8 } as const;
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
export const forwardOf = (h: number) => DIRS[((h % 4) + 4) % 4];
/** Left is a quarter turn anticlockwise from forward, matching Ara's characters (+X is a character's left). */
export const leftOf = (h: number) => DIRS[(((h + 1) % 4) + 4) % 4];

export interface RunnerThing { id: number; kind: RunnerObstacle; d: number; lanes: number; length: number; moving: number; hit: boolean; passed: boolean }
export interface RunnerCoin { id: number; d: number; lane: number; y: number; taken: boolean }
export interface RunnerPickup { id: number; kind: RunnerPowerUp; d: number; lane: number; taken: boolean }
/** One piece of a creator's object (index into settings.objects) waiting on the course. */
export interface RunnerFind { id: number; item: number; d: number; lane: number; y: number; taken: boolean }
export interface RunnerSegment {
  id: number; x: number; z: number; heading: number; length: number; start: number; end: 'left' | 'right' | 'junction';
  things: RunnerThing[]; coins: RunnerCoin[]; pickups: RunnerPickup[]; finds: RunnerFind[]; gaps: [number, number][]; decor: number; branch?: 'left' | 'right';
}
export type RunnerEvent =
  | { type: 'jump' | 'slide' | 'lane' | 'turn' | 'coin' | 'stumble' | 'shield-break' | 'smash' | 'land' | 'mission' | 'goal' | 'revive' | 'caught' | 'fall' | 'crash' }
  | { type: 'power'; kind: RunnerPowerUp } | { type: 'find'; item: number; done: boolean; all: boolean } | { type: 'near-miss' } | { type: 'rebase'; dx: number; dz: number } | { type: 'speed-up'; speed: number };
export interface RunnerInput { left: boolean; right: boolean; jump: boolean; slide: boolean; tiltLane?: number }
export const MISSION_KINDS = ['coins', 'distance', 'jumps', 'slides', 'powers', 'score'] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];
export interface Mission { kind: MissionKind; target: number; label: string }
/** Each level's three missions; finishing all three raises the score multiplier. */
export function missionSet(level: number): Mission[] {
  const k = 1 + level * 0.6, kinds: MissionKind[][] = [['coins', 'distance', 'jumps'], ['slides', 'score', 'powers'], ['distance', 'coins', 'slides'], ['jumps', 'powers', 'score']];
  return kinds[level % kinds.length].map((kind) => {
    const target = Math.round({ coins: 120, distance: 800, jumps: 15, slides: 12, powers: 2, score: 4000 }[kind] * k);
    return { kind, target, label: { coins: `Collect ${target} coins in one run`, distance: `Run ${target} m`, jumps: `Jump ${target} times`, slides: `Slide ${target} times`, powers: `Use ${target} power-ups`, score: `Score ${target.toLocaleString()} in one run` }[kind] };
  });
}
export interface RunnerProfile { upgrades: Record<string, number>; missionLevel: number; missions: number[]; bank: number }

/** A free list of reusable records, so a long run creates no garbage per obstacle. */
class Pool<T> {
  private free: T[] = [];
  constructor(private make: () => T) {}
  get() { return this.free.pop() ?? this.make(); }
  release(items: T[]) { for (const item of items) this.free.push(item); items.length = 0; }
}

export class RunnerGame {
  status: 'ready' | 'running' | 'down' | 'over' | 'won' = 'ready';
  segments: RunnerSegment[] = []; branches: RunnerSegment[] = [];
  /** The straight just left and any branch not taken: drawn until the next corner so the floor never vanishes underfoot. */
  behind: RunnerSegment[] = [];
  /** Distance into the current segment, lateral lane position and height. */
  d = 0; lane = 0; x = 0; y = 0; vy = 0; sliding = 0; grounded = true; heading = 0; speed = 0; distance = 0; time = 0;
  coins = 0; score = 0; multiplier = 1; chaser = 14; stumbles = 0; lastStumble = -100; revives = 0; queuedTurn?: 'left' | 'right'; airborne = 0;
  power = { magnet: 0, shield: 0, boost: 0, multiplier: 0 }; stats = { jumps: 0, slides: 0, powers: 0 }; missionsDone: boolean[] = [false, false, false];
  events: RunnerEvent[] = []; downReason?: 'crash' | 'fall' | 'caught'; downTime = 0; goalReached = false; recover = 0; turnLean = 0;
  private random: () => number; private nextId = 1; private accumulator = 0; private recycle = new Pool<RunnerSegment>(() => ({ id: 0, x: 0, z: 0, heading: 0, length: 0, start: 0, end: 'left', things: [], coins: [], pickups: [], finds: [], gaps: [], decor: 0 }));
  private thingPool = new Pool<RunnerThing>(() => ({ id: 0, kind: 'barrier-low', d: 0, lanes: 0, length: 0, moving: 0, hit: false, passed: false }));
  private coinPool = new Pool<RunnerCoin>(() => ({ id: 0, d: 0, lane: 0, y: 0, taken: false }));
  private lastNearMiss = -10; private coyote = 0;
  /** Pieces found of each object, the piece on the course now, and where along the course the next may appear. */
  found: number[] = []; liveFind?: RunnerFind; private findSegment?: RunnerSegment; private nextFindAt = 0; private findRandom: () => number;
  constructor(readonly settings: RunnerSettings, readonly profile: RunnerProfile, readonly seed = settings.seed ?? 1) { this.random = seeded(seed);this.findRandom = seeded(seed + 7919);this.reset(); }
  get missions() { return missionSet(this.profile.missionLevel); }
  get current() { return this.segments[0]; }
  /** World position of the runner. */
  get position() { return this.worldAt(this.current, this.d, this.x); }
  worldAt(s: RunnerSegment, d: number, lateral: number) { const f = forwardOf(s.heading), l = leftOf(s.heading);return { x: s.x + f[0] * d + l[0] * lateral, z: s.z + f[1] * d + l[1] * lateral }; }
  reset(seed = this.seed) {
    this.random = seeded(seed);this.findRandom = seeded(seed + 7919);this.nextId = 1;
    for (const s of [...this.segments, ...this.branches, ...this.behind]) this.releaseSegment(s);
    this.segments = [];this.branches = [];this.behind = [];
    Object.assign(this, { status: 'ready', d: 4, lane: 0, x: 0, y: 0, vy: 0, sliding: 0, grounded: true, heading: 0, speed: this.settings.startSpeed, distance: 0, time: 0, coins: 0, score: 0, chaser: 6, stumbles: 0, lastStumble: -100, revives: 0, queuedTurn: undefined, airborne: 0, downReason: undefined, goalReached: false, recover: 0, turnLean: 0, accumulator: 0, events: [], lastNearMiss: -10 });
    this.power = { magnet: 0, shield: 0, boost: 0, multiplier: 0 };this.stats = { jumps: 0, slides: 0, powers: 0 };this.missionsDone = this.profile.missions.map(Boolean);this.multiplier = 1 + this.profile.missionLevel;
    this.found = (this.settings.objects ?? []).map(() => 0);this.liveFind = undefined;this.findSegment = undefined;this.nextFindAt = 0;
    this.segments.push(this.makeSegment(0, 0, 0, 0, true));this.fill();
  }
  start() { if (this.status === 'ready') this.status = 'running'; }
  update(dt: number, input: RunnerInput, scale = 1) {
    if (this.status === 'down' || this.status === 'over') this.downTime += dt;
    this.accumulator = Math.min(0.25, this.accumulator + dt * scale);
    while (this.accumulator >= RUNNER_STEP) { this.step(RUNNER_STEP, input);this.accumulator -= RUNNER_STEP;input = { left: false, right: false, jump: false, slide: input.slide && this.sliding > 0, tiltLane: input.tiltLane }; }
  }
  /** Base speed rises with distance; a boost adds a burst on top. */
  baseSpeed() {
    const s = this.settings, f = s.speedRamp === 'gentle' ? 1 - Math.exp(-this.distance / 4000) : Math.min(1, this.distance / (s.speedRamp === 'steady' ? 2600 : 1300));
    return s.startSpeed + (s.maxSpeed - s.startSpeed) * f;
  }
  duration(kind: RunnerPowerUp) { return { magnet: 10, shield: 12, boost: 5, multiplier: 15 }[kind] + 2 * (this.profile.upgrades[kind] ?? 0); }
  private step(dt: number, input: RunnerInput) {
    if (this.status !== 'running') return;
    this.time += dt;
    for (const key of Object.keys(this.power) as RunnerPowerUp[]) this.power[key] = Math.max(0, this.power[key] - dt);
    this.recover = Math.max(0, this.recover - dt);this.turnLean *= Math.exp(-dt * 5);
    const target = this.baseSpeed() * (this.power.boost > 0 ? 1.55 : 1) * (this.recover > 0 ? 0.72 : 1), before = Math.floor(this.speed / 2);
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 2.5));
    if (Math.floor(this.speed / 2) > before && this.power.boost <= 0 && this.speed > this.settings.startSpeed + 2) this.events.push({ type: 'speed-up', speed: this.speed });
    this.controls(input);
    // Vertical motion: jumps arc over low obstacles and gaps; sliding while airborne pulls the runner down.
    if (!this.grounded) { this.vy -= RUN.gravity * dt * (input.slide ? 2.2 : 1);this.y += this.vy * dt;this.airborne += dt; if (this.y <= 0 && !this.overGap()) { this.y = 0;this.vy = 0;this.grounded = true;this.events.push({ type: 'land' });if (input.slide) this.beginSlide(); } }
    this.sliding = Math.max(0, this.sliding - dt);
    const targetX = this.lane * LANE;this.x += Math.sign(targetX - this.x) * Math.min(Math.abs(targetX - this.x), RUN.laneSpeed * dt);
    const advance = this.speed * dt;this.d += advance;this.distance += advance;
    const mult = this.multiplier * (this.power.multiplier > 0 ? 2 : 1);this.score += advance * mult;
    this.chaser = Math.min(16, this.chaser + dt * (this.time - this.lastStumble > 2 ? 0.9 : 0));
    this.corner();
    if (this.status !== 'running') return;
    this.collide(dt);
    this.collect();this.placeFind();
    // Carts roll toward the runner once they are 45 m ahead, so they meet in the slot reserved for them.
    for (const t of this.current.things) if (t.moving && !t.hit && t.d - this.d < 45) t.d -= t.moving * dt;
    this.progressMissions();
    this.fill();this.rebase();
  }
  private controls(input: RunnerInput) {
    const s = this.current, toCorner = s.length - this.d, window = 7 + this.speed * 0.12;
    for (const side of ['left', 'right'] as const) {
      if (!input[side]) continue;
      // Near a corner, sideways input turns; elsewhere it changes lane.
      if (toCorner < window && (s.end === side || s.end === 'junction')) { this.queuedTurn = side;continue; }
      const next = this.lane + (side === 'left' ? 1 : -1);
      if (Math.abs(next) <= 1) { this.lane = next;this.events.push({ type: 'lane' }); }
    }
    if (input.tiltLane !== undefined && Math.abs(input.tiltLane) <= 1 && input.tiltLane !== this.lane) { this.lane = input.tiltLane;this.events.push({ type: 'lane' }); }
    if (input.jump && this.grounded) { this.grounded = false;this.vy = RUN.jump;this.y = 0.001;this.airborne = 0;this.sliding = 0;this.stats.jumps++;this.events.push({ type: 'jump' }); }
    if (input.slide && this.grounded && this.sliding <= 0) this.beginSlide();
  }
  private beginSlide() { this.sliding = RUN.slide;this.stats.slides++;this.events.push({ type: 'slide' }); }
  private overGap() { const d = this.d;return this.current.gaps.some(([a, b]) => d > a + 0.25 && d < b - 0.25); }
  /** At the corner the queued turn carries the runner onto the next straight; without it they hit the wall. */
  private corner() {
    const s = this.current;if (this.d < s.length) return;
    const turn = this.queuedTurn;
    if (!turn && this.d > s.length + 0.8) { this.down('crash');return; }
    if (!turn) return;
    const next = s.end === 'junction' ? this.branches.find((b) => b.branch === turn) : this.segments[1];
    if (!next) return;
    for (const b of this.behind) this.releaseSegment(b);this.behind = [];
    if (s.end === 'junction') { for (const b of this.branches) if (b !== next) this.behind.push(b);this.branches = [];this.segments.splice(1, this.segments.length - 1, next);next.branch = undefined; }
    this.d -= s.length;this.heading = next.heading;this.queuedTurn = undefined;this.turnLean = turn === 'left' ? 1 : -1;
    this.behind.push(this.segments.shift()!);
    this.events.push({ type: 'turn' });this.fill();
  }
  private hitBox(t: RunnerThing) {
    const lanes = [-1, 0, 1].filter((_, i) => t.lanes & (1 << i)).map((l) => l * LANE), inLane = lanes.some((x) => Math.abs(x - this.x) < LANE * 0.62);
    return inLane && this.d + 0.3 > t.d && this.d - 0.3 < t.d + t.length;
  }
  private collide(dt: number) {
    const s = this.current, height = this.sliding > 0 ? RUN.slideHeight : RUN.height;
    // Gaps: a short grace keeps a jump pressed at the edge fair.
    if (this.grounded && this.overGap()) { this.coyote += dt;if (this.coyote > 0.08) { this.grounded = false;this.vy = -2;this.down('fall');return; } } else this.coyote = 0;
    if (this.y < -1.2) { this.down('fall');return; }
    for (const t of s.things) {
      if (t.hit) continue;
      if (!t.passed && this.d - 0.3 > t.d + t.length) { t.passed = true;this.nearMiss(t, height); }
      if (!this.hitBox(t)) continue;
      const clear = t.kind === 'barrier-low' ? this.y > 0.72 : t.kind === 'bar-high' ? height < 1.15 : t.kind === 'gap' ? true : this.y > 2.2;
      if (clear) continue;
      t.hit = true;
      if (this.power.boost > 0) { this.events.push({ type: 'smash' });continue; }
      if (t.kind === 'barrier-low' || t.kind === 'bar-high') { this.stumble();continue; }
      if (this.power.shield > 0) { this.power.shield = 0;this.events.push({ type: 'shield-break' });continue; }
      this.down('crash');return;
    }
  }
  private nearMiss(t: RunnerThing, height: number) {
    if (this.time - this.lastNearMiss < 3) return;
    const lanes = [-1, 0, 1].filter((_, i) => t.lanes & (1 << i)).map((l) => l * LANE), side = Math.min(...lanes.map((x) => Math.abs(x - this.x)));
    const close = t.kind === 'barrier-low' ? this.y > 0.72 && this.y < 1 : t.kind === 'bar-high' ? height < 1.15 && side < LANE * 0.6 : (t.kind === 'blocker' || t.kind === 'cart') && side > LANE * 0.62 && side < LANE * 0.95;
    if (close) { this.lastNearMiss = this.time;this.events.push({ type: 'near-miss' }); }
  }
  private stumble() {
    this.events.push({ type: 'stumble' });this.recover = 1.1;this.stumbles++;
    const chased = this.settings.chaser !== 'none';
    if (chased && this.time - this.lastStumble < 9) { this.lastStumble = this.time;this.chaser = 0.6;this.down('caught');return; }
    this.lastStumble = this.time;if (chased) this.chaser = 2.4;
  }
  private down(reason: 'crash' | 'fall' | 'caught') {
    if (this.status !== 'running') return;
    this.status = 'down';this.downReason = reason;this.downTime = 0;this.speed = 0;this.events.push({ type: reason });
  }
  /** Coins cost doubles with each revive in the same run. */
  reviveCost() { return 100 * 2 ** this.revives; }
  canRevive(bank: number) { return this.settings.revive && this.status === 'down' && bank + this.coins >= this.reviveCost(); }
  /** Continue from a safe point at the start of the next clear stretch, briefly shielded. */
  revive() {
    if (this.status !== 'down') return 0;
    const cost = this.reviveCost();this.revives++;this.status = 'running';this.downReason = undefined;
    const s = this.current, ahead = s.things.filter((t) => t.d + t.length > this.d - 1);
    for (const t of ahead) if (t.d < this.d + 14) t.hit = true;
    if (this.d > s.length - 2) this.d = s.length - 2;
    s.gaps = s.gaps.filter(([a, b]) => b < this.d - 1 || a > this.d + 14);
    Object.assign(this, { y: 0, vy: 0, grounded: true, sliding: 0, speed: this.baseSpeed() * 0.7, chaser: 10, lastStumble: -100, queuedTurn: this.queuedTurn });
    this.power.shield = Math.max(this.power.shield, 3);this.events.push({ type: 'revive' });
    return cost;
  }
  /** Finish a run that cannot continue. */
  end() { if (this.status === 'down') this.status = 'over'; }
  private collect() {
    const s = this.current, magnet = this.power.magnet > 0;
    for (const c of s.coins) {
      if (c.taken) continue;const dd = c.d - this.d;
      const hit = magnet ? dd > -0.5 && dd < 7 && Math.abs(c.lane * LANE - this.x) < LANE * 1.8 : Math.abs(dd) < 0.7 && Math.abs(c.lane * LANE - this.x) < 0.9 && Math.abs(c.y - (this.y + 0.6)) < 1.1;
      if (hit) { c.taken = true;this.coins++;this.score += 10 * this.multiplier * (this.power.multiplier > 0 ? 2 : 1);this.events.push({ type: 'coin' }); }
    }
    for (const p of s.pickups) if (!p.taken && Math.abs(p.d - this.d) < 0.8 && Math.abs(p.lane * LANE - this.x) < 1) {
      p.taken = true;this.power[p.kind] = this.duration(p.kind);this.stats.powers++;this.events.push({ type: 'power', kind: p.kind });
    }
    const f = this.liveFind;
    if (f && this.findSegment === s) {
      const dd = f.d - this.d, side = Math.abs(f.lane * LANE - this.x);
      if (magnet ? dd > -0.5 && dd < 7 && side < LANE * 1.8 : Math.abs(dd) < 0.9 && side < 1) {
        f.taken = true;this.liveFind = undefined;this.found[f.item]++;this.score += 250 * this.multiplier * (this.power.multiplier > 0 ? 2 : 1);
        this.nextFindAt = s.start + this.d + 110 + this.findRandom() * 90;
        this.events.push({ type: 'find', item: f.item, done: this.found[f.item] >= this.settings.objects![f.item].count, all: this.allFound() });
      } else if (dd < -2) {
        // A missed object comes back a little further on.
        s.finds.splice(s.finds.indexOf(f), 1);this.liveFind = undefined;this.nextFindAt = s.start + this.d + 40;
      }
    }
  }
  allFound() { const list = this.settings.objects ?? [];return list.length > 0 && list.every((o, i) => this.found[i] >= o.count); }
  /**
   * Put the next piece on the course well ahead of the runner, in a lane clear of obstacles, gaps and carts. Objects
   * come in list order, so clues read as a story. Branches at a junction never carry one, so no turn loses it.
   */
  private placeFind() {
    const list = this.settings.objects;if (!list?.length || this.liveFind) return;
    const item = list.findIndex((o, i) => this.found[i] < o.count);if (item < 0) return;
    const at = Math.max(this.nextFindAt, this.current.start + this.d + 70);
    for (const s of this.segments) {
      if (s.start + s.length - 14 < at) continue;
      for (let d = Math.max(at - s.start, 16); d < s.length - 14; d += 3.5) {
        const lanes = [-1, 0, 1].filter((l) => !s.things.some((t) => t.lanes & (1 << (l + 1)) && (t.kind === 'cart' || (d > t.d - 3 && d < t.d + t.length + 3))) && !s.gaps.some(([a, b]) => d > a - 2 && d < b + 2));
        if (!lanes.length) continue;
        const lane = lanes[Math.floor(this.findRandom() * lanes.length)], find: RunnerFind = { id: this.nextId++, item, d, lane, y: 1, taken: false };
        for (const c of s.coins) if (c.lane === lane && Math.abs(c.d - d) < 1.6) c.taken = true;
        s.finds.push(find);this.liveFind = find;this.findSegment = s;return;
      }
    }
  }
  private progressMissions() {
    const values: Record<MissionKind, number> = { coins: this.coins, distance: this.distance, jumps: this.stats.jumps, slides: this.stats.slides, powers: this.stats.powers, score: this.score };
    this.missions.forEach((m, i) => { if (!this.missionsDone[i] && values[m.kind] >= m.target) { this.missionsDone[i] = true;this.events.push({ type: 'mission' }); } });
    if (this.missionsDone.every(Boolean)) { this.profile.missionLevel++;this.missionsDone = [false, false, false];this.multiplier = 1 + this.profile.missionLevel; }
    const g = this.settings.goal;
    const reached = g.type === 'objects' ? this.allFound() : g.type !== 'endless' && (g.type === 'distance' ? this.distance : g.type === 'coins' ? this.coins : this.score) >= g.target;
    if (!this.goalReached && reached) { this.goalReached = true;this.events.push({ type: 'goal' }); }
  }
  /** Mission progress inside a run, 0 to 1. */
  missionProgress(i: number) {
    const m = this.missions[i];if (this.missionsDone[i]) return 1;
    const v = { coins: this.coins, distance: this.distance, jumps: this.stats.jumps, slides: this.stats.slides, powers: this.stats.powers, score: this.score }[m.kind];
    return Math.min(1, v / m.target);
  }
  private releaseSegment(s: RunnerSegment) { this.thingPool.release(s.things);this.coinPool.release(s.coins);s.pickups.length = 0;s.finds.length = 0;s.gaps.length = 0;this.recycle.release([s]); }
  private fill() {
    let ahead = this.segments.reduce((sum, s) => sum + s.length, 0) - this.d;
    while (ahead < 180 && this.segments.at(-1)!.end !== 'junction') {
      const last = this.segments.at(-1)!, f = forwardOf(last.heading), turn = last.end === 'left' ? 1 : -1;
      const next = this.makeSegment(last.x + f[0] * last.length, last.z + f[1] * last.length, last.heading + turn, last.start + last.length);
      this.segments.push(next);ahead += next.length;
    }
    const last = this.segments.at(-1)!;
    if (last.end === 'junction' && !this.branches.length) {
      const f = forwardOf(last.heading), x = last.x + f[0] * last.length, z = last.z + f[1] * last.length;
      for (const side of ['left', 'right'] as const) { const b = this.makeSegment(x, z, last.heading + (side === 'left' ? 1 : -1), last.start + last.length);b.branch = side;this.branches.push(b); }
    }
  }
  /** Move the world back near the origin on long runs so float precision stays fine. */
  private rebase() {
    const p = this.position;if (Math.abs(p.x) < 600 && Math.abs(p.z) < 600) return;
    const dx = -Math.round(p.x), dz = -Math.round(p.z);
    for (const s of [...this.segments, ...this.branches, ...this.behind]) { s.x += dx;s.z += dz; }
    this.events.push({ type: 'rebase', dx, dz });
  }
  /** Difficulty rises with distance: shorter straights, tighter spacing and more combined obstacles. */
  private makeSegment(x: number, z: number, heading: number, start: number, first = false): RunnerSegment {
    const r = this.random, difficulty = Math.min(1, start / 3500), s = this.recycle.get();
    Object.assign(s, { id: this.nextId++, x, z, heading: ((heading % 4) + 4) % 4, length: Math.round(first ? 70 : 46 + r() * (70 - difficulty * 25)), start, end: r() < 0.22 + difficulty * 0.1 ? 'junction' : r() < 0.5 ? 'left' : 'right', decor: Math.floor(r() * 1e9), branch: undefined });
    const speed = this.settings.startSpeed + (this.settings.maxSpeed - this.settings.startSpeed) * difficulty, spacing = speed * (0.95 - difficulty * 0.35) + 7;
    let d = first ? 34 : 16;
    while (d < s.length - 14) {
      const kind = this.settings.obstacles[Math.floor(r() * this.settings.obstacles.length)];
      this.place(s, kind, d, difficulty);
      // Coins lead into the next obstacle, sometimes arcing over a jump.
      const lane = Math.floor(r() * 3) - 1, run = Math.floor(spacing / 2.6) - 1, thing = s.things.at(-1);
      for (let k = 1; k < run; k++) { const cd = d + (thing?.length ?? 0) + 1.5 + k * 2.6;if (cd > s.length - 6) break;if (s.things.some((t) => t.lanes & (1 << (lane + 1)) && cd > t.d - 1 && cd < t.d + t.length + 1) || s.gaps.some(([a, b]) => cd > a - 1 && cd < b + 1)) continue;this.addCoin(s, cd, lane, 0.9); }
      if (thing && (thing.kind === 'barrier-low' || thing.kind === 'gap') && r() < 0.5) for (let k = -2; k <= 2; k++) this.addCoin(s, thing.d + thing.length / 2 + k * 1.3, lane, 1.1 + 1.2 * (1 - (k / 2.5) ** 2));
      if (this.settings.powerUps.length && r() < 0.12) s.pickups.push({ id: this.nextId++, kind: this.settings.powerUps[Math.floor(r() * this.settings.powerUps.length)], d: d + spacing / 2, lane: Math.floor(r() * 3) - 1, taken: false });
      d += spacing * (0.85 + r() * 0.5);
    }
    return s;
  }
  private addCoin(s: RunnerSegment, d: number, lane: number, y: number) { const c = this.coinPool.get();Object.assign(c, { id: this.nextId++, d, lane, y, taken: false });s.coins.push(c); }
  /** Every obstacle leaves a way through: a free lane, a jump or a slide. */
  private place(s: RunnerSegment, kind: RunnerObstacle, d: number, difficulty: number) {
    const r = this.random, t = this.thingPool.get(), all = 0b111, oneLane = () => 1 << Math.floor(r() * 3), twoLanes = () => all & ~oneLane();
    const lanes = kind === 'bar-high' || kind === 'gap' ? all : kind === 'barrier-low' ? (r() < 0.4 + difficulty * 0.4 ? all : twoLanes()) : kind === 'cart' ? oneLane() : r() < 0.35 + difficulty * 0.35 ? twoLanes() : oneLane();
    Object.assign(t, { id: this.nextId++, kind, d, lanes, length: kind === 'gap' ? 2.6 + r() * difficulty * 1.4 : kind === 'cart' ? (this.settings.theme === 'train-yard' ? 6.5 : 2.2) : kind === 'blocker' ? 1.4 : 0.5, moving: kind === 'cart' ? 5 + difficulty * 4 : 0, hit: false, passed: false });
    if (kind === 'cart') { const v = this.settings.startSpeed + (this.settings.maxSpeed - this.settings.startSpeed) * difficulty;t.d += (t.moving * 45) / (v + t.moving); }
    if (kind === 'gap') s.gaps.push([t.d, t.d + t.length]);
    s.things.push(t);
  }
  drain() { const out = this.events;this.events = [];return out; }
}
