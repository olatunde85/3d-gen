/**
 * Films of several scenes, without a browser: the file format (version 2 for one scene, version 3 for several),
 * limits and errors, timing and fades, undo steps, editor recovery, and the travel sets' seats.
 *   npx tsx scripts/studio-film-check.ts
 */
import assert from 'node:assert/strict';
import { FADE, MAX_SCENES, fadeLevel, filmDuration, filmJson, historyEntry, parseFilm, readHistoryEntry, sceneAt, sceneLabel, sceneStarts, shareFilmSettings } from '../src/studio/film';
import { beat, durationOf, newProject, parseProject, type StudioProject } from '../src/studio/project';
import { parseStudioFilm } from '../src/studio/assist';
import { readEditorSession } from '../src/studio/session';
import { SETS, sceneById, searchScenes } from '../src/studio/catalog';
import { locationMapFile } from '../src/studio/spatial-maps';

const scene = (template: Parameters<typeof newProject>[0], seconds: number[]) => {
  const p = newProject(template);p.actors[0].beats = seconds.map(s => beat('idle', s));p.shots = [{ id: 'shot', duration: seconds.reduce((a, b) => a + b, 0), shot: 'wide', target: 'all' }];
  return parseProject(JSON.stringify(p));
};
const bus = scene('city-bus', [3]), train = scene('train-carriage', [2, 2]), plane = scene('airliner-cabin', [5]);
const story = shareFilmSettings([{ ...bus, title: 'Going home', sceneName: '  On the bus  ' }, { ...train, transition: 'fade' }, { ...plane, sceneName: 'Flying' }]);

// One scene stays a plain version 2 project; several scenes are version 3 with the shared settings once.
assert.deepEqual(parseFilm(JSON.stringify(bus)), [bus]);
assert.deepEqual(filmJson([bus]), bus);
const file = filmJson(story) as { version: number; title: string; scenes: Record<string, unknown>[] };
assert.equal(file.version, 3);assert.equal(file.title, 'Going home');assert.equal(file.scenes.length, 3);
for (const s of file.scenes) for (const key of ['kind', 'version', 'title', 'aspect', 'caption']) assert.ok(!(key in s), key);
const read = parseFilm(JSON.stringify(file));
assert.equal(read.length, 3);assert.ok(read.every(s => s.title === 'Going home' && s.aspect === 'landscape'));
assert.equal(read[0].sceneName, 'On the bus');assert.equal(read[1].transition, 'fade');assert.equal(read[2].transition, undefined);
assert.deepEqual(parseFilm(JSON.stringify(filmJson(read))), read);
assert.deepEqual(parseStudioFilm(JSON.stringify(file)), read);
// A first scene never fades in, wherever it came from.
assert.equal(shareFilmSettings([{ ...train, transition: 'fade' }, bus])[0].transition, undefined);
console.log('Film files: one-scene version 2, version 3 round trip, shared settings and transitions passed.');

// Limits and errors name what to fix.
const v3 = (scenes: unknown[], extra = {}) => JSON.stringify({ kind: 'ara-studio', version: 3, title: 'T', aspect: 'landscape', caption: false, scenes, ...extra });
const body = (p: StudioProject) => { const { kind, version, title, aspect, caption, ...rest } = p;void kind;void version;void title;void aspect;void caption;return rest; };
assert.equal(parseFilm(v3(Array(MAX_SCENES).fill(body(bus)))).length, MAX_SCENES);
assert.throws(() => parseFilm(v3(Array(MAX_SCENES + 1).fill(body(bus)))), /one to 5 scenes/);
assert.throws(() => parseFilm(v3([])), /one to 5 scenes/);
assert.throws(() => parseFilm(v3([body(bus), { ...body(bus), template: 'the-moon' }])), /^Error: Scene 2: /);
assert.throws(() => parseFilm(v3([{ ...body(bus), title: 'Here' }])), /Put title on the film/);
assert.throws(() => parseFilm(v3([body(bus), { ...body(bus), transition: 'wipe' }])), /cut or a fade/);
assert.throws(() => parseStudioFilm(v3([body(bus)], { music: 'none' })), /unsupported field music/);
assert.throws(() => parseFilm('x'.repeat(500_001)), /500 KB/);
console.log('Film limits: five scenes, empty films, per-scene errors, misplaced settings and size passed.');

