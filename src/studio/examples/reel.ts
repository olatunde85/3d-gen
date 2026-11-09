/**
 * The Ara 3D Studio reel: short films made in Studio, one per location. They are Studio's examples (Assist → Try an
 * example), and scripts/reel/capture.ts and scripts/build-studio-reel.ts render them with Studio's own MP4 export and
 * cut them into the landing-page reel. Each scene carries its own sound effects and caption; the reel adds one music
 * track across the cuts, and the examples add it to each film.
 */
import { presetCode, parseProject, type StudioProject } from '../project';
import { decodeCharacter, encodeCharacter } from '../../app/share';
import type { HumanParams } from '../../core/params';

const cast = (name: string, change: Partial<HumanParams> = {}) => {
  const params = decodeCharacter(presetCode(name), 'medium')!;
  return encodeCharacter({ ...params, ...change } as HumanParams);
};
/** Factory paint for each vehicle in the reel. */
const paint = (color: string, accentColor: string, finish: 'matte' | 'satin' | 'gloss' = 'satin') => ({ vehicleStyle: { color, accentColor, seatColor: '#232426', finish, variant: 'classic' as const } });
const B = (clip: string, duration: number, move = false, extra: Record<string, unknown> = {}) => ({ clip, duration: +duration.toFixed(3), move, ...extra });
type View = { azimuth: number; elevation: number; zoom: number };
const shot = (duration: number, framing: 'wide' | 'medium' | 'close', target: string, view?: View, camera?: 'locked' | 'dolly' | 'orbit') =>
  ({ duration: +duration.toFixed(3), shot: framing, target, ...(view ? { view } : {}), ...(camera ? { camera } : {}) });
const view = (azimuth: number, elevation: number, zoom = 1): View => ({ azimuth, elevation, zoom });
const fx = (id: string, sound: string, start: number, extra: Record<string, unknown> = {}) => ({ id, sound, start: +start.toFixed(3), ...extra });
/** The lower-third caption, on screen for the whole part of the scene the reel keeps (`length` seconds), so it can be read. */
const caption = (text: string, length: number) => ({ id: 'caption', text, start: 0, duration: length, style: 'text', anchor: 'screen', x: 0.5, y: 0.86, size: 40, color: '#ffffff' });

function film(title: string, template: string, actors: unknown[], shots: unknown[], texts: unknown[], effects: unknown[]): StudioProject {
  return parseProject(JSON.stringify({
    kind: 'ara-studio', version: 2, title, template, actors, shots, camera: 'dolly', view: view(0, 0), aspect: 'landscape', caption: false, texts,
    audio: { speech: [], effects, music: { track: 'none', volume: 0.2, ducking: false, fadeIn: 0, fadeOut: 0 }, muted: false },
  }));
}

/** A short exchange in the alley: a blocked punch, a counter-combination and a knockdown. Wide shots only. */
export function fightScene() {
  const courier = { id: 'courier', character: cast('The Adventurer'), detail: 'high', x: 0, y: 0, z: 4.8, yaw: 0, beats: [
    B('fight_idle', 0.6), B('block', 0.8), B('fight_idle', 0.2), B('punch_combo', 1.6), B('fight_idle', 1.8)] };
  const thug = { id: 'thug', character: cast('The Gangster'), detail: 'high', x: 0, y: 0, z: 5.65, yaw: 180, beats: [
    B('fight_idle', 0.5), B('punch', 0.9), B('fight_idle', 0.25), B('hit_front', 0.85), B('knockdown', 2.5)] };
  return film('Fight', 'back-alley', [courier, thug],
    [shot(2.6, 'wide', 'all', view(-110, 10, 0.85)), shot(2.4, 'wide', 'all', view(-95, 8, 0.9))],
    [caption('Fight scenes and knockdowns', 4.4)],
    [fx('block', 'block-impact', 0.82, { volume: 0.7 }), fx('combo', 'punch-combo', 1.15), fx('fall', 'body-fall-thump', 3.25)]);
}

