/** Version 2 separates the camera track from independently timed actor performances. */
import { CLIPS, clipById } from '../core/anim/clips';
import { DEFAULT_PARAMS, PRESETS, type Detail } from '../core/params';
import { decodeCharacter, encodeCharacter } from '../app/share';
import { defaultAudio, parseAudio, type FilmAudio } from './audio/schema';
import { parseTextCues, type TextCue } from './text';
import { sceneById, type SetId } from './catalog';
export { SETS, type SetId } from './catalog';
export const ACTIONS = CLIPS.map(c => c.id);
export type Action = string;
export type Shot = 'wide' | 'medium' | 'close';
export type CameraMove = 'locked' | 'orbit' | 'dolly';
export interface Beat { id: string; clip: Action; duration: number; move: boolean }
export interface ActorTrack { id: string; character: string; detail: Detail; x: number; y: number; z: number; yaw: number; beats: Beat[] }
export interface CameraShot { id: string; duration: number; shot: Shot; target: string }
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
export const durationOf = (p: StudioProject) => Math.ceil(Math.max(p.shots.reduce((sum, s) => sum + s.duration, 0), ...p.actors.map(trackDuration),...(p.texts??[]).map(c=>c.start+c.duration),...(p.audio?.speech??[]).map(c=>c.start+c.duration),...(p.audio?.effects??[]).map(c=>c.start+c.duration)) * 30 - 1e-7) / 30;
const member = <T extends string>(v: unknown, values: readonly T[]): v is T => typeof v === 'string' && values.includes(v as T);
function number(v: unknown, min: number, max: number, name: string) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`Invalid ${name}.`);
  return v;
}
function record(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Choose a valid Ara Studio project.'); return v as Record<string, unknown>; }
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
    const beats = a.beats.map((rawBeat, j) => { const b = record(rawBeat);
      if (typeof b.clip !== 'string' || !clipById.has(b.clip) || typeof b.move !== 'boolean') throw new Error(`Invalid action ${j + 1} on character ${i + 1}.`);
      return { id: `a${i}-${j}`, clip: b.clip, duration: number(b.duration, 0.1, 12, 'action duration'), move: b.move && !!clipById.get(b.clip)?.travel };
    });
    return { id: a.id, character: a.character, detail: a.detail, x: number(a.x, -12, 12, 'character X'), y: number(a.y ?? 0, 0, 3, 'character elevation'), z: number(a.z, -12, 12, 'character Z'), yaw: number(a.yaw, -180, 180, 'character rotation'), beats };
  });
  if (!Array.isArray(p.shots) || !p.shots.length || p.shots.length > MAX_SHOTS) throw new Error(`Use one to ${MAX_SHOTS} camera shots.`);
  const shots = p.shots.map((raw, i): CameraShot => { const s = record(raw);
    if (!member(s.shot, ['wide', 'medium', 'close']) || typeof s.target !== 'string' || s.target !== 'all' && !ids.has(s.target)) throw new Error('Invalid shot framing or subject.');
    return { id: `shot-${i}`, duration: number(s.duration, 0.1, 12, 'shot duration'), shot: s.shot, target: s.target };
  });
  const v = record(p.view);
  const result: StudioProject = { kind: 'ara-studio', version: 2, template: p.template as SetId, title: typeof p.title === 'string' ? p.title.trim().slice(0, 60) : '', actors, shots,
    camera: p.camera, aspect: p.aspect, caption: p.caption === true, texts:parseTextCues(p.texts,ids), audio:parseAudio(p.audio,ids), view: { azimuth: number(v.azimuth, -180, 180, 'camera rotation'), elevation: number(v.elevation, -35, 65, 'camera elevation'), zoom: number(v.zoom, 0.5, 3, 'camera zoom') } };
  if (durationOf(result) > MAX_DURATION) throw new Error(`Keep films under ${MAX_DURATION} seconds.`);
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
  const travel = (b: Beat, axis: 0 | 2) => b.move ? clipById.get(b.clip)?.travel?.[axis] ?? 0 : 0;
  for (let i = 0; i < actor.beats.length; i++) { const b = actor.beats[i]; if (t < start + b.duration || i === actor.beats.length - 1) { index = i; break; }
    x += travel(b, 0) * b.duration; z += travel(b, 2) * b.duration; start += b.duration; }
  const b = actor.beats[index], local = t - start;
  let phase = local; for (let i = clipById.get(b.clip)?.loop ? index - 1 : -1; i >= 0 && actor.beats[i].clip === b.clip; i--) phase += actor.beats[i].duration;
  x += travel(b, 0) * local; z += travel(b, 2) * local;
  x -= actor.beats.reduce((sum, b) => sum + travel(b, 0) * b.duration, 0) / 2;
  z -= actor.beats.reduce((sum, b) => sum + travel(b, 2) * b.duration, 0) / 2;
  return { index, time: t, local, phase, start, x, z };
}
