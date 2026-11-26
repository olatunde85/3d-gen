/**
 * ara3d mcp: a Model Context Protocol server, so AI assistants (Claude, Cursor, VS Code and others) can make Ara
 * characters on this machine. It speaks JSON-RPC over stdin and stdout; everything else it prints goes to stderr.
 *
 *   claude mcp add ara3d -- npx -y ara3d mcp
 */
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { AssetLibrary } from '../../../src/core/assets';
import { buildHuman, type Character } from '../../../src/core/human';
import { equipCharacter } from '../../../src/core/props/equip';
import { readModel } from './models';
import { triangleCount } from '../../../src/core/mesh';
import { DETAILS, PRESETS, type HumanParams } from '../../../src/core/params';
import { CLIPS } from '../../../src/core/anim/clips';
import { animationGroup } from '../../../src/core/anim/groups';
import { WEAPONS } from '../../../src/core/props/weapons';
import { CARRIED } from '../../../src/core/props/carry';
import { VEHICLE_CHOICES, vehicleStyleForChoice } from '../../../src/core/props/vehicles';
import { EXPRESSIONS } from '../../../src/core/face';
import { characterSchema } from '../../../src/app/character-assist';
import { encodeCharacter } from '../../../src/app/share';
import { planExport, runExport, type ExportFormat, type ExportSettings } from '../../../src/export';
import { carryForClips, characterParams, clipIds, type CharacterInput } from './library/generate';
import { usePackFiles } from './pack';
import { applyColors, COLOR_SLOTS, colorsOf, type CharacterColors } from './library/colors';
import { loadLibrary } from './data';
import { explain, writeSafely } from './safety';
import PACKAGE from '../package.json';
import { generateAssistGuide, loadStudioFilm, summarizeAssistProject } from '../../../src/studio/assist';
import { filmDuration, filmJson } from '../../../src/studio/film';
import { checkPlayPlacements, describeGame, generatePlayGuide, parsePlayInput } from '../../../src/play/assist';
import { gameProjects } from '../../../src/play/project';
import { fileLink } from '../../../src/app/links';
import { guideAnswer, textParts } from './guides';
import { filmQuickstart } from './film-quickstart';
import { compactSchema } from '../../../src/app/character-assist';
import { stagingReport } from '../../../src/studio/spatial-report';
import { BUILT_IN_SETS, isImportedSet, isMissingSet, sceneById, SET_ID, type SetId } from '../../../src/studio/catalog';
import { loadSetFiles } from './set';
import { locationMapFile } from '../../../src/studio/spatial-maps';
import { describeLesson, lessonGuide, parseAssistLesson } from '../../../src/educate/guide';
import { parseLesson } from '../../../src/educate/lesson';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const FORMATS: readonly ExportFormat[] = ['glb', 'fbx', 'obj', 'zip'];
/** Where characters go unless the assistant names a folder: assistants' working folders vary, so a fixed home. */
const OUT = process.env.ARA3D_OUT || join(homedir(), 'ara3d-characters');

const INSTRUCTIONS = `ara3d makes realistic, rigged and animated 3D humans on this machine and can write GLB, FBX or OBJ files.
create_character returns a builder link and writes no file unless you pass formats. After making a character, ask the user whether they want a file and in which format (GLB for the web, Godot or Blender; FBX for Unity or Unreal; OBJ for a static model; or all of them); pass formats only when they ask for one.
For a height in centimetres, pass height_cm: Ara sets the height slider to match.
Start from a preset (list_presets), a random seed, a share link from the Ara builder, or a character you design: call character_schema for every field, then pass { preset, params } to create_character. A rigged model from another tool on this machine (GLB, glTF, VRM or FBX, such as a Mixamo character) goes in model: it keeps its own look and takes Ara's animations, packs and props.
When writing files, choose only the animations needed (list_animations): every clip makes the file bigger and the build slower.
Each result includes a link that opens the character in the Ara builder, so the user can see it and keep editing.
Films: call film_guide once with the brief and the set's location. It returns a short quickstart (the format, a worked example, sets, presets and everyday clips) and that set's map; it is enough for most films. Give characters a start point and walk them with "to" points; Ara works out facing, travel and timing. Use hidden for entrances and exits, and builder links from create_character for characters made earlier. Then call create_film: it checks the film as Studio does (including the staging check), saves it and returns a Studio link; fix anything it reports and call it again. Read further film_guide topics only when the film needs them. Never ask the user to export a set's map. A set the user made in Blender (an Ara Studio set file, .glb) goes in set_files, given to film_guide and create_film alike: its ID (author/set) is then a location, with its own staging note and map. The user imports the same file in Studio (Import a set…) to see the film there.
Lessons: call lesson_guide with the brief (and the lesson to revise, if any), write the lesson it describes, then call create_lesson: it checks the lesson as Ara Educate does, lists anything worth a look (writing that goes over earlier writing, long speeches), saves it and returns an Educate link where the user hears it, changes it and exports the video. Lessons are facts people learn from: be accurate, and leave out anything you're unsure of.
Games: read game_guide (an overview, then the topics you need), write the game, then call create_game, which checks it as Ara Play does, saves it and returns a Play link.
Every answer fits in one tool result: a long topic or schema comes in numbered parts. Read them with these tools, not with shell commands on saved files.
People: follow the user's description of who a character is. Don't assume a nationality, ethnicity or culture they didn't ask for, and don't carry one character's background over to the next. The catalogue includes clothes, props and places from many cultures; none is a default. When the brief leaves it open, choose to suit the story or ask.`;

