/**
 * ara3d mcp: a Model Context Protocol server, so AI assistants (Claude, Cursor, VS Code and others) can make Ara
 * characters on this machine. It speaks JSON-RPC over stdin and stdout; everything else it prints goes to stderr.
 *
 *   claude mcp add ara3d -- npx -y ara3d mcp
 */
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { AssetLibrary } from '../../../src/core/assets';
import { buildHuman } from '../../../src/core/human';
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
import { characterParams, clipIds, needsPhone, type CharacterInput } from './library/generate';
import { applyColors, COLOR_SLOTS, colorsOf, type CharacterColors } from './library/colors';
import { loadLibrary } from './data';
import { explain, writeSafely } from './safety';
import PACKAGE from '../package.json';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const FORMATS: readonly ExportFormat[] = ['glb', 'fbx', 'obj', 'zip'];
/** Where characters go unless the assistant names a folder: assistants' working folders vary, so a fixed home. */
const OUT = process.env.ARA3D_OUT || join(homedir(), 'ara3d-characters');

const INSTRUCTIONS = `ara3d makes realistic, rigged and animated 3D humans on this machine and writes GLB, FBX or OBJ files.
Start from a preset (list_presets), a random seed, a share link from the Ara builder, or a character you design: call character_schema for every field, then pass { preset, params } to create_character.
Choose only the animations needed (list_animations): every clip makes the file bigger and the build slower.
Each result includes a link that opens the character in the Ara builder, so the user can see it and keep editing.`;

const TOOLS = [
  {
    name: 'list_presets',
    description: 'The 32 preset characters, such as "The Soldier" or "The Bride". Use one as a starting point for create_character.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_animations',
    description: 'The 216 animation clips, by group, with their IDs. Pass clip IDs or category names (such as locomotion) to create_character.',
    inputSchema: { type: 'object', properties: { search: { type: 'string', description: 'Only clips whose ID, name or group contains this, such as "dance" or "rifle".' } }, additionalProperties: false },
  },
  {
    name: 'list_props',
    description: 'Weapons, carried items and vehicles for create_character, and the expressions a character can wear.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'character_schema',
    description: 'The JSON schema of a character: every field (body, face, hair, clothes, colours, rig and more) with what it means and its allowed values. Read it before designing a character for create_character.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'create_character',
    description: 'Builds a character and writes its 3D files. Give exactly one of preset, random, share_link or character. Returns the files written and a link that opens the character in the Ara builder.',
    inputSchema: {
      type: 'object',
      properties: {
        preset: { type: 'string', description: 'A preset name from list_presets.' },
        random: { type: 'integer', minimum: 0, maximum: 1_000_000_000, description: 'A seed for a random character; the same seed always gives the same person.' },
        share_link: { type: 'string', description: 'A share link from the Ara builder (https://ara3dgen.com/app/#c=...).' },
        character: { type: 'object', description: 'A designed character: { "preset": "The Adventurer", "params": { ...changes } }, with fields from character_schema.' },
        name: { type: 'string', description: 'A name for the character, used for the file names.' },
        animations: { type: 'array', items: { type: 'string' }, description: 'Clip IDs or categories from list_animations. Leave out for every clip (large files), or pass [] for none.' },
        formats: { type: 'array', items: { enum: FORMATS }, description: 'glb (default; web, Godot, Blender), fbx (Unity, Unreal), obj (static) or zip (all of them).' },
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
];

type Args = Record<string, unknown>;
type Send = (message: object) => void;

let library: Promise<AssetLibrary> | undefined;
/** The character data, loaded once (and downloaded on the very first run). */
const data = () => (library ??= loadLibrary().catch((error) => { library = undefined;throw error; }));

function listAnimations(args: Args) {
  const search = typeof args.search === 'string' ? args.search.toLowerCase() : '';
  const groups = new Map<string, string[]>();
  for (const c of CLIPS) {
    const group = animationGroup(c);
    if (search && ![c.id, c.name, group, c.category].some((t) => t.toLowerCase().includes(search))) continue;
    groups.set(group, [...(groups.get(group) ?? []), `${c.id} (${c.name}${c.loop ? ', loops' : ''})`]);
  }
  if (!groups.size) return `No animation matches "${args.search}".`;
  return [...groups].map(([group, clips]) => `${group}:\n  ${clips.join('\n  ')}`).join('\n\n');
}

/** Builds the character and writes its files; reports progress to the assistant as it goes. */
async function createCharacter(args: Args, progress: (done: number, message: string) => void) {
  const sources = (['preset', 'random', 'share_link', 'character'] as const).filter((k) => args[k] !== undefined);
  if (sources.length !== 1) throw Error('Give exactly one of preset, random, share_link or character.');
  const formats = (args.formats as ExportFormat[] | undefined) ?? ['glb'];
  for (const f of formats) if (!FORMATS.includes(f)) throw Error(`Unknown format "${f}". Use ${FORMATS.join(', ')}.`);
  const clips = args.animations === undefined ? CLIPS.map((c) => c.id) : clipIds(args.animations as string[]);
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
    ...(args.carry ? { carry: args.carry as HumanParams['carry'] } : args.animations !== undefined && needsPhone(clips) ? { carry: 'phone' as const } : {}),
    ...(args.vehicle ? { vehicle: args.vehicle as HumanParams['vehicle'], vehicleStyle: vehicleStyleForChoice(args.vehicle as HumanParams['vehicle'], params.vehicleStyle) } : {}),
    ...(clips.length ? {} : { animations: false }),
  };
  if (args.colors) params = applyColors(params, args.colors as CharacterColors);
  const out = typeof args.out_dir === 'string' && args.out_dir ? (isAbsolute(args.out_dir) ? args.out_dir : resolve(OUT, args.out_dir)) : OUT;
  mkdirSync(out, { recursive: true });

  progress(0.2, `Building ${params.name}`);
  const started = performance.now(), character = await buildHuman(lib, params), written: string[] = [];
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
    `Made ${params.name}: ${(character.height * 100).toFixed(0)} cm tall, ${triangleCount(character.mesh).toLocaleString('en')} triangles, ${clips.length} animation${clips.length === 1 ? '' : 's'}, in ${((performance.now() - started) / 1000).toFixed(1)} s.`,
    `Files:\n  ${written.join('\n  ')}`,
    `See it and keep editing in the Ara builder: https://ara3dgen.com/app/#c=${encodeCharacter(params)}`,
    ...(Object.keys(colors).length ? [`Colours that can be changed: ${Object.entries(colors).map(([k, v]) => `${k} ${v}`).join(', ')}`] : []),
  ].join('\n\n');
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
  if (name === 'character_schema') return JSON.stringify(characterSchema((await data()).catalog), null, 2);
  if (name === 'create_character') return createCharacter(args, progress);
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
