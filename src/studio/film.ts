/**
 * A film of one or more scenes. Each scene is a complete Studio project: its own set, cast, camera shots, text and
 * sound. The title, frame shape and title card belong to the whole film. A one-scene film saves as a plain version 2
 * project; several scenes save as version 3, with the shared settings once and the scenes in order.
 */
import { durationOf, parseProject, type StudioProject } from './project';
import { packRefsFor } from '../core/packs/registry';

export const MAX_SCENES = 5;
/** Largest film file, in characters: five full scenes. */
export const MAX_FILM_SIZE = 500_000;
/** Seconds of each half of a fade through black between scenes. */
export const FADE = 0.4;
const SHARED = ['title', 'aspect', 'caption'] as const;

const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Choose a valid Ara Studio project.');
  return v as Record<string, unknown>;
};

/** Copies the film-wide settings (title, frame, title card) from one scene to every scene. */
export function shareFilmSettings(scenes: StudioProject[], from = scenes[0]): StudioProject[] {
  return scenes.map((s, i) => {
    const next = { ...s, title: from.title, aspect: from.aspect, caption: from.caption };
    if (i === 0) delete next.transition;
    return next;
  });
}

/** The content packs a film's actions come from, as its "packs" list (left out when it uses only Ara's own). */
function filmPacks(scenes: StudioProject[]) {
  const refs = packRefsFor(scenes.flatMap((s) => s.actors.flatMap((a) => a.beats.map((b) => b.clip))));
  return refs.length ? { packs: refs } : {};
}

/** The file form of a film: a version 2 project for one scene, version 3 for several. */
export function filmJson(scenes: StudioProject[]): Record<string, unknown> {
  if (scenes.length === 1) { const only = { ...scenes[0] };delete only.transition;return { ...only, ...filmPacks(scenes) } as unknown as Record<string, unknown>; }
  const first = scenes[0];
  return {
    kind: 'ara-studio', version: 3, title: first.title, aspect: first.aspect, caption: first.caption, ...filmPacks(scenes),
    scenes: scenes.map((scene, i) => {
      const rest: Record<string, unknown> = { ...scene };
      for (const key of ['kind', 'version', ...SHARED]) delete rest[key];
      if (i === 0) delete rest.transition;
      return rest;
    }),
  };
}

/** One scene of a version 3 film as a version 2 project, with the film's shared settings. */
export function sceneSource(film: Record<string, unknown>, scene: unknown): Record<string, unknown> {
  const s = record(scene);
  for (const key of ['kind', 'version', ...SHARED]) if (key in s) throw Error(`Put ${key} on the film, not on a scene.`);
  return { ...s, kind: 'ara-studio', version: 2, title: film.title, aspect: film.aspect, caption: film.caption };
}

/** Checks a version 3 film's outer shape, and returns its scenes. */
export function filmScenes(film: Record<string, unknown>): unknown[] {
  if (film.kind !== 'ara-studio') throw Error('Choose an Ara Studio project.');
  if (!Array.isArray(film.scenes) || film.scenes.length < 1 || film.scenes.length > MAX_SCENES) throw Error(`A film has one to ${MAX_SCENES} scenes.`);
  return film.scenes;
}

/** Any saved Studio film: version 1 or 2 (one scene) or version 3 (up to five scenes). */
export function parseFilm(text: string): StudioProject[] {
  if (text.length > MAX_FILM_SIZE) throw Error('Choose a film smaller than 500 KB.');
  const value = record(JSON.parse(text));
  if (value.version !== 3) return [parseProject(text)];
  const scenes = filmScenes(value).map((scene, i) => {
    try { return parseProject(JSON.stringify(sceneSource(value, scene))); }
    catch (error) { throw Error(`Scene ${i + 1}: ${(error as Error).message}`); }
  });
  return shareFilmSettings(scenes);
}

export const filmDuration = (scenes: StudioProject[]) => scenes.reduce((sum, s) => sum + durationOf(s), 0);
/** When each scene starts in the whole film. */
export function sceneStarts(scenes: StudioProject[]): number[] {
  let t = 0;
  return scenes.map(s => { const start = t;t += durationOf(s);return start; });
}
/** The scene playing at a moment of the whole film, and the time inside it. */
export function sceneAt(scenes: StudioProject[], time: number) {
  const starts = sceneStarts(scenes);
  let index = scenes.length - 1;
  while (index > 0 && time < starts[index]) index--;
  return { index, start: starts[index], local: Math.max(0, Math.min(durationOf(scenes[index]), time - starts[index])) };
}
/** How dark the picture is at a moment of a scene (0 clear, 1 black): fades into a scene and out of it before a fade. */
export function fadeLevel(scenes: StudioProject[], index: number, local: number): number {
  const scene = scenes[index], duration = durationOf(scene);
  const fadeIn = index > 0 && scene.transition === 'fade' ? 1 - local / Math.min(FADE, duration / 2) : 0;
  const fadeOut = scenes[index + 1]?.transition === 'fade' ? 1 - (duration - local) / Math.min(FADE, duration / 2) : 0;
  return Math.max(0, Math.min(1, Math.max(fadeIn, fadeOut)));
}
/** A scene's label: its name, or its number. */
export const sceneLabel = (scenes: StudioProject[], index: number) => scenes[index].sceneName || `Scene ${index + 1}`;

/** An undo step: every scene, and the one open. Older steps hold a single project. */
export const historyEntry = (scenes: StudioProject[], index: number) => JSON.stringify({ scene: index, film: filmJson(scenes) });
export function readHistoryEntry(text: string): { scenes: StudioProject[]; index: number } {
  const value = JSON.parse(text) as Record<string, unknown>;
  if (value && typeof value === 'object' && 'film' in value) {
    const scenes = parseFilm(JSON.stringify(value.film));
    return { scenes, index: Math.max(0, Math.min(scenes.length - 1, Math.floor(Number(value.scene) || 0))) };
  }
  return { scenes: parseFilm(text), index: 0 };
}
