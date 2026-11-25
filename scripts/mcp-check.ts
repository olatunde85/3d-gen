/**
 * Checks the ara3d MCP server (packages/cli/dist/cli.js mcp) the way an AI assistant uses it: the handshake, the tool
 * list, each tool, characters written to disk with a builder link, progress messages and mistakes reported as tool
 * errors. Uses the local character data. Build the CLI first: npx vite build --config packages/cli/vite.config.ts
 *   npx tsx scripts/mcp-check.ts
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { decodeCharacter } from '../src/app/share';
import { linkedFile } from '../src/app/links';
import { assistExample } from '../src/studio/assist';
import { playExample } from '../src/play/assist';
import { QUICKSTART_EXAMPLE } from '../packages/cli/src/film-quickstart';

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
  // The character schema comes in parts that each fit one answer, and ends with the detail sliders' list.
  const LIMIT = 20_000;
  const schemaParts: string[] = [];
  for (let part = 1; part < 10; part++) { const t = (await call('character_schema', { part })).content[0].text;schemaParts.push(t);assert.ok(t.length <= LIMIT, `character_schema part ${part}: ${t.length} characters`);if (!/Continue with/.test(t)) break; }
  assert.match(schemaParts[0], /"\$schema"/);assert.match(schemaParts.join(''), /Slider IDs are group\/name; two-way \(-1\.\.1\) unless a range is given\. \w+\/: [\w-]+/);
  assert.equal((await call('character_schema', { part: 99 })).isError, true);
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
  // A model from another tool (the GLB just written stands in for one): a rifle and animations on it, written as GLB.
  const modelFile = join(out, readdirSync(out).find((f) => f.endsWith('.glb'))!);
  const model = await call('create_character', { model: modelFile, name: 'Imported hero', weapon: 'rifle', animations: ['idle', 'rifle_aim'], formats: ['glb'], out_dir: 'models' }), modelText = model.content[0].text;
  assert.equal(model.isError, false, modelText);assert.match(modelText, /^Read Imported hero: \d+ cm tall, \d+ bones/);assert.match(modelText, /has no builder link/);
  const written = /Files:\n {2}(.+\.glb) \(/.exec(modelText)?.[1];
  assert.ok(written && existsSync(written), `model written: ${modelText}`);
  const json = (() => { const d = readFileSync(written!);return JSON.parse(d.subarray(20, 20 + d.readUInt32LE(12)).toString()); })();
  assert.deepEqual(json.animations.map((a: { name: string }) => a.name).sort(), ['Idle', 'Rifle aim idle'].sort(), 'its animations');
  assert.ok(json.nodes.some((n: { name?: string }) => n.name === 'WeaponR'), 'the rifle on its WeaponR socket');
  for (const [args, expected] of [[{ model: join(out, 'nobody.fbx') }, /there's no file/], [{ model: join(out, 'hero.obj') }, /GLB, glTF, VRM or FBX/], [{ model: modelFile, colors: { top: '#ffffff' } }, /keeps its own look/], [{ model: modelFile, preset: 'The Bride' }, /exactly one of/]] as const) {
    const r = await call('create_character', args);assert.equal(r.isError, true);assert.match(r.content[0].text, expected);
  }
  console.log('OK model from another tool:', modelText.split('\n')[0]);
  // Without formats, only the link: no file, and the assistant is told to ask which format the user wants.
  const before = existsSync(out) ? readdirSync(out).length : 0;
  const linkOnly = await call('create_character', { preset: 'Teen', name: 'Linked teen', height_cm: 158 }), linkText = linkOnly.content[0].text;
  assert.equal(linkOnly.isError, false, linkText);assert.match(linkText, /No files written \(link only\)\. Ask the user/);assert.match(linkText, /https:\/\/ara3dgen\.com\/app\/#c=/);
  assert.equal(existsSync(out) ? readdirSync(out).length : 0, before, 'a link-only character wrote a file');
  // height_cm fits the height slider to the centimetres asked for.
  const cm = Number(/(\d+) cm tall/.exec(linkText)![1]);assert.ok(Math.abs(cm - 158) <= 1, `asked for 158 cm, got ${cm} cm`);
  console.log('OK link only and height_cm:', linkText.split('\n')[0]);
  // A wrong ID lists the ones allowed.
  const pattern = await call('create_character', { character: { preset: 'Teen', params: { garmentStyles: { pencil_skirt_midi: { pattern: 'tartan' } } } } });
  assert.equal(pattern.isError, true);assert.match(pattern.content[0].text, /use one of solid, ankara_web/);

  // Mistakes come back as tool errors the assistant can read and fix.
  for (const [args, expected] of [[{ preset: 'Nobody' }, /Unknown preset "Nobody"/], [{ preset: 'The Bride', random: 3 }, /exactly one of/], [{ preset: 'The Bride', animations: ['moonwalk'] }, /Unknown animation "moonwalk"/], [{ preset: 'The Bride', colors: { shirt: '#ffffff' } }, /Unknown colour "shirt"/]] as const) {
    const r = await call('create_character', { ...args, formats: ['glb'] });
    assert.equal(r.isError, true);assert.match(r.content[0].text, expected);
  }
  // Films and games: guides in parts small enough for one tool answer, then files checked, saved and linked.
  for (const tool of ['film_guide', 'game_guide']) {
    const overview = (await call(tool, { brief: 'A short chase' })).content[0].text;
    const topics = [...overview.matchAll(/^- ([a-z0-9-]+): .*?(?:, (\d+) parts)?\)$/gm)].map((m) => [m[1], Number(m[2] ?? 1)] as const);
    assert.ok(overview.length <= LIMIT && topics.length >= 5, `${tool} overview: ${overview.length} characters, ${topics.length} topics`);
    for (const [topic, parts] of topics) for (let n = 1; n <= parts; n++) {
      const t = (await call(tool, { topic: n === 1 ? topic : `${topic}-${n}` }));assert.equal(t.isError, false, t.content[0].text);
      assert.ok(t.content[0].text.length <= LIMIT, `${tool} ${topic} part ${n}: ${t.content[0].text.length} characters`);
      // A JSON piece of a split topic is valid JSON on its own.
      for (const line of t.content[0].text.split('\n')) { const j = /^(?:JSON at [^:]+: )?([[{].*)$/.exec(line);if (j && parts > 1) JSON.parse(j[1]); }
    }
    const wrong = await call(tool, { topic: 'nope' });assert.equal(wrong.isError, true);assert.match(wrong.content[0].text, /Unknown topic/);
    console.log(`OK ${tool}: overview ${Math.round(overview.length / 1000)}k characters, topics ${topics.join(', ')}`);
  }
  // The quickstart is one short answer and brings the set's map when the location is given.
  const quick = (await call('film_guide', { brief: 'A mother finds her daughter gone', location: 'bedroom-night' })).content[0].text;
  assert.match(quick, /^ARA STUDIO FILM QUICKSTART/);assert.match(quick, /STAGING MAP: bedroom-night/);assert.match(quick, /- core-rules: /);
  assert.ok(quick.length < 14_000, `the quickstart with its map is ${quick.length} characters`);
  // Its worked example, with a character made earlier passed as its builder link, is a clean film.
  const example = structuredClone(QUICKSTART_EXAMPLE) as { actors: Record<string, unknown>[] };delete example.actors[0].preset;example.actors[0].character = /https:\/\/ara3dgen\.com\/app\/#c=\S+/.exec(linkText)![0];
  const routed = (await call('create_film', { film: example })).content[0].text;
  assert.match(routed, /^Checked: Bedroom at night · Linked teen \+ Businesswoman/m, routed);assert.match(routed, /Staging check: every character/);
  console.log(`OK quickstart: ${Math.round(quick.length / 1000)}k characters with the map; its example film checks clean`);
  // Any set's staging map comes from the guide: no asking the user to export one.
  const court = (await call('film_guide', { topic: 'location-map', location: 'sports-court' })).content[0].text;
  assert.match(court, /"id":"sports-court"/);assert.ok(court.length <= LIMIT);
  const guideText = (await call('film_guide', { topic: 'coordinates-and-travel-calculation' })).content[0].text;assert.doesNotMatch(guideText, /ask the user to send/);
  for (let n = 1, more = true; more; n++) { const t = (await call('film_guide', { topic: n === 1 ? 'location-map' : `location-map-${n}`, location: 'forest-trail' })).content[0].text;assert.ok(t.length <= LIMIT, `forest-trail map part ${n}`);more = /Continue with/.test(t);if (n > 1) assert.match(t, /^STAGING MAP: forest-trail \(part/); }
  assert.equal((await call('film_guide', { topic: 'location-map', location: 'the-moon' })).isError, true);
  assert.equal((await call('film_guide', { topic: 'location-map' })).isError, true);
  const film = await call('create_film', { film: assistExample() });
  assert.equal(film.isError, false, film.content[0].text);assert.match(film.content[0].text, /^Staging check: /m);
  // A walk straight through the set's walls is reported, so the assistant can fix it.
  const blocked = assistExample();blocked.actors[0] = { ...blocked.actors[0], x: 0, z: 0, yaw: 90, beats: [{ id: 'cross', clip: 'walk', duration: 12, move: true }] };
  const walls = (await call('create_film', { film: blocked })).content[0].text;
  assert.match(walls, /Staging check: \d+ problems?/, walls);
  const filmText = film.content[0].text, filmFile = /Saved: (.+)$/m.exec(filmText)![1], filmLink = /(https:\/\/ara3dgen\.com\/studio\/#film=[\w-]+)/.exec(filmText)![1];
  assert.ok(filmFile.startsWith(out) && existsSync(filmFile) && filmFile.endsWith('.ara-studio.json'));
  assert.deepEqual(JSON.parse((await linkedFile(new URL(filmLink).hash, 'film'))!), assistExample());
  console.log('OK create_film:', filmText.split('\n')[0]);
  // A film of three scenes in different sets: each scene is checked and summarised, the link carries all of them.
  const scene = (template: string, sceneName: string, extra = {}) => { const { kind, version, title, aspect, caption, ...rest } = assistExample() as Record<string, unknown>;void kind;void version;void title;void aspect;void caption;return { ...rest, template, sceneName, ...extra }; };
  const threeStops = { kind: 'ara-studio', version: 3, title: 'Three stops', aspect: 'landscape', caption: true, scenes: [scene('city-bus', 'On the bus'), scene('train-carriage', 'The train', { transition: 'fade' }), scene('airliner-cabin', 'Flying home')] };
  const multi = await call('create_film', { film: threeStops }), multiText = multi.content[0].text;
  assert.equal(multi.isError, false, multiText);assert.match(multiText, /^Checked: 3 scenes/m);assert.match(multiText, /Scene 2 \(The train\), fading in: Train carriage/);
  const multiFile = JSON.parse(readFileSync(/Saved: (.+)$/m.exec(multiText)![1], 'utf8'));assert.equal(multiFile.version, 3);assert.equal(multiFile.scenes.length, 3);assert.equal(multiFile.scenes[1].transition, 'fade');
  assert.deepEqual(JSON.parse((await linkedFile(new URL(/(https:\/\/ara3dgen\.com\/studio\/#film=[\w-]+)/.exec(multiText)![1]).hash, 'film'))!), threeStops);
  const tooMany = await call('create_film', { film: { ...threeStops, scenes: Array(6).fill(threeStops.scenes[0]) } });assert.equal(tooMany.isError, true);assert.match(tooMany.content[0].text, /one to 5 scenes/);
  const badScene = await call('create_film', { film: { ...threeStops, scenes: [threeStops.scenes[0], { ...threeStops.scenes[1], template: 'the-moon' }] } });assert.equal(badScene.isError, true);assert.match(badScene.content[0].text, /Scene 2/);
  const filmWide = await call('create_film', { film: { ...threeStops, scenes: [{ ...threeStops.scenes[0], title: 'Wrong place' }] } });assert.equal(filmWide.isError, true);assert.match(filmWide.content[0].text, /on the film/);
  assert.match((await call('film_guide', { topic: 'core-rules' })).content[0].text, /FILMS OF SEVERAL SCENES/);
  console.log('OK create_film with scenes:', multiText.split('\n')[0]);
  const game = await call('create_game', { game: playExample() });
  assert.equal(game.isError, false, game.content[0].text);
  const gameText = game.content[0].text, gameLink = /(https:\/\/ara3dgen\.com\/play\/#game=[\w-]+)/.exec(gameText)![1];
  assert.ok(existsSync(/Saved: (.+)$/m.exec(gameText)![1]));assert.deepEqual(JSON.parse((await linkedFile(new URL(gameLink).hash, 'game'))!), playExample());
  console.log('OK create_game:', gameText.split('\n')[0]);
  // Chapters in any order: a mission after a runner and a race, a rescue after a chapter with objective steps, and
  // a briefcase at night; the summary covers every chapter.
  const runner = { theme: 'market-street', lanes: 3, startSpeed: 10, maxSpeed: 24, speedRamp: 'steady', obstacles: ['barrier-low', 'gap'], powerUps: ['magnet'], chaser: 'none', goal: { type: 'distance', target: 1500 }, revive: true };
  const base = playExample(), night = { time: 'night', weather: 'rain' };
  const story = await call('create_game', { game: { ...base, mode: 'runner', runner, chapters: [
    { id: 'race', mode: 'race', identity: { title: 'Chase', briefing: 'Catch them.' }, race: { track: 'harbour-sprint', laps: 2, opponents: 3, aiSkill: 'medium' } },
    { id: 'depot', mode: 'mission', identity: { title: 'Depot', briefing: 'Find the case.' }, mission: { story: 'escape', extraction: 'foot', location: 'depot', layout: 'dense', variation: 3, cargo: 'briefcase', environment: night } },
  ] } });
  assert.equal(story.isError, false, story.content[0].text);
  assert.match(story.content[0].text, /Chapter 1: [^]*Endless runner[^]*Chapter 2: [^]*Arcade race[^]*Chapter 3: [^]*Escape/);
  const steps = await call('create_game', { game: { ...base, mission: { ...base.mission, story: 'escape', extraction: 'foot', steps: [{ type: 'reach', label: 'Find the office' }, { type: 'download', duration: 10 }] }, companion: undefined, chapters: [
    { id: 'rescue', mode: 'mission', identity: { title: 'Rescue', briefing: 'Free her.' }, mission: { story: 'rescue', location: 'urban-block' }, companion: base.companion },
  ] } });
  assert.equal(steps.isError, false, steps.content[0].text);
  console.log('OK chapters in any order, briefcase at night, every chapter summarised');
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