/** A soldier takes cover from a gunman, pops up and returns fire; the gunman is hit in the chest and falls. */
export function shootoutScene() {
  const soldier = { id: 'soldier', character: cast('The Bodyguard', { weapon: 'rifle' }), detail: 'high', x: 0, y: 0, z: 0.23, yaw: 0, beats: [
    B('take_cover', 1.2, true), B('cover_idle', 2), B('cover_fire', 2.4), B('cover_idle', 2.4)] };
  const gunman = { id: 'gunman', character: cast('The Prison Escapee', { weapon: 'pistol' }), detail: 'high', x: 0.6, y: 0, z: 13, yaw: 180, beats: [
    B('pistol_aim', 1.5), B('pistol_fire', 0.5), B('pistol_aim', 0.4), B('pistol_fire', 0.5), B('pistol_aim', 1), B('shot_chest', 4.1)] };
  return film('Shootout', 'military-base', [soldier, gunman],
    [shot(1.5, 'medium', 'soldier', view(160, 8, 0.9)), shot(1.9, 'medium', 'gunman', view(170, 4, 1.1)), shot(0.55, 'medium', 'soldier', view(-160, 10, 0.9)), shot(4.05, 'wide', 'gunman', view(110, 12, 1.1))],
    [caption('Gunfights, cover and bullet hits', 6.8)],
    [fx('steps', 'take-cover-steps', 0), fx('shot-1', 'suppressed-pistol-shot', 1.54), fx('shot-2', 'suppressed-pistol-shot', 2.44), fx('volley', 'cover-fire', 3.15), fx('shot-3', 'rifle-shot', 4.55, { volume: 0.8 }), fx('hit', 'bullet-hit', 3.5), fx('fall', 'body-fall-thump', 5.55)]);
}

/** An SUV and a motorbike race down the highway and under the overpass; the bike overtakes. */
export function highwayScene() {
  const car = { id: 'car', character: cast('The Corporate High-Flier', paint('#b3202a', '#1d1d1f', 'gloss')), detail: 'high', x: 0, y: 0, z: -23, yaw: 0, beats: [B('drive_suv', 7, true, { travelSpeed: 22 })] };
  const bike = { id: 'bike', character: cast('The Covert Spy', paint('#1d1f24', '#c9a45a', 'gloss')), detail: 'high', x: 3.6, y: 0, z: -21, yaw: 0, beats: [B('ride_motorcycle', 7, true, { travelSpeed: 26 })] };
  return film('Highway', 'highway', [car, bike],
    [shot(2.6, 'wide', 'car', view(150, 10, 0.9)), shot(2.2, 'medium', 'bike', view(60, 6, 1)), shot(2.2, 'wide', 'all', view(-25, 18, 0.9))],
    [caption('Cars, SUVs, motorbikes, boats and horses', 6)],
    [fx('car', 'car-engine', 0, { duration: 7, volume: 0.8 }), fx('bike', 'motorcycle-engine', 0, { duration: 7, volume: 0.9 })]);
}

/** Everyday life at a street café: friends at a table, a phone call, a dancer and the sweeper. */
export function cafeScene() {
  const actors = [
    { id: 'friend-a', character: cast('The Miami Dealer'), detail: 'high', x: -3.4, y: 0, z: -3.03, yaw: 0, beats: [B('sit_idle', 5)] },
    { id: 'friend-b', character: cast('The Female Executive'), detail: 'high', x: -3.4, y: 0, z: -1.47, yaw: 180, beats: [B('sit_idle', 5)] },
    { id: 'caller', character: cast('The Corporate High-Flier', { carry: 'phone' }), detail: 'high', x: 0.2, y: 0, z: -1.2, yaw: -40, beats: [B('phone_call', 5)] },
    { id: 'dancer', character: cast('The Covert Spy', { carry: 'none' }), detail: 'high', x: -1.8, y: 0, z: 2.6, yaw: 20, beats: [B('dance_groove', 5)] },
    { id: 'sweeper', character: cast('The Priest', { carry: 'broom' }), detail: 'high', x: 3.4, y: 0, z: 1.8, yaw: -90, beats: [B('sweep', 5)] },
  ];
  return film('Street café', 'street-cafe', actors,
    [shot(2.2, 'wide', 'all', view(20, 14, 1)), shot(1.3, 'medium', 'caller', view(10, 4, 1.1)), shot(1.5, 'medium', 'friend-a', view(60, 10, 1))],
    [{ id: 'say-a', text: 'Did you see that?', start: 3.5, duration: 1.5, style: 'speech', anchor: 'friend-a', size: 24 },
      caption('66 locations, 5 characters per scene', 5)],
    []);
}

