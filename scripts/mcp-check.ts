/**
 * Checks the ara3d MCP server (packages/cli/dist/cli.js mcp) the way an AI assistant uses it: the handshake, the tool
 * list, each tool, characters written to disk with a builder link, progress messages and mistakes reported as tool
 * errors. Uses the local character data. Build the CLI first: npx vite build --config packages/cli/vite.config.ts
 *   npx tsx scripts/mcp-check.ts
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { decodeCharacter } from '../src/app/share';
import { linkedFile } from '../src/app/links';
import { assistExample } from '../src/studio/assist';
import { playExample } from '../src/play/assist';

const root = resolve(import.meta.dirname, '..'), cli = join(root, 'packages/cli/dist/cli.js');
if (!existsSync(cli)) throw Error('Build the CLI first: npx vite build --config packages/cli/vite.config.ts');
const out = mkdtempSync(join(tmpdir(), 'ara-mcp-'));
const server = spawn(process.execPath, [cli, 'mcp'], { env: { ...process.env, ARA3D_DATA: join(root, 'public/assets'), ARA3D_OUT: out }, stdio: ['pipe', 'pipe', 'pipe'] });
let stderr = '';server.stderr.on('data', (c) => { stderr += c; });
const waiting = new Map<number, (m: any) => void>(), progress: any[] = [];
const lines: string[] = [];
createInterface({ input: server.stdout }).on('line', (line) => {
  lines.push(line);
  const m = JSON.parse(line); // Every line on stdout must be a JSON-RPC message.
  if (m.method === 'notifications/progress') progress.push(m.params);
  else if (m.id !== undefined) waiting.get(m.id)?.(m);
});
let seq = 0;
const request = (method: string, params?: object) => new Promise<any>((ok) => { const id = ++seq;waiting.set(id, ok);server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n'); });
const call = async (name: string, args: object = {}, meta?: object) => (await request('tools/call', { name, arguments: args, ...(meta ? { _meta: meta } : {}) })).result as { content: { type: string; text: string }[]; isError: boolean };

try {
  const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');assert.equal(init.result.serverInfo.name, 'ara3d');assert.ok(init.result.capabilities.tools);
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const tools = (await request('tools/list')).result.tools.map((t: any) => t.name);
  assert.deepEqual(tools, ['list_presets', 'list_animations', 'list_props', 'character_schema', 'create_character', 'film_guide', 'create_film', 'game_guide', 'create_game']);
  console.log('OK handshake and tools:', tools.join(', '));

  assert.match((await call('list_presets')).content[0].text, /^The Soldier$/m);
  const dances = (await call('list_animations', { search: 'dance' })).content[0].text;
  assert.match(dances, /dance_groove/);assert.doesNotMatch(dances, /\brun\b \(/);
  assert.match((await call('list_props')).content[0].text, /Vehicles: .*motorcycle/);
  const schema = JSON.parse((await call('character_schema')).content[0].text);
  assert.ok(schema.properties?.params || schema.properties, 'schema has fields');
  console.log('OK lists and schema');

  // A preset with changes, in two formats, with progress messages.
  const made = await call('create_character', { preset: 'The Female Executive', animations: ['walk', 'wave'], formats: ['glb', 'fbx'], carry: 'none', colors: { outfit: '#1d2a44' } }, { progressToken: 'p1' });
  assert.equal(made.isError, false, made.content[0].text);
  const text = made.content[0].text, files = [...text.matchAll(/^\s+(\/\S+\.(?:glb|fbx))/gm)].map((m) => m[1]);
  assert.equal(files.length, 2, text);
  for (const f of files) assert.ok(f.startsWith(out) && existsSync(f), `${f} written`);
  assert.equal(readFileSync(files.find((f) => f.endsWith('.glb'))!).subarray(0, 4).toString(), 'glTF');
  const link = /#c=([\w-]+)/.exec(text)![1], shared = decodeCharacter(link, 'medium')!;
  assert.equal(shared.carry, 'none');assert.equal(shared.garmentStyles.set_pantsuit?.color, '#1d2a44');
  assert.ok(progress.some((p) => p.progressToken === 'p1') && progress.every((p) => p.progress <= p.total));
  console.log(`OK create_character: ${files.length} files, builder link, ${progress.length} progress messages\n${text.split('\n')[0]}`);

  // A designed character, with no animations.
  const designed = await call('create_character', { character: { preset: 'The Adventurer', params: { name: 'Desert scout', ageYears: 40 } }, animations: [], detail: 'low' });
  assert.equal(designed.isError, false, designed.content[0].text);assert.match(designed.content[0].text, /Made Desert scout/);
  console.log('OK designed character:', designed.content[0].text.split('\n')[0]);

  // Mistakes come back as tool errors the assistant can read and fix.
  for (const [args, expected] of [[{ preset: 'Nobody' }, /Unknown preset "Nobody"/], [{ preset: 'The Bride', random: 3 }, /exactly one of/], [{ preset: 'The Bride', animations: ['moonwalk'] }, /Unknown animation "moonwalk"/], [{ preset: 'The Bride', colors: { shirt: '#ffffff' } }, /Unknown colour "shirt"/]] as const) {
    const r = await call('create_character', { ...args, formats: ['glb'] });
    assert.equal(r.isError, true);assert.match(r.content[0].text, expected);
  }
  // Films and games: guides in parts small enough for one tool answer, then files checked, saved and linked.
  const LIMIT = 90_000; // about 25k tokens, which some assistants cap a tool answer at
  for (const tool of ['film_guide', 'game_guide']) {
    const overview = (await call(tool, { brief: 'A short chase' })).content[0].text;
    const topics = [...overview.matchAll(/^- ([a-z0-9-]+): /gm)].map((m) => m[1]);
    assert.ok(overview.length < LIMIT && topics.length >= 5, `${tool} overview: ${overview.length} characters, ${topics.length} topics`);
    for (const topic of topics) { const t = (await call(tool, { topic })).content[0].text;assert.ok(t.length < LIMIT, `${tool} ${topic}: ${t.length} characters`); }
    const wrong = await call(tool, { topic: 'nope' });assert.equal(wrong.isError, true);assert.match(wrong.content[0].text, /Unknown topic/);
    console.log(`OK ${tool}: overview ${Math.round(overview.length / 1000)}k characters, topics ${topics.join(', ')}`);
  }
  const film = await call('create_film', { film: assistExample() });
  assert.equal(film.isError, false, film.content[0].text);
  const filmText = film.content[0].text, filmFile = /Saved: (.+)$/m.exec(filmText)![1], filmLink = /(https:\/\/ara3dgen\.com\/studio\/#film=[\w-]+)/.exec(filmText)![1];
  assert.ok(filmFile.startsWith(out) && existsSync(filmFile) && filmFile.endsWith('.ara-studio.json'));
  assert.deepEqual(JSON.parse((await linkedFile(new URL(filmLink).hash, 'film'))!), assistExample());
  console.log('OK create_film:', filmText.split('\n')[0]);
  const game = await call('create_game', { game: playExample() });
  assert.equal(game.isError, false, game.content[0].text);
  const gameText = game.content[0].text, gameLink = /(https:\/\/ara3dgen\.com\/play\/#game=[\w-]+)/.exec(gameText)![1];
  assert.ok(existsSync(/Saved: (.+)$/m.exec(gameText)![1]));assert.deepEqual(JSON.parse((await linkedFile(new URL(gameLink).hash, 'game'))!), playExample());
  console.log('OK create_game:', gameText.split('\n')[0]);
  const badGame = await call('create_game', { game: { ...playExample(), mission: { ...playExample().mission, story: 'flee' } } });
  assert.equal(badGame.isError, true);assert.match(badGame.content[0].text, /Escape|story/);
  const badFilm = await call('create_film', { film: { ...assistExample(), template: 'the-moon' } });
  assert.equal(badFilm.isError, true);
  console.log('OK film and game mistakes reported as tool errors:', badGame.content[0].text.split('\n')[0], '/', badFilm.content[0].text.split('\n')[0]);

  assert.equal((await request('nope/method')).error.code, -32601);
  console.log('OK mistakes reported as tool errors');
  assert.ok(lines.every((l) => { try { JSON.parse(l);return true; } catch { return false; } }), 'stdout carries only JSON-RPC');
  console.log('MCP checks passed.');
} catch (error) {
  console.error(stderr);throw error;
} finally {
  server.stdin.end();server.kill();
  rmSync(out, { recursive: true, force: true });
}
