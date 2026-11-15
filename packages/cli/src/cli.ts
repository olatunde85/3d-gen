/** ara3d: generate rigged, animated Ara characters from the command line. */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { parseArgs } from 'node:util';
import { buildHuman } from '../../../src/core/human';
import { triangleCount } from '../../../src/core/mesh';
import { DEFAULT_PARAMS, DETAILS, PRESETS, randomParams, type HumanParams } from '../../../src/core/params';
import { planExport, runExport, type ExportFormat, type ExportSettings } from '../../../src/export';
import { CLIPS } from '../../../src/core/anim/clips';
import { animationGroup } from '../../../src/core/anim/groups';
import { characterExample, characterSchema, parseCharacterInput } from '../../../src/app/character-assist';
import { assistSchema } from '../../../src/studio/assist';
import { loadLibrary } from './data';
import { finish, megabytes, note, result, seconds, status } from './status';
import { explain, isFatal, removeLeftovers, UserError, writeSafely } from './safety';
import { WEAPONS } from '../../../src/core/props/weapons';
import { CARRIED } from '../../../src/core/props/carry';
import { VEHICLE_CHOICES, VEHICLE_FOR_CLIP } from '../../../src/core/props/vehicles';
import PACKAGE from '../package.json';

const FORMATS: readonly ExportFormat[] = ['glb', 'fbx', 'obj', 'zip'];

const HELP = `ara3d ${PACKAGE.version}: realistic, rigged and animated 3D characters, built on your machine.

Usage
  ara3d export [options]          Build characters and write GLB, FBX, OBJ or ZIP files
  ara3d presets                   List the preset characters
  ara3d animations                List the animation clips and their groups
  ara3d props                     List the weapons, carried items and vehicles
  ara3d new <name> [--preset P]   Write a starter character file to edit
  ara3d schema [character|film]   Print a JSON schema (for editors and AI tools)

Export options
  --preset <name>        A preset, such as "The Soldier" (see ara3d presets)
  --all-presets          Every preset
  --random <seed|a-b>    Random characters from a seed or a range, such as 1-200
  --params <file>        A character file (repeatable): a params.json from an export, or an
                         "ara-character" file from ara3d new or an AI assistant
  --formats <list>       glb, fbx, obj, zip, comma-separated (default glb)
  --detail <level>       low, medium or high
  --animations <list>    Only these clips or groups, comma-separated, such as
                         walk,run,idle or locomotion,shooter (see ara3d animations)
  --no-animations        Rigged but without animation clips (smaller files)
  --root-motion          Walks, runs and strafes move forward instead of playing in place
  --separate-clips       The model plus one file per clip, in a zip (Unity's model@clip style)
  --weapon <id>          A weapon in the hand: rifle, pistol, sword, knife or grenade
  --carry <id>           Something to carry, such as backpack, briefcase or phone
  --vehicle <id>         A vehicle fitted to the rider, such as motorcycle or horse; auto
                         fits the vehicle that the chosen riding clips need
  --separate-props       The weapon as its own file too (vehicles always are)
  --out <dir>            Output folder (default ./ara3d-out)
  --debug                Show technical details when something fails

Examples
  npx ara3d export --preset "The Soldier"
  npx ara3d export --random 1-50 --formats glb --detail low --out characters
  npx ara3d export --preset "The Soldier" --animations locomotion,pistol_fire --root-motion
  npx ara3d export --preset "The Soldier" --weapon rifle --vehicle motorcycle --animations locomotion,vehicles
  npx ara3d new hero && npx ara3d export --params hero.json --formats glb,fbx

The character data (about 50 MB) downloads on first run and is cached. Characters are
CC0 (MakeHuman data); see https://ara3dgen.com/docs/ for engines, rigging and formats.`;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';