// Timing: scenes follow each other; fades darken the last and first 0.4 s around a fade.
assert.deepEqual(sceneStarts(story), [0, 3, 7]);assert.equal(filmDuration(story), 12);
assert.deepEqual(sceneAt(story, 0), { index: 0, start: 0, local: 0 });
assert.deepEqual(sceneAt(story, 3.5), { index: 1, start: 3, local: .5 });
assert.deepEqual(sceneAt(story, 99), { index: 2, start: 7, local: durationOf(plane) });
assert.equal(fadeLevel(story, 0, 1), 0);assert.equal(fadeLevel(story, 0, 3), 1);assert.ok(Math.abs(fadeLevel(story, 0, 3 - FADE / 2) - .5) < 1e-9);
assert.equal(fadeLevel(story, 1, 0), 1);assert.equal(fadeLevel(story, 1, FADE), 0);assert.equal(fadeLevel(story, 2, 0), 0);
assert.equal(sceneLabel(read, 0), 'On the bus');assert.equal(sceneLabel(read, 1), 'Scene 2');
console.log('Film timing: scene starts, scene lookup and fades through black passed.');

// Undo steps and editor recovery keep every scene and the open one; older single-project entries still work.
const step = readHistoryEntry(historyEntry(story, 2));assert.equal(step.index, 2);assert.deepEqual(step.scenes, parseFilm(JSON.stringify(filmJson(story))));
assert.deepEqual(readHistoryEntry(JSON.stringify(bus)), { scenes: [bus], index: 0 });
const session = readEditorSession(JSON.stringify({ version: 1, project: story[1], film: filmJson(story), scene: 1, editor: {}, history: [historyEntry(story, 0), JSON.stringify(bus), '{broken'] }))!;
assert.equal(session.scene, 1);assert.equal(session.film.length, 3);assert.equal(session.project.template, 'train-carriage');assert.equal(session.history.length, 2);
const old = readEditorSession(JSON.stringify({ version: 1, project: bus, editor: {}, history: [] }))!;
assert.equal(old.scene, 0);assert.deepEqual(old.film, [bus]);
assert.equal(readEditorSession(JSON.stringify({ version: 1, project: bus, film: filmJson(story), scene: 9, editor: {}, history: [] }))!.scene, 2);
console.log('Film editing: undo steps, editor recovery, legacy sessions and out-of-range scenes passed.');

// The travel sets: searchable, inside their own bounds, and with real seats for sitting actions.
const travel = ['train-carriage', 'city-bus', 'private-jet', 'airliner-cabin'] as const;
assert.deepEqual(SETS.filter(s => s.category === 'Travel').map(s => s.id), [...travel]);
for (const [query, id] of [['inside train', 'train-carriage'], ['bus', 'city-bus'], ['private jet', 'private-jet'], ['plane', 'airliner-cabin'], ['airplane', 'private-jet']] as const) assert.ok(searchScenes(query).some(s => s.id === id), query);
for (const id of travel) {
  const map = locationMapFile(id).location, [minX, minZ, maxX, maxZ] = map.bounds;
  assert.ok(sceneById.get(id)!.staging, id);
  assert.ok(map.seats.length >= 8, `${id} seats`);
  for (const {x, y, z} of map.seats) assert.ok(x > minX && x < maxX && z > minZ && z < maxZ && y > .3 && y < 1, `${id} seat ${x},${z}`);
  assert.ok(map.obstacles.every(o => o.bottom > 0 || (o.bounds[2] - o.bounds[0]) * (o.bounds[3] - o.bounds[1]) < (maxX - minX) * (maxZ - minZ) / 2), `${id}: an obstacle fills the cabin`);
}
console.log(`Travel sets: ${travel.map(id => `${id} ${locationMapFile(id).location.seats.length} seats`).join(', ')} passed.`);