const SET_FILES = { type: 'array', items: { type: 'string' }, description: 'Ara Studio set files the user made in Blender (.glb files with the Export for Ara Studio add-on), as paths or https addresses. Their sets join the catalogue with their staging notes and maps, by their author/set IDs.' };

const TOOLS = [
  {
    name: 'list_presets',
    description: `The ${Object.keys(PRESETS).length} preset characters, such as "The Soldier" or "The Bride". Use one as a starting point for create_character.`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_animations',
    description: `The ${CLIPS.length} animation clips, by group, with their IDs. Pass clip IDs or category names (such as locomotion) to create_character.`,
    inputSchema: { type: 'object', properties: { search: { type: 'string', description: 'Only clips whose ID, name or group contains this, such as "dance" or "rifle".' }, packs: { type: 'array', items: { type: 'string' }, description: 'Content packs (.ara-pack.json files or https addresses) whose clips to list too.' } }, additionalProperties: false },
  },
  {
    name: 'list_props',
    description: 'Weapons, carried items and vehicles for create_character, and the expressions a character can wear.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'character_schema',
    description: 'The JSON schema of a character: every field (body, face, hair, clothes, colours, rig and more) with what it means and its allowed values. Read it before designing a character for create_character. It comes in parts: the answer says when there is another.',
    inputSchema: { type: 'object', properties: { part: { type: 'integer', minimum: 1, description: 'Which part (default 1).' } }, additionalProperties: false },
  },
  {
    name: 'create_character',
    description: 'Builds a character and returns its height and a link that opens it in the Ara builder (also usable as a film character). Writes 3D files only when formats is given. Give exactly one of preset, random, share_link, character or model.',
    inputSchema: {
      type: 'object',
      properties: {
        preset: { type: 'string', description: 'A preset name from list_presets.' },
        random: { type: 'integer', minimum: 0, maximum: 1_000_000_000, description: 'A seed for a random character; the same seed always gives the same person.' },
        share_link: { type: 'string', description: 'A share link from the Ara builder (https://ara3dgen.com/app/#c=...).' },
        character: { type: 'object', description: 'A designed character: { "preset": "The Adventurer", "params": { ...changes } }, with fields from character_schema.' },
        model: { type: 'string', description: 'The path of a rigged character model from another tool on this machine: GLB, glTF, VRM or FBX (Mixamo, Ready Player Me, VRoid, Character Creator and others). It keeps its own look; animations, packs and props go on it, and its textures are found in its folder. Write it with formats.' },
        name: { type: 'string', description: 'A name for the character, used for the file names.' },
        animations: { type: 'array', items: { type: 'string' }, description: 'Clip IDs or categories from list_animations (a pack\'s ID picks all its clips). Leave out for every clip (large files), or pass [] for none.' },
        packs: { type: 'array', items: { type: 'string' }, description: 'Content packs whose animations to add: .ara-pack.json files or https addresses. Their clips are "<pack>/<clip>".' },
        formats: { type: 'array', items: { enum: FORMATS }, description: 'Files to write, only when the user asks for them: glb (web, Godot, Blender), fbx (Unity, Unreal), obj (static) or zip (all of them). Leave out for the link alone.' },
        height_cm: { type: 'number', minimum: 50, maximum: 230, description: 'The height in centimetres (shoes included), such as 158. Sets the height slider to match.' },
        detail: { enum: DETAILS, description: 'low (about 25-50k triangles dressed; for crowds), medium (default, about 45-65k) or high (about 130-170k).' },
        root_motion: { type: 'boolean', description: 'Walks and runs move forward instead of playing in place.' },
        weapon: { enum: WEAPONS, description: 'A weapon in the hand; "none" takes away a preset\'s own.' },
        carry: { enum: CARRIED, description: 'Something to carry; "none" takes away a preset\'s own.' },
        vehicle: { enum: VEHICLE_CHOICES, description: 'A vehicle fitted to the rider; include its riding clip in animations.' },
        colors: { type: 'object', properties: Object.fromEntries(COLOR_SLOTS.map((s) => [s, { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }])), additionalProperties: false, description: 'New colours for the outfit, top, jacket, bottom, shoes, carried item or vehicle, such as { "outfit": "#1d2a44" }.' },
        out_dir: { type: 'string', description: `The folder to write to (default ${OUT}).` },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'film_guide',
    description: 'How to write an Ara Studio film. Without a topic: a short quickstart (format, worked example, sets, presets, everyday clips, music), plus the set\'s map when location is given, and a list of further topics to read only when needed.',
    inputSchema: { type: 'object', properties: {
      topic: { type: 'string', description: 'A topic key from the overview\'s list.' },
      brief: { type: 'string', description: 'What the user wants, included in the overview so the rules can point at it.' },
      location: { anyOf: [{ enum: [...BUILT_IN_SETS.map((s) => s.id)] }, { type: 'string', pattern: SET_ID.source }], description: 'The set the film uses: its staging map (obstacles, seats, routes) comes with the quickstart, or alone with topic "location-map". A set from set_files goes by its author/set ID.' },
      set_files: SET_FILES,
    }, additionalProperties: false },
  },
  {
    name: 'create_film',
    description: 'Checks an Ara Studio film (one scene, or up to five scenes in order) as Studio does, including its staging check (characters and vehicles against the set\'s ground, water and obstacles), saves it as .ara-studio.json and returns a summary, any staging problems and a link that opens it in Ara Studio. Errors name the field to fix.',
    inputSchema: { type: 'object', properties: { film: { type: 'object', description: 'The film, written following film_guide.' }, packs: { type: 'array', items: { type: 'string' }, description: 'Content packs (.ara-pack.json files or https addresses) whose animations the film uses, when the film doesn\'t list them in its own packs.' }, set_files: SET_FILES, out_dir: { type: 'string', description: `The folder to write to (default ${OUT}).` } }, required: ['film'], additionalProperties: false },
  },
  {
    name: 'lesson_guide',
    description: 'How to write an Ara Educate lesson: a 3D teacher writes on a whiteboard or chalkboard, shows slides, code and terminals on a projector screen, points and speaks every line, as a video of up to 10 minutes. Returns the format, the step types, how to teach well and an example.',
    inputSchema: { type: 'object', properties: { brief: { type: 'string', description: 'What to teach and who it\'s for, included in the guide.' }, lesson: { type: 'object', description: 'A lesson to revise (an .ara-lesson.json\'s contents): the guide asks to keep what the brief doesn\'t change.' } }, additionalProperties: false },
  },
  {
    name: 'create_lesson',
    description: 'Checks an Ara Educate lesson as Educate does (every step, the writing and graphs, the 10-minute limit), lists anything worth a look before the user films it, saves it as .ara-lesson.json and returns a link that opens it in Ara Educate. Errors name the step or field to fix.',
    inputSchema: { type: 'object', properties: { lesson: { type: 'object', description: 'The lesson, written following lesson_guide.' }, out_dir: { type: 'string', description: `The folder to write to (default ${OUT}).` } }, required: ['lesson'], additionalProperties: false },
  },
  {
    name: 'game_guide',
    description: 'How to write an Ara Play game (missions, races, endless runs, cast, city, story, chapters). Without a topic: the core rules and a list of topics; then ask for each topic you need, such as the map library.',
    inputSchema: { type: 'object', properties: { topic: { type: 'string', description: 'A topic key from the overview\'s list.' }, brief: { type: 'string', description: 'What the user wants, included in the overview so the rules can point at it.' } }, additionalProperties: false },
  },
  {
    name: 'create_game',
    description: 'Checks an Ara Play game as Play does (including where everything is placed on the map), saves it as .ara-play.json and returns a summary and a link that opens it in Ara Play. Errors name the field to fix.',
    inputSchema: { type: 'object', properties: { game: { type: 'object', description: 'The game, written following game_guide.' }, out_dir: { type: 'string', description: `The folder to write to (default ${OUT}).` } }, required: ['game'], additionalProperties: false },
  },
];

type Args = Record<string, unknown>;
type Send = (message: object) => void;

let library: Promise<AssetLibrary> | undefined;
/** The character data, loaded once (and downloaded on the very first run). */
const data = () => (library ??= loadLibrary().catch((error) => { library = undefined;throw error; }));

async function listAnimations(args: Args) {
  const packs = await usePackFiles(Array.isArray(args.packs) ? args.packs.map(String) : []), ids = packs.map((p) => p.pack.id);
  const search = typeof args.search === 'string' ? args.search.toLowerCase() : '';
  const groups = new Map<string, string[]>();
  for (const c of CLIPS) {
    if (c.pack && !ids.includes(c.pack.id)) continue;
    const group = animationGroup(c);
    if (search && ![c.id, c.name, group, c.category].some((t) => t.toLowerCase().includes(search))) continue;
    groups.set(group, [...(groups.get(group) ?? []), `${c.id} (${c.name}${c.loop ? ', loops' : ''})`]);
  }
  if (!groups.size) return `No animation matches "${args.search}".`;
  return [...groups].map(([group, clips]) => `${group}:\n  ${clips.join('\n  ')}`).join('\n\n');
}

/** The height slider (0 to 1) that gives `metres` with these settings, found with quick low-detail builds. */
async function heightFor(lib: AssetLibrary, params: HumanParams, metres: number) {
  const measure = async (h: number) => (await buildHuman(lib, { ...params, height: h, detail: 'low', faceShapes: false, animations: false })).height;
  let a = 0.15, b = 0.85, ha = await measure(a), hb = await measure(b);
  for (let i = 0; i < 4 && Math.abs(hb - metres) > 0.004 && Math.abs(hb - ha) > 1e-4; i++) {
    const next = Math.min(1, Math.max(0, b + (metres - hb) * (b - a) / (hb - ha)));
    a = b;ha = hb;b = next;hb = await measure(b);
    if ((b === 0 && hb > metres) || (b === 1 && hb < metres)) break;
  }
  return Math.round(b * 1000) / 1000;
}

/** Builds the character and writes its files; reports progress to the assistant as it goes. */
async function createCharacter(args: Args, progress: (done: number, message: string) => void) {
  const sources = (['preset', 'random', 'share_link', 'character', 'model'] as const).filter((k) => args[k] !== undefined);
  if (sources.length !== 1) throw Error('Give exactly one of preset, random, share_link, character or model.');
  if (args.model !== undefined) return modelCharacter(args, progress);
  const formats = (args.formats as ExportFormat[] | undefined) ?? [];
  for (const f of formats) if (!FORMATS.includes(f)) throw Error(`Unknown format "${f}". Use ${FORMATS.join(', ')}.`);
  const packs = (await usePackFiles(Array.isArray(args.packs) ? args.packs.map(String) : [])).map((p) => p.pack.id);
  const clips = clipIds(args.animations === undefined ? 'all' : args.animations as string[], packs);
  progress(0.05, 'Loading the character data');
  const lib = await data();
  const input: CharacterInput = args.preset !== undefined ? String(args.preset) : args.random !== undefined ? { random: Number(args.random) }
    : args.share_link !== undefined ? String(args.share_link) : args.character as Record<string, unknown>;
  let params: HumanParams = characterParams(lib, input);
  params = {
    ...params,
    ...(typeof args.name === 'string' && args.name.trim() ? { name: args.name.trim() } : {}),
    ...(args.detail ? { detail: args.detail as HumanParams['detail'] } : {}),
    ...(args.weapon ? { weapon: args.weapon as HumanParams['weapon'] } : {}),
    ...(args.carry ? { carry: args.carry as HumanParams['carry'] } : args.animations !== undefined && carryForClips(clips) ? { carry: carryForClips(clips) } : {}),
    ...(args.vehicle ? { vehicle: args.vehicle as HumanParams['vehicle'], vehicleStyle: vehicleStyleForChoice(args.vehicle as HumanParams['vehicle'], params.vehicleStyle) } : {}),
    ...(clips.length ? {} : { animations: false }),
  };
  if (args.colors) params = applyColors(params, args.colors as CharacterColors);
  const out = typeof args.out_dir === 'string' && args.out_dir ? (isAbsolute(args.out_dir) ? args.out_dir : resolve(OUT, args.out_dir)) : OUT;
  if (formats.length) mkdirSync(out, { recursive: true });

  const started = performance.now();
  if (args.height_cm !== undefined) {
    const cm = Number(args.height_cm);
    if (!Number.isFinite(cm) || cm < 50 || cm > 230) throw Error('height_cm: use a number of centimetres from 50 to 230.');
    progress(0.1, `Fitting ${params.name} to ${Math.round(cm)} cm`);
    params = { ...params, height: await heightFor(lib, params, cm / 100) };
  }
  progress(0.2, `Building ${params.name}`);
  const character = await buildHuman(lib, params), written: string[] = [];
  for (const [i, format] of formats.entries()) {
    progress(0.35 + (0.6 * i) / formats.length, `Writing ${format.toUpperCase()}`);
    const settings: ExportSettings = {
      mode: !character.rig || format === 'obj' ? 'static' : params.animations ? 'animated' : 'rigged', format: format === 'zip' ? 'all' : format,
      clips, packaging: 'embedded', clipMesh: false, rootMotion: !!args.root_motion, loopSuffix: false, weaponFile: 'held', stageProps: false,
    };
    const file = await runExport(lib, character, planExport(character, settings));
    const path = join(out, file.name);
    writeSafely(path, file.data);written.push(`${path} (${(file.data.length / 1e6).toFixed(1)} MB)`);
  }
  const colors = colorsOf(params);
  return [
    `Made ${params.name}: ${(character.height * 100).toFixed(0)} cm tall, ${triangleCount(character.mesh).toLocaleString('en')} triangles${written.length ? `, ${clips.length} animation${clips.length === 1 ? '' : 's'}` : ''}, in ${((performance.now() - started) / 1000).toFixed(1)} s.`,
    written.length ? `Files:\n  ${written.join('\n  ')}` : 'No files written (link only). Ask the user whether they want a file, and which format: GLB (web, Godot, Blender), FBX (Unity, Unreal), OBJ (static) or all of them.',
    `See it and keep editing in the Ara builder: https://ara3dgen.com/app/#c=${encodeCharacter(params)}`,
    ...(Object.keys(colors).length ? [`Colours that can be changed: ${Object.entries(colors).map(([k, v]) => `${k} ${v}`).join(', ')}`] : []),
  ].join('\n\n');
}

/** A model from another tool, with the props asked for, written in the formats asked for. */
async function modelCharacter(args: Args, progress: (done: number, message: string) => void) {
  const file = resolve(String(args.model));
  if (!/\.(glb|gltf|vrm|fbx)$/i.test(file)) throw Error('model: give the path of a GLB, glTF, VRM or FBX file.');
  if (!existsSync(file)) throw Error(`model: there's no file at ${file}.`);
  for (const key of ['height_cm', 'colors'] as const) if (args[key] !== undefined) throw Error(`${key} changes Ara's own characters; a model from another tool keeps its own look.`);
  const formats = (args.formats as ExportFormat[] | undefined) ?? [];
  for (const f of formats) if (!FORMATS.includes(f)) throw Error(`Unknown format "${f}". Use ${FORMATS.join(', ')}.`);
  const packs = (await usePackFiles(Array.isArray(args.packs) ? args.packs.map(String) : [])).map((p) => p.pack.id);
  const clips = clipIds(args.animations === undefined ? 'all' : args.animations as string[], packs);
  progress(0.05, 'Loading the character data');
  const lib = await data(), started = performance.now();
  progress(0.15, `Reading ${file.split(/[\\/]/).pop()}`);
  const { imported, found } = await readModel(lib, file);
  const carry = (args.carry as HumanParams['carry'] | undefined) ?? (args.animations !== undefined ? carryForClips(clips) : undefined) ?? 'none';
  const character: Character = equipCharacter(imported.character, { weapon: (args.weapon as HumanParams['weapon'] | undefined) ?? 'none', carry, vehicle: (args.vehicle as HumanParams['vehicle'] | undefined) ?? 'none' }, lib);
  if (typeof args.name === 'string' && args.name.trim()) character.params = { ...character.params, name: args.name.trim() };
  if (args.detail) character.params = { ...character.params, detail: args.detail as HumanParams['detail'] };
  if (!clips.length) character.params = { ...character.params, animations: false };
  const out = typeof args.out_dir === 'string' && args.out_dir ? (isAbsolute(args.out_dir) ? args.out_dir : resolve(OUT, args.out_dir)) : OUT, written: string[] = [];
  if (formats.length) mkdirSync(out, { recursive: true });
  for (const [i, format] of formats.entries()) {
    progress(0.35 + (0.6 * i) / formats.length, `Writing ${format.toUpperCase()}`);
    const settings: ExportSettings = {
      mode: format === 'obj' ? 'static' : character.params.animations ? 'animated' : 'rigged', format: format === 'zip' ? 'all' : format,
      clips, packaging: 'embedded', clipMesh: false, rootMotion: !!args.root_motion, loopSuffix: false, weaponFile: 'held', stageProps: false,
    };
    const result = await runExport(lib, character, planExport(character, settings)), path = join(out, result.name);
    writeSafely(path, result.data);written.push(`${path} (${(result.data.length / 1e6).toFixed(1)} MB)`);
  }
  return [
    `Read ${character.params.name}: ${(character.height * 100).toFixed(0)} cm tall, ${imported.report.bones} bones (${imported.report.animated} animated by Ara), ${triangleCount(character.mesh).toLocaleString('en')} triangles${imported.report.faceShapes.length ? `, ${imported.report.faceShapes.length} face shapes` : ''}, in ${((performance.now() - started) / 1000).toFixed(1)} s.${found ? ` ${found[0].toUpperCase()}${found.slice(1)}.` : ''}`,
    ...(imported.report.notes.length ? [`Notes:\n  ${imported.report.notes.join('\n  ')}`] : []),
    written.length ? `Files:\n  ${written.join('\n  ')}` : 'No files written. Ask the user which format they want: GLB (web, Godot, Blender), FBX (Unity, Unreal), OBJ (static) or all of them, and call create_character again with formats.',
    'A model from another tool has no builder link: the user can open the file in the Ara builder with Open character (or drop it on the view) to see it there and use it in Studio.',
  ].join('\n\n');
}

/** The folder to write to: the assistant's choice (relative to the default folder) or the default. */
function outDir(args: Args) {
  const out = typeof args.out_dir === 'string' && args.out_dir ? (isAbsolute(args.out_dir) ? args.out_dir : resolve(OUT, args.out_dir)) : OUT;
  mkdirSync(out, { recursive: true });return out;
}
const fileName = (title: string, fallback: string) => (title.trim().replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || fallback).slice(0, 60);

/** Checks a film, saves it and returns where it went and the link that opens it in Studio. */
async function createFilm(args: Args) {
  if (!args.film || typeof args.film !== 'object') throw Error('Pass the film as an object in "film".');
  await usePackFiles(Array.isArray(args.packs) ? args.packs.map(String) : []);
  const loaded = await loadSetFiles(setFiles(args));
  const scenes = await loadStudioFilm(JSON.stringify(args.film), (await data()).catalog), file = filmJson(scenes), many = scenes.length > 1;
  // The link carries the film as written, with the packs its animations come from.
  const json = JSON.stringify(file.packs ? { ...(args.film as object), packs: file.packs } : args.film);
  const path = join(outDir(args), `${fileName(scenes[0].title, 'film')}.ara-studio.json`);
  writeSafely(path, new TextEncoder().encode(JSON.stringify(file, null, 2) + '\n'));
  // Studio's staging check for every scene, at reference body sizes: what walks or drives through something, or off the set.
  const issues = scenes.flatMap((scene, i) => stagingReport(scene).issues.map((issue) => `${many ? `Scene ${i + 1}, ` : ''}${issue.entity}, ${issue.start}–${issue.end} s: ${issue.message}`));
  const report = issues.length
    ? `Staging check: ${issues.length} problem${issues.length === 1 ? '' : 's'} at reference body sizes. Fix them (positions, yaw or durations) and call create_film again:\n  ${issues.slice(0, 12).join('\n  ')}${issues.length > 12 ? `\n  and ${issues.length - 12} more` : ''}`
    : `Staging check: every character and vehicle${many ? ' in every scene' : ''} stays clear of the set's obstacles and water and inside its bounds (at reference body sizes).`;
  const summary = many ? `${scenes.length} scenes, ${Math.round(filmDuration(scenes))}s in all:\n${scenes.map((s, i) => `  Scene ${i + 1}${s.sceneName ? ` (${s.sceneName})` : ''}${i && s.transition === 'fade' ? ', fading in' : ''}: ${summarizeAssistProject(s)}`).join('\n')}` : summarizeAssistProject(scenes[0]);
  // Sets made in Blender: checked against when their files were given; Studio needs the same files imported.
  const templates = [...new Set(scenes.map((s) => s.template))];
  const sets = [
    ...templates.filter(isMissingSet).map((id) => `Set ${id} isn't loaded, so the staging check used a plain empty room. Pass its set file in set_files and call create_film again, and import that file in Studio (Import a set…) before opening the film.`),
    ...templates.filter((id) => isImportedSet(id) && !isMissingSet(id)).map((id) => `Set ${id}: import ${loaded.find((s) => s.manifest.id === id)?.source ?? 'its set file'} in Studio (Import a set… under the set search) before opening the link, or the film shows a plain stage.`),
  ];
  return [`Checked: ${summary}`, report, ...sets, `Saved: ${path}`, `Open it in Ara Studio to watch, edit and record it as a video: ${fileLink('film', json)}`].join('\n\n');
}

/** The set_files argument: set files to read (paths or https addresses). */
function setFiles(args: Args): string[] {
  if (args.set_files === undefined) return [];
  if (!Array.isArray(args.set_files)) throw Error('Pass set_files as a list of set files (paths or https addresses).');
  return args.set_files.map(String);
}

/** Checks a lesson, saves it and returns what it holds, what to look over and the link that opens it in Educate. */
function createLesson(args: Args) {
  if (!args.lesson || typeof args.lesson !== 'object') throw Error('Pass the lesson as an object in "lesson".');
  const lesson = parseAssistLesson(JSON.stringify(args.lesson)), json = JSON.stringify(lesson, null, 2), about = describeLesson(lesson);
  const path = join(outDir(args), `${fileName(lesson.title, 'lesson')}.ara-lesson.json`);
  writeSafely(path, new TextEncoder().encode(json + '\n'));
  return [
    `Checked: ${about.headline}\n  ${about.facts.join('\n  ')}`,
    ...(about.warnings.length ? [`Worth a look (fix these and call create_lesson again, or tell the user):\n  ${about.warnings.join('\n  ')}`] : []),
    `Saved: ${path}`,
    `Open it in Ara Educate to hear it, change it and export the video (voices are made in the browser): ${fileLink('lesson', JSON.stringify(lesson))}`,
  ].join('\n\n');
}

/** Checks a game (settings and placement on the map), saves it and returns where it went and the link that opens it in Play. */
async function createGame(args: Args) {
  if (!args.game || typeof args.game !== 'object') throw Error('Pass the game as an object in "game".');
  const { catalog } = await data(), json = JSON.stringify(args.game), game = parsePlayInput(json, catalog);
  const placed = checkPlayPlacements(json, catalog);
  if (!placed.valid) throw Error(`The game's settings are valid, but it can't be laid out on its map:\n${placed.chapters.filter((c) => !c.ok).map((c) => `${c.id}: ${'error' in c ? c.error : ''}`).join('\n')}`);
  const path = join(outDir(args), `${fileName(game.identity.title, 'game')}.ara-play.json`);
  writeSafely(path, new TextEncoder().encode(JSON.stringify(game, null, 2) + '\n'));
  // Every chapter, as each one plays.
  const chapters = gameProjects(game).map((chapter, i) => { const about = describeGame(chapter) as { headline: string; facts: string[] };return `${gameProjects(game).length > 1 ? `Chapter ${i + 1}: ` : ''}${about.headline}\n  ${about.facts.join('\n  ')}`; });
  return [`Checked:\n${chapters.join('\n')}`, `Saved: ${path}`, `Open it in Ara Play to play it, edit it, download it as a standalone web game or publish it: ${fileLink('game', json)}`].join('\n\n');
}

async function callTool(name: string, args: Args, progress: (done: number, message: string) => void): Promise<string> {
  if (name === 'list_presets') return Object.keys(PRESETS).join('\n');
  if (name === 'list_animations') return listAnimations(args);
  if (name === 'list_props') return [
    `Weapons: ${WEAPONS.filter((w) => w !== 'none').join(', ')}`,
    `Carried items: ${CARRIED.filter((c) => c !== 'none').join(', ')}`,
    `Vehicles: ${VEHICLE_CHOICES.filter((v) => v !== 'none').join(', ')} (auto fits the vehicle the chosen riding clips need)`,
    `Expressions (the "expression" field of a character): ${EXPRESSIONS.join(', ')}`,
  ].join('\n');
  if (name === 'character_schema') {
    const parts = textParts(JSON.stringify(compactSchema(characterSchema((await data()).catalog)))), n = args.part === undefined ? 1 : Number(args.part);
    if (!Number.isInteger(n) || n < 1 || n > parts.length) throw Error(`Choose a part from 1 to ${parts.length}.`);
    return `${parts[n - 1]}${parts.length > 1 ? `\n\n(Part ${n} of ${parts.length}.${n < parts.length ? ` Continue with { "part": ${n + 1} }.` : ''})` : ''}`;
  }
  if (name === 'create_character') return createCharacter(args, progress);
  const brief = typeof args.brief === 'string' ? args.brief : '';
  if (name === 'film_guide') {
    const sets = await loadSetFiles(setFiles(args));
    // One set file and no location: the film is in that set.
    const asked = args.location ?? (sets.length === 1 ? sets[0].manifest.id : undefined);
    const location = typeof asked === 'string' && sceneById.has(asked as SetId) && !isMissingSet(asked as SetId) ? asked as SetId : undefined;
    if (asked !== undefined && !location) throw Error(isImportedSet(String(asked) as SetId) ? `The set "${String(asked)}" isn't loaded: pass its set file (.glb) in set_files.` : `Unknown location "${String(asked)}". Use an id from the complete-location-catalogue topic.`);
    const map = /^location-map(?:-(\d+))?$/.exec(String(args.topic ?? ''));
    if (map) {
      // Any set's full staging map, in parts when it is a big one.
      if (!location) throw Error('Pass "location" with the set\'s id from the complete-location-catalogue topic.');
      const parts = textParts(JSON.stringify(locationMapFile(location))), n = Number(map[1] ?? 1);
      if (n < 1 || n > parts.length) throw Error(`The ${location} map has ${parts.length} part${parts.length === 1 ? '' : 's'}.`);
      return `STAGING MAP: ${location}${parts.length > 1 ? ` (part ${n} of ${parts.length})` : ''}\n${parts[n - 1]}${n < parts.length ? `\n\n(Continue with topic "location-map-${n + 1}" and the same location.)` : ''}`;
    }
    const guide = generateAssistGuide((await data()).catalog, brief, undefined, location, undefined, undefined, { scenes: true, mapRequest: 'call film_guide with { "topic": "location-map", "location": "<its id>" } to get its full staging map, then plan the routes from it' });
    // The quickstart, with the chosen set's map when there is one, so most films need this one answer.
    const note = location && sceneById.get(location)?.staging, extra = location && !args.topic ? `${note ? `\n\nSTAGING NOTE: ${location}: ${note}` : ''}\n\nSTAGING MAP: ${location} (obstacles and seats; walk round them)\n${JSON.stringify(locationMapFile(location))}` : '\n\nSTAGING MAPS: once you choose a set, call film_guide with { "location": "<set id>" } (or the topic "location-map" with the location) for its map.';
    return guideAnswer(guide, args.topic, 'film_guide', extra, filmQuickstart(brief));
  }
  if (name === 'game_guide') return guideAnswer(generatePlayGuide((await data()).catalog, brief), args.topic, 'game_guide');
  if (name === 'create_film') return createFilm(args);
  if (name === 'create_game') return createGame(args);
  if (name === 'lesson_guide') {
    const current = args.lesson === undefined ? undefined : parseLesson(JSON.stringify(args.lesson));
    return lessonGuide(typeof args.brief === 'string' ? args.brief : '', current);
  }
  if (name === 'create_lesson') return createLesson(args);
  throw Error(`Unknown tool "${name}".`);
}

async function handle(message: { id?: string | number; method?: string; params?: Args }, send: Send) {
  const { id, method, params = {} } = message;
  const reply = (result: object) => id !== undefined && send({ jsonrpc: '2.0', id, result });
  const fail = (code: number, text: string) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message: text } });
  if (method === 'initialize') {
    const asked = String(params.protocolVersion ?? '');
    // Start loading the character data now, so the first character doesn't wait for it.
    data().catch(() => { /* Reported when a tool needs it. */ });
    return reply({ protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'ara3d', title: 'Ara 3D characters', version: PACKAGE.version }, instructions: INSTRUCTIONS });
  }
  if (method === 'ping') return reply({});
  if (method === 'tools/list') return reply({ tools: TOOLS });
  if (method === 'tools/call') {
    const token = (params._meta as Args | undefined)?.progressToken;
    const progress = (done: number, text: string) => { if (token !== undefined) send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: done, total: 1, message: text } }); };
    try {
      const text = await callTool(String(params.name), (params.arguments as Args) ?? {}, progress);
      return reply({ content: [{ type: 'text', text }], isError: false });
    } catch (error) {
      // A tool's own problem goes back to the assistant as a result, so it can fix its request and try again.
      return reply({ content: [{ type: 'text', text: explain(error) }], isError: true });
    }
  }
  if (method?.startsWith('notifications/')) return;
  fail(-32601, `Method not found: ${method}`);
}

export async function mcpCommand() {
  const send: Send = (message) => process.stdout.write(JSON.stringify(message) + '\n');
  console.error(`ara3d ${PACKAGE.version} MCP server: waiting for an assistant on stdin. Characters go to ${OUT}.`);
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const pending = new Set<Promise<unknown>>();
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message: { id?: string | number; method?: string; params?: Args };
    try { message = JSON.parse(line); } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });continue; }
    // Requests run side by side, so a quick list isn't held up behind a character being built.
    const job = handle(message, send).catch((error) => { if (message.id !== undefined) send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: explain(error) } }); });
    pending.add(job);void job.finally(() => pending.delete(job));
  }
  await Promise.all(pending);
}
