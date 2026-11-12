/**
 * Game modes beside the staged mission: an arcade race and an endless runner. Each mode keeps the shared cast,
 * music and campaign chapters, and brings its own rules, camera, HUD and level generation.
 */
import { parseTrack, type CustomTrack } from './track';

export type PlayMode = 'mission' | 'race' | 'runner';
export const PLAY_MODES: readonly PlayMode[] = ['mission', 'race', 'runner'];
export const parseMode = (raw: unknown): PlayMode => {
  if (raw === undefined) return 'mission';
  if (!PLAY_MODES.includes(raw as PlayMode)) throw Error('Choose a game mode: mission, race or runner.');
  return raw as PlayMode;
};

export type RaceCar = 'sports_car' | 'muscle' | 'saloon' | 'kart' | 'suv' | 'pickup' | 'danfo' | 'van' | 'truck' | 'motorcycle' | 'scooter' | 'quad' | 'keke';
export const RACE_CARS: readonly RaceCar[] = ['sports_car', 'muscle', 'saloon', 'kart', 'suv', 'pickup', 'danfo', 'van', 'truck', 'motorcycle', 'scooter', 'quad', 'keke'];
export type RacePickup = 'boost-pad' | 'item-box' | 'hazard';
export const RACE_PICKUPS: readonly RacePickup[] = ['boost-pad', 'item-box', 'hazard'];
export type AiSkill = 'easy' | 'medium' | 'hard';
export interface RaceSettings {
  track: string | CustomTrack; laps: number; opponents: number; aiSkill: AiSkill; rubberBand: boolean;
  handling: 'grip' | 'drift'; nitro: boolean; pickups: RacePickup[]; ghost: boolean; car: { model: RaceCar; color: string };
}
export const defaultRace = (): RaceSettings => ({ track: 'city-loop', laps: 3, opponents: 5, aiSkill: 'medium', rubberBand: true, handling: 'drift', nitro: true, pickups: ['boost-pad'], ghost: true, car: { model: 'sports_car', color: '#c8372d' } });

export type RunnerTheme = 'temple-ruins' | 'city-rooftops' | 'desert-canyon';
export const RUNNER_THEMES: readonly RunnerTheme[] = ['temple-ruins', 'city-rooftops', 'desert-canyon'];
export type RunnerObstacle = 'barrier-low' | 'bar-high' | 'gap' | 'blocker' | 'cart';
export const RUNNER_OBSTACLES: readonly RunnerObstacle[] = ['barrier-low', 'bar-high', 'gap', 'blocker', 'cart'];
export type RunnerPowerUp = 'magnet' | 'shield' | 'boost' | 'multiplier';
export const RUNNER_POWER_UPS: readonly RunnerPowerUp[] = ['magnet', 'shield', 'boost', 'multiplier'];
export type RunnerGoal = { type: 'endless' } | { type: 'distance' | 'coins' | 'score'; target: number };
export interface RunnerSettings {
  theme: RunnerTheme; lanes: 3; startSpeed: number; maxSpeed: number; speedRamp: 'gentle' | 'steady' | 'steep';
  obstacles: RunnerObstacle[]; powerUps: RunnerPowerUp[]; chaser: string; goal: RunnerGoal; revive: boolean; seed?: number;
}
export const defaultRunner = (): RunnerSettings => ({ theme: 'temple-ruins', lanes: 3, startSpeed: 10, maxSpeed: 26, speedRamp: 'steady', obstacles: ['barrier-low', 'bar-high', 'gap', 'blocker', 'cart'], powerUps: ['magnet', 'shield', 'boost', 'multiplier'], chaser: 'enemy-1', goal: { type: 'endless' }, revive: true });

const record = (raw: unknown, label: string, keys: string[]) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error(`Use valid ${label} settings.`);
  for (const key of Object.keys(raw)) if (!keys.includes(key)) throw Error(`Unsupported ${label} setting: ${key}.`);
  return raw as Record<string, unknown>;
};
const choice = <T extends string>(value: unknown, options: readonly T[], message: string): T => { if (!options.includes(value as T)) throw Error(message); return value as T; };
const subset = <T extends string>(value: unknown, options: readonly T[], label: string): T[] => {
  if (!Array.isArray(value) || new Set(value).size !== value.length || value.some((v) => !options.includes(v))) throw Error(`${label}: choose unique values from ${options.join(', ')}.`);
  return value as T[];
};
const flag = (value: unknown, label: string) => { if (typeof value !== 'boolean') throw Error(`${label} must be true or false.`); return value; };
const whole = (value: unknown, min: number, max: number, label: string) => { if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw Error(`Use ${label} from ${min} to ${max}.`); return value as number; };
const number = (value: unknown, min: number, max: number, label: string) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error(`Use ${label} from ${min} to ${max}.`); return value; };