function seeds(value: string) {
  const range = /^(\d+)-(\d+)$/.exec(value);
  if (!range) { if (!/^\d+$/.test(value)) throw new UserError(`--random takes a seed or a range such as 1-200, not "${value}".`);return [Number(value)]; }
  const [a, b] = [Number(range[1]), Number(range[2])];
  if (b < a || b - a >= 10_000) throw new UserError('--random ranges go low to high and cover at most 10,000 seeds.');
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** Clip IDs from a list of clip IDs and group names (a group is a clip category, such as locomotion or shooter). */
function clipList(value: string) {
  const ids = new Set<string>();
  for (const item of value.split(',').map((s) => s.trim()).filter(Boolean)) {
    const clip = CLIPS.find((c) => c.id === item), group = CLIPS.filter((c) => c.category.toLowerCase() === item.toLowerCase());
    if (clip) ids.add(clip.id);
    else if (group.length) for (const c of group) ids.add(c.id);
    else throw new UserError(`Unknown animation "${item}". Run ara3d animations to list clips and groups.`);
  }
  return [...ids];
}

/** The same export settings as the builder's Export panel, from the command-line options. */
function settings(character: { rig?: unknown; params: HumanParams }, format: ExportFormat, clips: string[], values: { 'root-motion'?: boolean; 'separate-clips'?: boolean; 'separate-props'?: boolean }): ExportSettings {
  const mode = !character.rig || format === 'obj' ? 'static' : character.params.animations ? 'animated' : 'rigged';
  return {
    mode, format: format === 'zip' ? 'all' : format, clips, packaging: values['separate-clips'] ? 'separate' : 'embedded', clipMesh: false,
    rootMotion: !!values['root-motion'], loopSuffix: false, weaponFile: values['separate-props'] ? 'separate' : 'held', stageProps: false,
  };
}

/** A vehicle with none of its riding clips selected would only stand beside the character: say how to add them. */
function ridingTip(jobs: HumanParams[], clips: string[], chosen: boolean) {
  if (!chosen) return;
  for (const vehicle of new Set(jobs.map((j) => j.vehicle).filter((v) => v !== 'none' && v !== 'auto'))) {
    const own = Object.entries(VEHICLE_FOR_CLIP).filter(([, v]) => v === vehicle).map(([clip]) => clip);
    if (own.length && !own.some((c) => clips.includes(c))) note(`Tip: no ${vehicle} clips are selected. Add some to --animations, such as ${own.slice(0, 3).join(',')}, or the vehicles group.`);
  }
}

function propsCommand() {
  console.log(`Weapons (--weapon)\n  ${WEAPONS.filter((w) => w !== 'none').join(', ')}\n`);
  console.log(`Carried items (--carry)\n  ${CARRIED.filter((c) => c !== 'none').join(', ')}\n`);
  console.log(`Vehicles (--vehicle)\n  ${VEHICLE_CHOICES.filter((v) => v !== 'none').join(', ')}\n  auto fits the vehicle that the selected riding clips need.`);
}

function animationsCommand() {
  const groups = new Map<string, string[]>();
  for (const c of CLIPS) { const g = animationGroup(c);groups.set(g, [...(groups.get(g) ?? []), `${c.id}${c.loop ? ' (loop)' : ''}`]); }
  console.log(`${CLIPS.length} clips. Pass clip IDs or category names (the part before any "·") to --animations.\n`);
  for (const [group, ids] of groups) console.log(`${group}\n  ${ids.join(', ')}\n`);
}

async function exportCommand(args: string[]) {
  const { values } = parseArgs({ args, strict: true, options: {
    preset: { type: 'string', multiple: true }, 'all-presets': { type: 'boolean' }, random: { type: 'string' }, params: { type: 'string', multiple: true },
    formats: { type: 'string', default: 'glb' }, detail: { type: 'string' }, animations: { type: 'string' }, 'no-animations': { type: 'boolean' },
    'root-motion': { type: 'boolean' }, 'separate-clips': { type: 'boolean' }, out: { type: 'string', default: 'ara3d-out' },
    weapon: { type: 'string' }, carry: { type: 'string' }, vehicle: { type: 'string' }, 'separate-props': { type: 'boolean' },
  } });
  const formats = values.formats!.split(',').map((f) => f.trim()) as ExportFormat[];
  for (const f of formats) if (!FORMATS.includes(f)) throw new UserError(`Unknown format "${f}". Use ${FORMATS.join(', ')}.`);
  if (values.detail && !(DETAILS as readonly string[]).includes(values.detail)) throw new UserError(`--detail is one of ${DETAILS.join(', ')}.`);
  for (const name of values.preset ?? []) if (!PRESETS[name]) throw new UserError(`Unknown preset "${name}". Run ara3d presets to list them.`);
  for (const file of values.params ?? []) if (!existsSync(file)) throw new UserError(`No such file: ${file}`);
  const clips = values.animations ? clipList(values.animations) : CLIPS.map((c) => c.id);
  if (values.animations && values['no-animations']) throw new UserError('Use either --animations or --no-animations.');
  if ((values.animations || values['root-motion'] || values['separate-clips']) && (values['no-animations'] || formats.every((f) => f === 'obj')))
    throw new UserError('--animations, --root-motion and --separate-clips need animated output: glb, fbx or zip, without --no-animations.');
  const choice = (flag: string, value: string | undefined, options: readonly string[]) => { if (value !== undefined && !options.includes(value)) throw new UserError(`Unknown ${flag} "${value}". Use one of: ${options.join(', ')}.`); };
  choice('--weapon', values.weapon, WEAPONS);choice('--carry', values.carry, CARRIED);choice('--vehicle', values.vehicle, VEHICLE_CHOICES);
  if (!values.preset && !values['all-presets'] && !values.random && !values.params) throw new UserError('Choose characters with --preset, --all-presets, --random or --params. Run ara3d --help for examples.');

  const begun = performance.now(), lib = await loadLibrary();
  const overrides: Partial<HumanParams> = {};
  if (values.detail) overrides.detail = values.detail as HumanParams['detail'];
  if (values['no-animations']) overrides.animations = false;
  // Prop flags override only what they name, so a character file keeps its other props.
  if (values.weapon) overrides.weapon = values.weapon as HumanParams['weapon'];
  if (values.carry) overrides.carry = values.carry as HumanParams['carry'];
  if (values.vehicle) overrides.vehicle = values.vehicle as HumanParams['vehicle'];
  const jobs: HumanParams[] = [];
  const presets = values['all-presets'] ? Object.keys(PRESETS) : values.preset ?? [];
  for (const name of presets) jobs.push({ ...DEFAULT_PARAMS, ...PRESETS[name], name, ...overrides });
  if (values.random) for (const seed of seeds(values.random)) jobs.push({ ...randomParams(seed, lib.catalog), name: `random_${seed}`, ...overrides });
  for (const file of values.params ?? []) {
    // Both an "ara-character" file and a builder export's params.json are accepted.
    try { jobs.push({ ...parseCharacterInput(readFileSync(file, 'utf8'), lib.catalog), ...overrides }); }
    catch (error) { throw new UserError(`${file}: ${(error as Error).message}`); }
  }

  ridingTip(jobs, clips, !!values.animations);
  mkdirSync(values.out!, { recursive: true });removeLeftovers(values.out!);
  let files = 0, bytes = 0;
  const failed: string[] = [];
  for (const [i, params] of jobs.entries()) {
    const prefix = jobs.length > 1 ? `[${i + 1}/${jobs.length}] ` : '', started = performance.now(), written: string[] = [];
    // One failed character is reported and skipped; errors that would repeat for every character (permissions, a
    // full disk) stop the run.
    try {
      status(`${prefix}${params.name}: building the character...`);
      const character = await buildHuman(lib, params);
      for (const format of formats) {
        status(`${prefix}${params.name}: writing ${format.toUpperCase()}...`);
        const file = await runExport(lib, character, planExport(character, settings(character, format, clips, values)));
        writeSafely(join(values.out!, file.name), file.data);written.push(`${file.name} (${megabytes(file.data.length)})`);files++;bytes += file.data.length;
      }
      result(`${prefix}${params.name}: ${(character.height * 100).toFixed(0)} cm, ${triangleCount(character.mesh).toLocaleString('en')} triangles, ${seconds(performance.now() - started)} -> ${written.join(', ')}`);
    } catch (error) {
      if (isFatal(error) || jobs.length === 1) throw error;
      failed.push(params.name);note(`${prefix}${params.name}: failed: ${explain(error)}`);debug(error);
    }
  }
  finish();
  const made = jobs.length - failed.length;
  note(`${failed.length ? `Finished with errors: ${made} of ${jobs.length} characters written, ${failed.length} failed (${failed.join(', ')})` : `Done: ${made} character${made === 1 ? '' : 's'}`}, ${files} file${files === 1 ? '' : 's'} (${megabytes(bytes)}) in ${seconds(performance.now() - begun)}, in ${resolvePath(values.out!)}`);
  if (failed.length) process.exitCode = 1;
}

function newCommand(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { preset: { type: 'string' } } });
  const name = positionals[0];
  if (!name) throw new UserError('Give the character a name: ara3d new <name>');
  const preset = values.preset ?? characterExample().preset;
  if (!PRESETS[preset]) throw new UserError(`Unknown preset "${preset}". Run ara3d presets to list them.`);
  const file = `${slug(name)}.json`;
  if (existsSync(file)) throw new UserError(`${file} already exists.`);
  const { kind, version } = characterExample();
  writeFileSync(file, JSON.stringify({ $schema: 'https://ara3dgen.com/schemas/character.v1.json', kind, version, preset, params: { name } }, null, 2) + '\n');
  console.log(`Wrote ${file}. Edit it (your editor checks it against the schema), then: ara3d export --params ${file}`);
}

