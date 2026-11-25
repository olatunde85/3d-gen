/**
 * Checks Studio set files outside the browser: reading and refusing them, their cost and staging map, registering
 * them in the catalogue and staging checks, films whose set is missing, and `ara3d set check` / `ara3d schema set`
 * (build the CLI first: npx vite build --config packages/cli/vite.config.ts).
 *   npx tsx scripts/set-files-check.ts
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { FIXTURE_ID, setFile } from './set-fixture';
import { readSetFile, SET_LIMITS } from '../src/studio/set-files';
import { checkSetFile, registerSets } from '../src/studio/set-check';
import { isMissingSet, sceneById, searchScenes, SETS, type SetId } from '../src/studio/catalog';
import { locationMap } from '../src/studio/spatial-maps';
import { newProject, parseProject } from '../src/studio/project';
import { stagingReport } from '../src/studio/spatial-report';

const buffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const refused = (bytes: Uint8Array, pattern: RegExp) => assert.throws(() => readSetFile(buffer(bytes)), pattern);

// Reading: the details, the preview-less file's cost.
const { manifest, cost } = readSetFile(buffer(setFile()));
assert.equal(manifest.id, FIXTURE_ID);assert.equal(manifest.release, '1.0');
assert.deepEqual(cost, { triangles: 24, meshes: 2, megapixels: 0 });
console.log('OK a set file is read, with its cost');

// Refusals say why.
refused(setFile({ manifest: null }), /no set details/);
refused(setFile({ manifest: { id: 'Tiny Yard' } }), /author\/set in lower case/);
refused(setFile({ manifest: { author: '' } }), /author and licence/);
refused(setFile({ manifest: { release: 'v1' } }), /release/);
refused(setFile({ manifest: { family: 'castle' } }), /category, family or mood/);
refused(setFile({ manifest: { room: [5, -4, -5, 4] } }), /room/);
refused(setFile({ manifest: { lightmaps: { yard: { image: 3, scale: 2 } } } }), /lightmaps are missing/);
refused(setFile({ manifest: { version: 2 } }), /newer Studio/);
refused(setFile({ lightmap: 16384 }), new RegExp(`too heavy.*268\\.4 megapixels of textures \\(up to ${SET_LIMITS.megapixels} megapixels`));
assert.throws(() => readSetFile(buffer(new TextEncoder().encode('{"kind":"ara-studio"}'))), /Export for Ara Studio add-on/);
console.log('OK set files that can\'t be used are refused, saying why');

// The staging map, from the geometry: the box is an obstacle, the floor isn't; the seat and room come through.
const known = await checkSetFile(buffer(setFile()));
assert.equal(known.map.obstacles.length, 1);
assert.deepEqual(known.map.obstacles[0].bounds, [1.5, 0.5, 2.5, 1.5]);
assert.deepEqual(known.map.bounds, [-4.95, -3.95, 4.95, 3.95]);
assert.equal(known.map.seats.length, 1);assert.equal(known.map.seats[0].yaw, 90);
console.log('OK its staging map is measured from its geometry');

// Registered, it's a set like Studio's own: listed, searchable, staged; a film in it parses.
const before = SETS.length;
registerSets([known]);
assert.equal(SETS.length, before + 1);assert.equal(sceneById.get(FIXTURE_ID as SetId)?.name, 'Tiny yard');
assert.ok(searchScenes('tester yours').some((s) => s.id === FIXTURE_ID));
assert.equal(locationMap(FIXTURE_ID as SetId).obstacles.length, 1);
const film = newProject('portrait');film.template = FIXTURE_ID as SetId;film.title = 'Test';
film.actors[0].x = 2;film.actors[0].z = 1;
const parsed = parseProject(JSON.stringify(film));
assert.equal(parsed.template, FIXTURE_ID);
assert.ok(stagingReport(parsed).issues.length > 0, 'a character standing in the box is a staging problem');
console.log('OK a registered set is listed, searchable and staged');

// Removed again, a film in it still opens, its set noted missing, staged on an empty room.
registerSets([]);
assert.equal(SETS.length, before);
const missing = parseProject(JSON.stringify(film));
assert.equal(missing.template, FIXTURE_ID);assert.equal(isMissingSet(FIXTURE_ID as SetId), true);
assert.equal(locationMap(FIXTURE_ID as SetId).obstacles.length, 0);
assert.throws(() => parseProject(JSON.stringify({ ...film, template: 'not a set' })), /Unsupported scene/);
console.log('OK a film whose set is missing keeps it and opens');

// The command line.
const cli = join(resolve(import.meta.dirname, '..'), 'packages/cli/dist/cli.js');
if (!existsSync(cli)) throw Error('Build the CLI first: npx vite build --config packages/cli/vite.config.ts');
const dir = mkdtempSync(join(tmpdir(), 'ara-set-'));
try {
  const file = join(dir, 'tiny-yard.glb'), heavy = join(dir, 'heavy.glb');
  writeFileSync(file, setFile());writeFileSync(heavy, setFile({ lightmap: 16384 }));
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  const ok = run('set', 'check', file);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /^Tiny yard 1\.0 \(tester\/tiny-yard\) by Tester, CC0-1\.0: OK$/m);
  assert.match(ok.stdout, /Cost: 24 of 300,000 triangles, 2 of 400 meshes/);assert.match(ok.stdout, /1 seat; staging map with 1 obstacle$/m);
  const json = JSON.parse(run('set', 'check', file, '--json').stdout);
  assert.equal(json.set.id, FIXTURE_ID);assert.equal(json.map.obstacles.length, 1);assert.equal(json.limits.triangles, SET_LIMITS.triangles);
  const bad = run('set', 'check', heavy);
  assert.equal(bad.status, 1);assert.match(bad.stderr, /too heavy/);
  assert.match(run('set', 'check', join(dir, 'none.glb')).stderr, /No such file/);
  const schema = JSON.parse(run('schema', 'set').stdout);
  assert.equal(schema.$id, 'https://ara3dgen.com/schemas/studio-set.v1.json');assert.ok(schema.required.includes('license'));
  console.log('OK ara3d set check and ara3d schema set');
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('Set file checks passed.');
