import {isFlightClip} from './helicopter-flight';
import {supportsWeaponAim} from '../core/anim/riding-weapons';
/** Version 2 separates the camera track from independently timed actor performances. */
import { CLIPS, clipById } from '../core/anim/clips';
import { DEFAULT_PARAMS, PRESETS, type Detail } from '../core/params';
import { decodeCharacter, encodeCharacter } from '../app/share';
import { defaultAudio, parseAudio, type FilmAudio } from './audio/schema';
import { parseTextCues, type TextCue } from './text';
import { sceneById, type SetId } from './catalog';
import {studioTravel,MAX_TRAVEL_SPEED,STAGE_LIMIT} from './motion';
import {VEHICLE_SEATS,validateVehicleLinks,type VehicleSeat} from './vehicle-seats';
import {VEHICLE_CHOICES,VEHICLE_FOR_CLIP,RIDING_VEHICLES,type VehicleChoice} from '../core/props/vehicles';
import {WEAPON_POSES,type WeaponPose} from '../core/anim/riding-weapons';
import {isFirearm} from '../core/props/weapons';
export { SETS, type SetId } from './catalog';
export const ACTIONS = CLIPS.map(c => c.id);
export type Action = string;
export type Shot = 'wide' | 'medium' | 'close';
export type CameraMove = 'locked' | 'orbit' | 'dolly';
export interface Beat { id: string; clip: Action; duration: number; move: boolean;travelSpeed?:number;flightHeight?:number;showVehicle?:boolean;weaponPose?:WeaponPose;weaponYaw?:number;weaponPitch?:number;vehicleId?:string;vehicleSeat?:VehicleSeat }
export interface ActorTrack { id: string; character: string; detail: Detail; x: number; y: number; z: number; yaw: number; beats: Beat[];vehicle?:VehicleChoice }
export interface CameraShot { view?: View; camera?: CameraMove; id: string; duration: number; shot: Shot; target: string }
export interface View { azimuth: number; elevation: number; zoom: number }
export interface StudioProject {
  kind: 'ara-studio'; version: 2; title: string; template: SetId; actors: ActorTrack[]; shots: CameraShot[];
  camera: CameraMove; view: View; aspect: 'landscape' | 'portrait'; caption: boolean; texts: TextCue[]; audio: FilmAudio;
}
export const CAST = ['The Female Executive', 'The Adventurer', 'The Priest', 'The Miami Dealer', 'The Corporate High-Flier', 'The Gangster'];
export const MAX_DURATION = 60, MAX_ACTIONS = 16, MAX_SHOTS = 12, MAX_ACTORS = 5;
let nextId = 0;
export const beatId = () => `beat-${Date.now().toString(36)}-${++nextId}`;
export const beat = (clip: Action, duration: number, move = false): Beat => ({ id: beatId(), clip, duration, move });
export const trackDuration = (track: { beats: Beat[] }) => track.beats.reduce((sum, b) => sum + b.duration, 0);
export function presetCode(name: string): string {
  if (!PRESETS[name]) throw new Error('Unknown character preset.');
  return encodeCharacter({ ...DEFAULT_PARAMS, ...PRESETS[name], name, detail: 'medium' });
}
export function newActor(character = presetCode('The Adventurer'), detail: Detail = 'medium', id = 'actor-b'): ActorTrack {
  return { id, character, detail, x: 0, y: 0, z: 0, yaw: 0, beats: [beat('idle', 3), beat('talk', 3), beat('wave', 3)] };
}
export function newProject(template: SetId = 'portrait', character?: string, detail: Detail = 'medium'): StudioProject {
  const actor = newActor(character ?? presetCode(template === 'courtyard' ? 'The Adventurer' : 'The Female Executive'), detail, 'actor-a');
  actor.beats = template === 'runway' ? [beat('model_walk', 2.4, true), beat('model_walk', 2.4, true), beat('idle', 3.2)] : template === 'courtyard' ? [beat('walk', 2.5, true), beat('idle', 3), beat('wave', 3)] : [beat('idle', 3), beat('wave', 3), beat('idle', 3)];
  return { kind: 'ara-studio', version: 2, template, title: template === 'portrait' ? 'A character, a story.' : sceneById.get(template)!.name,
    actors: [actor], shots: actor.beats.map((b, i) => ({ id: beatId(), duration: b.duration, shot: (['wide', 'medium', 'close'] as const)[i], target: 'all' })),
    camera: template === 'courtyard' ? 'orbit' : template === 'runway' ? 'locked' : 'dolly', view: { azimuth: 0, elevation: 0, zoom: 1 }, aspect: 'landscape', caption: true, texts: [], audio:defaultAudio() };
}
/** Minimal editable film, separate from the first-visit demonstration. */
export function blankProject(): StudioProject {
  const project=newProject();
  project.title='Untitled film';project.camera='locked';project.caption=false;
  project.actors[0].beats=[beat('idle',3)];
  project.shots=[{id:beatId(),duration:3,shot:'wide',target:'all'}];
  return project;
}
export const durationOf = (p: StudioProject) => Math.ceil(Math.max(p.audio?.music.track!=='none'&&p.audio?.music.duration!==undefined?(p.audio.music.start??0)+p.audio.music.duration:0,p.shots.reduce((sum, s) => sum + s.duration, 0), ...p.actors.map(trackDuration),...(p.texts??[]).map(c=>c.start+c.duration),...(p.audio?.speech??[]).map(c=>c.start+c.duration),...(p.audio?.effects??[]).map(c=>c.start+c.duration)) * 30 - 1e-7) / 30;
const member = <T extends string>(v: unknown, values: readonly T[]): v is T => typeof v === 'string' && values.includes(v as T);
function number(v: unknown, min: number, max: number, name: string) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`Invalid ${name}.`);
  return v;
}
function record(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Choose a valid Ara Studio project.'); return v as Record<string, unknown>; }
function parseView(raw:unknown):View { const v=record(raw);return {azimuth:number(v.azimuth,-180,180,'camera rotation'),elevation:number(v.elevation,-35,65,'camera elevation'),zoom:number(v.zoom,.5,3,'camera zoom')}; }
/** Migrate saved v1 films; reject unsupported versions and malformed tracks before building models. */
export function parseProject(text: string): StudioProject {
  if (text.length > 100_000) throw new Error('Choose a project smaller than 100 KB.');
  let p = record(JSON.parse(text));
  if (p.kind !== 'ara-studio' || ![1, 2].includes(p.version as number)) throw new Error('Choose an Ara Studio project (version 1 or 2).');
  if (p.version === 1) {
    if (!Array.isArray(p.beats)) throw new Error('This project has no actions.');
    p = { ...p, version: 2, actors: [{ id: 'actor-a', character: p.character, detail: p.detail ?? 'medium', x: 0, y: 0, z: 0, yaw: 0, beats: p.beats }],
      shots: p.beats.map(raw => { const b = record(raw); return { duration: b.duration, shot: b.shot, target: 'all' }; }), view: { azimuth: 0, elevation: 0, zoom: 1 } };
  }
  if (typeof p.template !== 'string' || !sceneById.has(p.template as SetId) || !member(p.camera, ['locked', 'orbit', 'dolly']) || !member(p.aspect, ['landscape', 'portrait'])) throw new Error('Unsupported scene or camera.');
  if (!Array.isArray(p.actors) || p.actors.length < 1 || p.actors.length > MAX_ACTORS) throw new Error(`A film needs one to ${MAX_ACTORS} characters.`);
  const ids = new Set<string>();
  const actors: ActorTrack[] = p.actors.map((raw, i) => {
    const a = record(raw);
    if (typeof a.id !== 'string' || !/^[a-zA-Z0-9_-]{1,50}$/.test(a.id) || ids.has(a.id) || ['all','camera'].includes(a.id)) throw new Error('Character IDs must be unique.'); ids.add(a.id);
    if (!member(a.detail, ['low', 'medium', 'high']) || typeof a.character !== 'string' || !decodeCharacter(a.character, a.detail)) throw new Error('Invalid character recipe or detail.');
    if (!Array.isArray(a.beats) || !a.beats.length || a.beats.length > MAX_ACTIONS) throw new Error(`Use one to ${MAX_ACTIONS} actions per character.`);
    const actorParams=decodeCharacter(a.character,a.detail)!,inherited=actorParams.vehicle,legacy=a.vehicle??inherited;
    const migrate=(clip:string)=>a.vehicle!=='auto'&&(legacy==='sports_car'||legacy==='suv')?(clip==='drive_car'?(legacy==='suv'?'drive_suv':'drive_sports_car'):clip==='sit_passenger'?(legacy==='suv'?'sit_suv_passenger':'sit_sports_car_passenger'):clip):clip;
    const beats = a.beats.map((rawBeat, j) => { const b = record(rawBeat);
      if (typeof b.clip !== 'string' || !clipById.has(b.clip) || typeof b.move !== 'boolean') throw new Error(`Invalid action ${j + 1} on character ${i + 1}.`);
      const clip=migrate(b.clip),speed=b.travelSpeed===undefined?undefined:number(b.travelSpeed,.1,MAX_TRAVEL_SPEED,'vehicle travel speed');
      if(b.showVehicle!==undefined&&(typeof b.showVehicle!=='boolean'||!VEHICLE_FOR_CLIP[clip]))throw Error('Vehicle visibility is only available for vehicle actions.');
      if(speed!==undefined&&!RIDING_VEHICLES[clip])throw Error('Travel speed is only available for riding/driving actions.');
      const height=b.flightHeight===undefined?undefined:number(b.flightHeight,0,30,'helicopter flight height');if(height!==undefined&&!isFlightClip(clip))throw Error('Flight height is only available for aircraft pilot actions.');
      const pitch=b.weaponPitch===undefined?undefined:number(b.weaponPitch,-45,60,'weapon elevation');
      const pose=b.weaponPose,yaw=b.weaponYaw===undefined?undefined:number(b.weaponYaw,-110,110,'mounted weapon direction');
      if(pose!==undefined&&!member(pose,WEAPON_POSES))throw Error('Choose a supported weapon pose.');
      if((pose!==undefined&&pose!=='hidden'||yaw!==undefined||pitch!==undefined)&&!supportsWeaponAim(clip))throw Error('Wield, aim, fire and weapon direction are only available for riding/driving and pistol/rifle performances.');
      const weapon=actorParams.weapon;
      if(((pose!==undefined&&pose!=='hidden')||yaw!==undefined||pitch!==undefined)&&weapon==='grenade')throw Error('Grenades use Throw grenade, not weapon aiming.');
      if(((pose!==undefined&&pose!=='hidden')||yaw!==undefined||pitch!==undefined)&&weapon==='none')throw Error('Equip a weapon before choosing a mounted weapon pose.');
      if(pose==='fire'&&!isFirearm(weapon))throw Error('Only a pistol or rifle can use Fire.');
      if(b.vehicleId!==undefined&&(typeof b.vehicleId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(b.vehicleId)))throw Error('Use a vehicle ID of 1–80 letters, numbers, underscores or hyphens.');
      if(b.vehicleSeat!==undefined&&!member(b.vehicleSeat,VEHICLE_SEATS))throw Error('Choose a supported vehicle seat.');
      return { id: `a${i}-${j}`, clip, duration: number(b.duration, 0.1, 12, 'action duration'), move: b.move && !!studioTravel(clip),...(speed!==undefined?{travelSpeed:speed}:{}),...(height!==undefined?{flightHeight:height}:{}),...(b.showVehicle!==undefined?{showVehicle:b.showVehicle as boolean}:{}),...(pose!==undefined?{weaponPose:pose as WeaponPose}:{}),...(yaw!==undefined?{weaponYaw:yaw}:{}),...(pitch!==undefined?{weaponPitch:pitch}:{}),...(b.vehicleId!==undefined?{vehicleId:b.vehicleId as string}:{}),...(b.vehicleSeat!==undefined?{vehicleSeat:b.vehicleSeat as VehicleSeat}:{}) };
    });
    if(a.vehicle!==undefined&&!member(a.vehicle,VEHICLE_CHOICES))throw Error('Choose an available vehicle.');
    return { id: a.id, character: a.character, detail: a.detail, x: number(a.x, -STAGE_LIMIT, STAGE_LIMIT, 'character X'), y: number(a.y ?? 0, 0, 3, 'character elevation'), z: number(a.z, -STAGE_LIMIT, STAGE_LIMIT, 'character Z'), yaw: number(a.yaw, -180, 180, 'character rotation'), beats,...(a.vehicle==='none'?{vehicle:'none' as const}:a.vehicle!==undefined||inherited!=='none'?{vehicle:'auto' as const}:{}) };
  });
  if (!Array.isArray(p.shots) || !p.shots.length || p.shots.length > MAX_SHOTS) throw new Error(`Use one to ${MAX_SHOTS} camera shots.`);
  const shots = p.shots.map((raw, i): CameraShot => { const s = record(raw);
    if (!member(s.shot, ['wide', 'medium', 'close']) || typeof s.target !== 'string' || s.target !== 'all' && !ids.has(s.target)) throw new Error('Invalid shot framing or subject.');
    if(s.camera!==undefined&&!member(s.camera,['locked','dolly','orbit']))throw Error('Invalid shot camera movement.');
    return { ...(s.view===undefined?{}:{view:parseView(s.view)}),...(s.camera===undefined?{}:{camera:s.camera as CameraMove}),id: `shot-${i}`, duration: number(s.duration, 0.1, 12, 'shot duration'), shot: s.shot, target: s.target };
  });
  const result: StudioProject = { kind: 'ara-studio', version: 2, template: p.template as SetId, title: typeof p.title === 'string' ? p.title.trim().slice(0, 60) : '', actors, shots,
    camera: p.camera, aspect: p.aspect, caption: p.caption === true, texts:parseTextCues(p.texts,ids), audio:parseAudio(p.audio,ids), view: parseView(p.view) };
  const music=result.audio.music;if(music.track!=='none'&&music.duration===undefined&&(music.start??0)>=durationOf(result))throw Error('Music starts beyond the film. Set its duration or move its start earlier.');
  if (durationOf(result) > MAX_DURATION) throw new Error(`Keep films under ${MAX_DURATION} seconds.`);
  validateVehicleLinks(result);
  return result;
}
export function shotAt(p: StudioProject, time: number) {
  let start = 0;
  for (let i = 0; i < p.shots.length; i++) { const s = p.shots[i]; if (time < start + s.duration || i === p.shots.length - 1) return { index: i, shot: s, start, progress: Math.max(0, Math.min(1, (time - start) / s.duration)) }; start += s.duration; }
  throw new Error('Missing camera track.');
}
export interface TimelinePoint { index: number; time: number; local: number; phase: number; start: number; x: number; z: number }
export function timelineAt(p: StudioProject, time: number, actor = p.actors[0]): TimelinePoint {
  const t = Math.max(0, Math.min(trackDuration(actor), time));
  let start = 0, x = 0, z = 0, index = actor.beats.length - 1;
  const travel = (b: Beat, axis: 0 | 2) => b.move ? studioTravel(b.clip,b.travelSpeed)?.[axis] ?? 0 : 0;
  for (let i = 0; i < actor.beats.length; i++) { const b = actor.beats[i]; if (t < start + b.duration || i === actor.beats.length - 1) { index = i; break; }
    x += travel(b, 0) * b.duration; z += travel(b, 2) * b.duration; start += b.duration; }
  const b = actor.beats[index], local = t - start;
  let phase = local; for (let i = clipById.get(b.clip)?.loop ? index - 1 : -1; i >= 0 && actor.beats[i].clip === b.clip; i--) phase += actor.beats[i].duration;
  x += travel(b, 0) * local; z += travel(b, 2) * local;
  x -= actor.beats.reduce((sum, b) => sum + travel(b, 0) * b.duration, 0) / 2;
  z -= actor.beats.reduce((sum, b) => sum + travel(b, 2) * b.duration, 0) / 2;
  return { index, time: t, local, phase, start, x, z };
}