async function schemaCommand(args: string[]) {
  const which = args[0] ?? 'character';
  if (which !== 'character' && which !== 'film') throw new UserError('ara3d schema takes character or film.');
  const { catalog } = await loadLibrary();finish();
  console.log(JSON.stringify(which === 'character' ? characterSchema(catalog) : assistSchema(catalog), null, 2));
}

async function main(argv: string[]) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h' || command === 'help') return console.log(HELP);
  if (command === '--version' || command === '-v') return console.log(PACKAGE.version);
  if (command === 'export') return exportCommand(rest);
  if (command === 'presets') return console.log(Object.keys(PRESETS).join('\n'));
  if (command === 'animations') return animationsCommand();
  if (command === 'props') return propsCommand();
  if (command === 'new') return newCommand(rest);
  if (command === 'schema') return schemaCommand(rest);
  throw new UserError(`Unknown command "${command}". Run ara3d --help.`);
}

/** --debug (or ARA3D_DEBUG=1) adds the technical detail behind an error. */
const DEBUG = process.argv.includes('--debug') || !!process.env.ARA3D_DEBUG;
function debug(error: unknown) { if (DEBUG) console.error((error as Error)?.stack ?? error); }

main(process.argv.slice(2).filter((a) => a !== '--debug')).catch((error: unknown) => {
  finish();console.error(`ara3d: ${explain(error)}`);debug(error);
  // Expected problems already say what to do; anything else may need the details.
  if (!DEBUG && !(error instanceof UserError) && !(error as NodeJS.ErrnoException)?.code) console.error('Run again with --debug for technical details.');
  process.exitCode = 1;
});