/** A rooftop chase: the escapee vaults a barrier and rolls, the pursuer vaults close behind. */
export function rooftopScene() {
  const runner = { id: 'runner', character: cast('The Prison Escapee'), detail: 'high', x: 0, y: 0, z: 22.75, yaw: 0, beats: [
    B('run', 1, true), B('vault_over', 1.2, true), B('run', 0.8, true), B('roll_forward', 1.3, true), B('run', 1.7, true)] };
  const pursuer = { id: 'pursuer', character: cast('The Professional Hitman'), detail: 'high', x: 1.5, y: 0, z: 20.16, yaw: 0, beats: [
    B('run', 2.1, true), B('vault_over', 1.2, true), B('run', 2.7, true)] };
  return film('Rooftop chase', 'city-rooftop', [runner, pursuer],
    [shot(2.6, 'wide', 'runner', view(-80, 8, 0.95)), shot(1.6, 'wide', 'runner', view(30, 6, 1.1)), shot(1.8, 'wide', 'all', view(-140, 10, 0.9))],
    [caption('Parkour, climbing, swimming and more', 5.2)],
    []);
}

/** The finale: an evening on the beach under the title, two friends talking, one texting, one looking around, one dancing; the reel zooms out from it into the editor. */
export function finaleScene() {
  const person = (id: string, name: string, x: number, z: number, yaw: number, clip: string, change: Partial<HumanParams> = {}) =>
    ({ id, character: cast(name, { carry: 'none', ...change }), detail: 'high', x, y: 0, z, yaw, beats: [B(clip, 8.5)] });
  const actors = [
    person('talk-a', 'The Miami Dealer', -2.6, 6.4, 75, 'talk_gestures'),
    person('talk-b', 'The Gangster', -1.4, 6.6, -105, 'talk_gestures'),
    person('dancer', 'The Beach Girl', 0.4, 7.2, 0, 'dance_groove'),
    person('texter', 'The Adventurer', 2.0, 6.3, -20, 'texting', { carry: 'phone' }),
    person('looker', 'The Covert Spy', 3.3, 5.6, -30, 'look_around'),
  ];
  return film('Finale', 'sunset-beach', actors,
    [shot(8.5, 'wide', 'all', view(0, 6, 1.5), 'orbit')],
    [{ id: 'title', text: 'ARA 3D STUDIO', start: 1.2, duration: 7.3, style: 'text', anchor: 'screen', x: 0.5, y: 0.13, size: 72, color: '#ffffff' },
      { id: 'tagline', text: 'Direct short films in your browser. Free.', start: 2, duration: 6.5, style: 'text', anchor: 'screen', x: 0.5, y: 0.23, size: 34, color: '#ffe0a6' },
      { id: 'site', text: 'ara3dgen.com', start: 2.4, duration: 6.1, style: 'text', anchor: 'screen', x: 0.5, y: 0.32, size: 44, color: '#ffffff' }],
    []);
}

