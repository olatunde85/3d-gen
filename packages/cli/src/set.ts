/**
 * ara3d set: Ara Studio set files from the command line. `check` reads a set file (a file or an address) as Studio
 * does when it's imported. The MCP server reads set files the same way (loadSetFiles), so assistants write films for
 * them with their real staging maps.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { checkSetFile, registerSets, type KnownSet } from '../../../src/studio/set-check';
import { MAX_SET_FILE, SET_LIMITS, type SetCost } from '../../../src/studio/set-files';
import { UserError } from './safety';

export const SET_HELP = `ara3d set: Ara Studio set files

Usage
  ara3d set check <file|address>   Check a set file as Studio does when it's imported: its
                                   details, what it costs to play and its staging map
Options
  --json           Print the set's details, cost and staging map as JSON

Sets are made in Blender with the Export for Ara Studio add-on and imported in Studio with
Import a set: https://ara3dgen.com/docs/studio-sets/`;

export type CheckedSet = KnownSet & { cost: SetCost; preview: boolean; source: string };

/** Reads and checks a set file from disk or an https address. */
export async function readSetFile(source: string): Promise<CheckedSet> {
  let bytes: ArrayBuffer;
  try {
    if (/^https?:\/\//.test(source)) {
      const response = await fetch(source);
      if (!response.ok) throw Error(`the address answered ${response.status}`);
      if (Number(response.headers.get('content-length') ?? 0) > MAX_SET_FILE) throw Error(`it's over ${MAX_SET_FILE / 1024 / 1024} MB`);
      bytes = await response.arrayBuffer();
    } else {
      const file = readFileSync(source);
      bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new UserError(`No such file: ${source}`);
    throw new UserError(`${source}: ${(error as Error).message}`);
  }
  try { return { ...await checkSetFile(bytes), source }; }
  catch (error) { throw new UserError(`${source}: ${(error as Error).message}`); }
}

const loaded = new Map<string, CheckedSet>();
/**
 * Reads set files (once each, by source) and makes every set read so far known to the catalogue, guides and staging
 * checks, as an import does in Studio. Returns the sets just asked for.
 */
export async function loadSetFiles(sources: readonly string[]): Promise<CheckedSet[]> {
  const sets: CheckedSet[] = [];
  for (const source of sources) {
    let set = loaded.get(source);
    if (!set) {
      set = await readSetFile(source);
      for (const [key, other] of loaded) if (other.manifest.id === set.manifest.id) loaded.delete(key);
      loaded.set(source, set);
    }
    sets.push(set);
  }
  registerSets([...loaded.values()]);
  return sets;
}

/** One line on what a set costs to play, against Studio's limits. */
export function describeCost(cost: SetCost) {
  return `${cost.triangles.toLocaleString('en')} of ${SET_LIMITS.triangles.toLocaleString('en')} triangles, ${cost.meshes} of ${SET_LIMITS.meshes} meshes, ${cost.megapixels} of ${SET_LIMITS.megapixels} megapixels of textures`;
}

async function check(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { json: { type: 'boolean' } } });
  const source = positionals[0];
  if (!source) throw new UserError('Give a set file or address: ara3d set check <file|address>');
  const set = await readSetFile(source), m = set.manifest;
  if (values.json) return console.log(JSON.stringify({ set: m, cost: set.cost, limits: SET_LIMITS, map: set.map }, null, 2));
  const [x0, z0, x1, z1] = m.room;
  console.log(`${m.name} ${m.release} (${m.id}) by ${m.author}, ${m.license}: OK`);
  console.log(m.subtitle);
  console.log(`  ${m.category} · ${m.family} · ${m.mood}`);
  console.log(`  Cost: ${describeCost(set.cost)}`);
  console.log(`  Room: ${(x1 - x0).toFixed(1)} × ${(z1 - z0).toFixed(1)} m, ${m.seats.length} seat${m.seats.length === 1 ? '' : 's'}; staging map with ${set.map.obstacles.length} obstacle${set.map.obstacles.length === 1 ? '' : 's'}`);
  console.log(`  Lightmaps: ${Object.keys(m.lightmaps).join(', ')}; ${set.preview ? 'a preview picture' : 'no preview picture'}; ${m.staging ? 'a staging note' : 'no staging note'}`);
}

export async function setCommand(args: string[]) {
  const [sub, ...rest] = args;
  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') return console.log(SET_HELP);
  if (sub === 'check') return check(rest);
  throw new UserError(`Unknown set command "${sub}". Run ara3d set --help.`);
}