export function parseRace(raw: unknown): RaceSettings {
  if (raw === undefined) return defaultRace();
  const p = record(raw, 'race', ['track', 'laps', 'opponents', 'aiSkill', 'rubberBand', 'handling', 'nitro', 'pickups', 'ghost', 'car']), d = defaultRace();
  const car = p.car === undefined ? d.car : (() => {
    const c = record(p.car, 'race car', ['model', 'color']), model = c.model === undefined ? d.car.model : choice(c.model, RACE_CARS, `Choose a race car: ${RACE_CARS.join(', ')}.`), color = c.color ?? d.car.color;
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw Error('Choose a six-digit race car colour.');
    return { model, color };
  })();
  return {
    track: p.track === undefined ? d.track : parseTrack(p.track),
    laps: p.laps === undefined ? d.laps : whole(p.laps, 1, 9, 'race laps'),
    opponents: p.opponents === undefined ? d.opponents : whole(p.opponents, 3, 7, 'race opponents'),
    aiSkill: p.aiSkill === undefined ? d.aiSkill : choice(p.aiSkill, ['easy', 'medium', 'hard'] as const, 'Choose easy, medium or hard AI skill.'),
    rubberBand: p.rubberBand === undefined ? d.rubberBand : flag(p.rubberBand, 'race.rubberBand'),
    handling: p.handling === undefined ? d.handling : choice(p.handling, ['grip', 'drift'] as const, 'Choose grip or drift handling.'),
    nitro: p.nitro === undefined ? d.nitro : flag(p.nitro, 'race.nitro'),
    pickups: p.pickups === undefined ? d.pickups : subset(p.pickups, RACE_PICKUPS, 'race.pickups'),
    ghost: p.ghost === undefined ? d.ghost : flag(p.ghost, 'race.ghost'),
    car,
  };
}

/** Chaser IDs refer to the game's enemies; `none` runs without one. */
export function parseRunner(raw: unknown, enemyIds: readonly string[]): RunnerSettings {
  const d = defaultRunner();
  if (raw === undefined) return { ...d, chaser: enemyIds[0] ?? 'none' };
  const p = record(raw, 'runner', ['theme', 'lanes', 'startSpeed', 'maxSpeed', 'speedRamp', 'obstacles', 'powerUps', 'chaser', 'goal', 'revive', 'seed']);
  if (p.lanes !== undefined && p.lanes !== 3) throw Error('Runner courses use 3 lanes.');
  const startSpeed = p.startSpeed === undefined ? d.startSpeed : number(p.startSpeed, 6, 20, 'a runner start speed (m/s)');
  const maxSpeed = p.maxSpeed === undefined ? Math.max(d.maxSpeed, startSpeed) : number(p.maxSpeed, startSpeed, 40, 'a runner maximum speed (m/s, at least the start speed)');
  const obstacles = p.obstacles === undefined ? d.obstacles : subset(p.obstacles, RUNNER_OBSTACLES, 'runner.obstacles');
  if (!obstacles.length) throw Error('runner.obstacles needs at least one obstacle type.');
  const chaser = p.chaser === undefined ? (enemyIds[0] ?? 'none') : p.chaser;
  if (typeof chaser !== 'string' || (chaser !== 'none' && !enemyIds.includes(chaser))) throw Error(`runner.chaser must be one of the enemy IDs (${enemyIds.join(', ')}) or none.`);
  let goal: RunnerGoal = d.goal;
  if (p.goal !== undefined) {
    const g = record(p.goal, 'runner goal', ['type', 'target']), type = choice(g.type, ['endless', 'distance', 'coins', 'score'] as const, 'Choose an endless, distance, coins or score runner goal.');
    if (type === 'endless') { if (g.target !== undefined) throw Error('An endless runner goal has no target.'); goal = { type }; }
    else goal = { type, target: whole(g.target, type === 'coins' ? 10 : 100, type === 'score' ? 1_000_000 : 100_000, `a ${type} goal target`) };
  }
  const seed = p.seed === undefined ? undefined : whole(p.seed, 0, 2_147_483_647, 'a runner seed');
  return {
    theme: p.theme === undefined ? d.theme : choice(p.theme, RUNNER_THEMES, `Choose a runner theme: ${RUNNER_THEMES.join(', ')}.`), lanes: 3, startSpeed, maxSpeed,
    speedRamp: p.speedRamp === undefined ? d.speedRamp : choice(p.speedRamp, ['gentle', 'steady', 'steep'] as const, 'Choose a gentle, steady or steep speed ramp.'),
    obstacles, powerUps: p.powerUps === undefined ? d.powerUps : subset(p.powerUps, RUNNER_POWER_UPS, 'runner.powerUps'), chaser, goal,
    revive: p.revive === undefined ? d.revive : flag(p.revive, 'runner.revive'), ...(seed === undefined ? {} : { seed }),
  };
}
