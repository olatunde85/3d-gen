/** Portable, versioned Studio recipes. Character geometry is rebuilt by Ara, never embedded. */
import { clipById } from '../core/anim/clips';
import { DEFAULT_PARAMS, PRESETS, type Detail } from '../core/params';
import { decodeCharacter, encodeCharacter } from '../app/share';

export const ACTIONS = ['idle', 'walk', 'model_walk', 'wave', 'talk', 'cheer'] as const;
export type Action = typeof ACTIONS[number];
export type SetId = 'portrait' | 'runway' | 'courtyard';
export type Shot = 'wide' | 'medium' | 'close';
export type CameraMove = 'locked' | 'orbit' | 'dolly';
export interface Beat { id: string; clip: Action; duration: number; shot: Shot; move: boolean }
export interface StudioProject {
  kind: 'ara-studio'; version: 1; detail: Detail; title: string; template: SetId; character: string;
  beats: Beat[]; camera: CameraMove; aspect: 'landscape' | 'portrait'; caption: boolean;
}
export const SETS: { id: SetId; name: string; subtitle: string; tag: string }[] = [
  { id: 'portrait', name: 'The portrait', subtitle: 'Soft light. A quiet introduction.', tag: 'STUDIO 01' },
  { id: 'runway', name: 'After hours', subtitle: 'A sculptural set. All eyes on you.', tag: 'STUDIO 02' },
  { id: 'courtyard', name: 'Golden hour', subtitle: 'Warm stone. Long afternoon shadows.', tag: 'STUDIO 03' },
];
export const CAST = ['The Female Executive', 'The Adventurer', 'The Priest', 'The Miami Dealer', 'The Corporate High-Flier', 'The Gangster'];
export const MAX_DURATION = 20;
let nextId = 0;
export const beatId = () => `beat-${Date.now().toString(36)}-${++nextId}`;
const beat = (clip: Action, duration: number, shot: Shot, move = false): Beat => ({ id: beatId(), clip, duration, shot, move });
export function presetCode(name: string): string {
  if (!PRESETS[name]) throw new Error('Unknown character preset.');
  return encodeCharacter({ ...DEFAULT_PARAMS, ...PRESETS[name], name, detail: 'medium' });
}
export function newProject(template: SetId = 'portrait', character?: string, detail: Detail = 'medium'): StudioProject {
  const presets: Record<SetId, Pick<StudioProject, 'title' | 'beats' | 'camera'>> = {
    portrait: { title: 'A character, a story.', camera: 'dolly', beats: [beat('idle', 3, 'wide'), beat('wave', 3, 'medium'), beat('idle', 3, 'close')] },
    runway: { title: 'An entrance to remember.', camera: 'locked', beats: [beat('model_walk', 2.4, 'wide', true), beat('model_walk', 2.4, 'medium', true), beat('idle', 3.2, 'close')] },
    courtyard: { title: 'Somewhere new.', camera: 'orbit', beats: [beat('walk', 2.5, 'wide', true), beat('idle', 3, 'medium'), beat('wave', 3, 'medium')] },
  };
  return { kind: 'ara-studio', version: 1, detail, template, character: character ?? presetCode(template === 'courtyard' ? 'The Adventurer' : 'The Female Executive'),
    ...presets[template], aspect: 'landscape', caption: true };
}
export const durationOf = (project: StudioProject) => project.beats.reduce((sum, b) => sum + b.duration, 0);
const member = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === 'string' && values.includes(value as T);
/** Validate imported files and local storage before any characters or GPU resources are allocated. */
export function parseProject(text: string): StudioProject {
  if (text.length > 100_000) throw new Error('This project file is too large. Choose an Ara Studio project.');
  const p = JSON.parse(text) as Record<string, unknown>;
  if (!p || p.kind !== 'ara-studio' || p.version !== 1) throw new Error('Choose an Ara Studio project (version 1).');
  if (!member(p.template, ['portrait', 'runway', 'courtyard']) || !member(p.camera, ['locked', 'orbit', 'dolly']) || !member(p.aspect, ['landscape', 'portrait']))
    throw new Error('This project contains an unsupported set or camera.');
  if (typeof p.character !== 'string' || !decodeCharacter(p.character, 'medium')) throw new Error('The project’s character recipe is invalid.');
  if (!Array.isArray(p.beats) || p.beats.length < 1 || p.beats.length > 6) throw new Error('A project needs between one and six actions.');
  const beats: Beat[] = p.beats.map((raw, i) => {
    const b = raw as Record<string, unknown>;
    if (!b || !member(b.clip, ACTIONS) || !clipById.has(b.clip) || !member(b.shot, ['wide', 'medium', 'close']) || typeof b.duration !== 'number' || !Number.isFinite(b.duration) || b.duration < 1 || b.duration > 6 || typeof b.move !== 'boolean')
      throw new Error(`Action ${i + 1} has invalid settings.`);
    return { id: `loaded-${i}`, clip: b.clip, shot: b.shot, duration: b.duration, move: b.move && (b.clip === 'walk' || b.clip === 'model_walk') };
  });
  const title = typeof p.title === 'string' ? p.title.trim().slice(0, 60) : '';
  if (p.detail !== undefined && !member(p.detail, ['low', 'medium', 'high'])) throw new Error('Unsupported character detail level.');
  const result: StudioProject = { kind: 'ara-studio', version: 1, detail: (p.detail as Detail | undefined) ?? 'medium', template: p.template, camera: p.camera, aspect: p.aspect,
    character: p.character, caption: p.caption === true, title, beats };
  if (durationOf(result) > MAX_DURATION + 0.001) throw new Error(`Keep this short film under ${MAX_DURATION} seconds.`);
  return result;
}
export interface TimelinePoint { index: number; time: number; local: number; phase: number; start: number; z: number; shotProgress: number }
/** The sole scene clock: scrubbing, preview and video export use this same evaluation. */
export function timelineAt(project: StudioProject, time: number): TimelinePoint {
  const duration = durationOf(project), t = Math.max(0, Math.min(duration, time));
  let start = 0, z = 0, index = project.beats.length - 1;
  for (let i = 0; i < project.beats.length; i++) {
    const b = project.beats[i];
    if (t < start + b.duration || i === project.beats.length - 1) { index = i; break; }
    if (b.move) z += (clipById.get(b.clip)?.travel?.[2] ?? 0) * b.duration;
    start += b.duration;
  }
  const b = project.beats[index], local = t - start;
  let phase = local;
  // Consecutive shots of the same action continue the performance instead of restarting the feet.
  for (let i = index - 1; i >= 0 && project.beats[i].clip === b.clip; i--) phase += project.beats[i].duration;
  if (b.move) z += (clipById.get(b.clip)?.travel?.[2] ?? 0) * local;
  const totalTravel = project.beats.reduce((sum, q) => sum + (q.move ? (clipById.get(q.clip)?.travel?.[2] ?? 0) * q.duration : 0), 0);
  return { index, time: t, local, phase, start, z: z - totalTravel / 2, shotProgress: local / b.duration };
}