/** The military base: a tank rolls up the access road with its gunner in the hatch as a helicopter sweeps overhead. */
export function baseScene() {
  // Both run past the 6 s the reel uses, so the helicopter is still climbing when the scene is cut. Its lane clears the lamp posts.
  const tank = { id: 'tank', character: cast('The Bodyguard', paint('#4d5a32', '#363f24', 'matte')), detail: 'high', x: 2, y: 0, z: 43, yaw: 0, beats: [B('gun_tank', 9, true, { travelSpeed: 4 })] };
  const chopper = { id: 'chopper', character: cast('The Covert Spy', paint('#2f3a44', '#9aa4ad')), detail: 'high', x: -14, y: 0, z: 51, yaw: 0, beats: [B('fly_helicopter', 9, true, { flightHeight: 10, travelSpeed: 8 })] };
  return film('Base', 'military-base', [tank, chopper],
    [shot(2, 'wide', 'tank', view(25, 8, 1.8)), shot(2, 'wide', 'chopper', view(60, 2, 1.3)), shot(5, 'wide', 'tank', view(40, 18, 1.2))],
    [caption('Tanks, helicopters and jets', 5)],
    [fx('engine', 'car-engine', 0, { duration: 6, volume: 0.5, speed: 0.6 }), fx('rotor', 'boat-engine', 0, { duration: 6, volume: 0.4, speed: 0.7 })]);
}

/** A jet rolls down the base road and takes off. */
export function jetScene() {
  const pilot = { id: 'pilot', character: cast('The Corporate High-Flier', paint('#8a929c', '#4e555e')), detail: 'high', x: 0, y: 0, z: 50, yaw: 0, beats: [B('takeoff_jet', 6, true, { flightHeight: 12 })] };
  return film('Jet', 'military-base', [pilot],
    [shot(3, 'wide', 'pilot', view(70, 4, 1.4)), shot(3, 'wide', 'pilot', view(-160, 8, 1.6))],
    [],
    [fx('roar', 'boat-engine', 0, { duration: 6, volume: 0.7, speed: 1.6 }), fx('wind', 'wind', 2, { duration: 4, volume: 0.6 })]);
}

/** A skydiver over the desert: free fall, canopy, glide and a running landing. */
export function parachuteScene() {
  const diver = { id: 'diver', character: cast('The Adventurer', { carry: 'parachute' }), detail: 'high', x: 6, y: 0, z: 12, yaw: -30, beats: [
    B('skydive', 1.4, false, { flightHeight: 18 }), B('parachute_deploy', 2.4), B('parachute_glide', 1.6, true), B('parachute_land', 3)] };
  return film('Parachute', 'desert-outpost', [diver],
    [shot(3.8, 'wide', 'diver', view(20, -6, 1.3)), shot(4.6, 'wide', 'diver', view(-40, 6, 1.1))],
    [caption('Skydiving and parachutes', 7.4)],
    [fx('wind', 'wind', 0, { duration: 6.5, volume: 0.9, loop: true }), fx('land', 'body-fall-thump', 6.1, { volume: 0.6 })]);
}

/** The scenes in reel order, and the part of each the reel keeps (`from`/`to` seconds): wind-ups and settling are cut. */
export const REEL: { name: string; label: string; film: () => StudioProject; from: number; to: number }[] = [
  { name: 'Base', label: 'Military base: a tank and a helicopter', film: baseScene, from: 0.4, to: 5 },
  { name: 'Jet', label: 'Jet takeoff', film: jetScene, from: 1, to: 5.5 },
  { name: 'Parachute', label: 'Skydive and parachute landing', film: parachuteScene, from: 0.2, to: 7.4 },
  { name: 'Shootout', label: 'Shootout from cover', film: shootoutScene, from: 0.6, to: 6.8 },
  { name: 'Highway', label: 'Highway race: SUV and motorbike', film: highwayScene, from: 1, to: 6 },
  { name: 'Street café', label: 'Street café', film: cafeScene, from: 0.3, to: 5 },
  { name: 'Fight', label: 'Alley fight', film: fightScene, from: 0.3, to: 4.4 },
  { name: 'Rooftop chase', label: 'Rooftop chase', film: rooftopScene, from: 0.4, to: 5.2 },
  { name: 'Finale', label: 'Sunset beach', film: finaleScene, from: 2.2, to: 8.5 },
];
