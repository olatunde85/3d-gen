/**
 * ara3d pack: content packs from the command line. `new` lists a folder's animation files in a pack.json, `build`
 * converts them into one .ara-pack.json, `check` reads a pack (a file or an address) and lists what it adds.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Texture, TextureLoader } from 'three';
import { ANIMATION_FILE_TYPES, animationNames, buildPack, cleanName, guessCategory, idFrom, importAnimations, parsePackSource, readAnimationFile, type AnimationSource, type ImportFile } from '../../../src/core/packs/build';
import { PACK_CATEGORIES, PACK_EXTENSION, PACK_ID, parsePack, type Pack } from '../../../src/core/packs/format';
import { loadPack, registerPack, type LoadedPack } from '../../../src/core/packs';
import { finish, note, result, status } from './status';
import { UserError, writeSafely } from './safety';

export const PACK_HELP = `ara3d pack: add your own animations to Ara

Usage
  ara3d pack <folder|files...>     Turn animation files (FBX, GLB, glTF, BVH) into one pack,
                                   <name>${PACK_EXTENSION}. Names, groups and loops are filled in
  ara3d pack check <file|address>  Check a pack and list its animations

Options
  --name <name>    The pack's name (default: the folder's name, or My animations)
  --out <file>     Where to write the pack

To set names and groups yourself, or for skeletons Ara doesn't recognise:
  ara3d pack new <folder>          Write <folder>/pack.json listing its animations, to edit
  ara3d pack build <folder>        Build the pack from pack.json

Animations from Mixamo (FBX), Blender and most tools (glTF/GLB) and motion capture (BVH) are
retargeted onto Ara's rig. Add the pack in the builder, Studio or Play (Add animations), give its
address to the library's packs option, or pass it to ara3d export --pack.
See https://ara3dgen.com/docs/packs/`;

/**
 * Lets three.js's loaders read models in Node, which can't decode images. Textures aren't decoded: each keeps its
 * file's original bytes (a PNG or JPEG embedded in the GLB or FBX) for imported characters, read by `textureBytes`.
 */
const blobs = new Map<string, Blob>(), originals = new WeakMap<object, Promise<Uint8Array | undefined>>();
export function nodeLoaders() {
  (globalThis as { self?: unknown }).self ??= globalThis;
  // three's file loader reports progress with the browser's ProgressEvent (a glTF's separate .bin).
  (globalThis as { ProgressEvent?: unknown }).ProgressEvent ??= class extends Event { lengthComputable: boolean;loaded: number;total: number;constructor(type: string, o: { lengthComputable?: boolean; loaded?: number; total?: number } = {}) { super(type);this.lengthComputable = !!o.lengthComputable;this.loaded = o.loaded ?? 0;this.total = o.total ?? 0; } };
  const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob: Blob) => { const url = create(blob);blobs.set(url, blob);return url; };
  TextureLoader.prototype.load = function (this: TextureLoader, url: string, onLoad?: (texture: Texture) => void) {
    const texture = new Texture(), blob = blobs.get(/^(blob|data):/.test(url) ? url : this.manager.resolveURL((this.path ?? '') + url));
    originals.set(texture.source, blob ? blob.arrayBuffer().then((b) => new Uint8Array(b)) : Promise.resolve(undefined));
    onLoad?.(texture);
    return texture;
  } as TextureLoader['load'];
}
/** A texture's original image file (PNG or JPEG) as read from a model in Node, or undefined for other formats. */
export async function textureBytes(texture: Texture): Promise<{ bytes: Uint8Array; type: 'png' | 'jpg'; alpha?: 'none' | 'cutout' } | undefined> {
  const bytes = await originals.get(texture.source);
  if (!bytes) return undefined;
  // A PNG with an alpha channel (colour type 4 or 6) may have see-through parts: cut out where they are.
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return { bytes, type: 'png', alpha: bytes[25] === 4 || bytes[25] === 6 ? 'cutout' : 'none' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, type: 'jpg' };
  return undefined;
}

const isAnimationFile = (f: string) => (ANIMATION_FILE_TYPES as readonly string[]).includes(f.split('.').pop()!.toLowerCase());
const slugId = (s: string, max = 40) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);

async function newPack(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { id: { type: 'string' }, name: { type: 'string' } } });
  const folder = positionals[0];
  if (!folder) throw new UserError('Name the folder with the animation files: ara3d pack new <folder>');
  if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new UserError(`No such folder: ${folder}`);
  const file = join(folder, 'pack.json');
  if (existsSync(file)) throw new UserError(`${file} already exists. Edit it, then run ara3d pack build ${folder}`);
  const id = values.id ?? slugId(basename(resolve(folder)));
  if (!PACK_ID.test(id)) throw new UserError(`"${id}" can't be a pack ID: use 2 to 40 lower-case letters, digits and hyphens (--id).`);
  nodeLoaders();
  const animations: AnimationSource[] = [], used = new Set<string>();
  for (const name of readdirSync(folder).filter(isAnimationFile).sort()) {
    status(`Reading ${name}...`);
    let clips: string[];
    try { clips = animationNames(await readAnimationFile(new Uint8Array(readFileSync(join(folder, name))), name), name); }
    catch (error) { note(`${name}: skipped (${(error as Error).message})`);continue; }
    for (const clip of clips) {
      // Mixamo calls every animation "mixamo.com": the file's name says more.
      const label = cleanName(clips.length === 1 || /^mixamo\.com$/i.test(clip) ? name : clip), aid = idFrom(label, used, 'item');
      used.add(aid);
      animations.push({ file: name, ...(clips.length > 1 ? { clip } : {}), id: aid, name: label, category: guessCategory(label) });
    }
  }
  finish();
  if (!animations.length) throw new UserError(`${folder} has no animation files. Put FBX (such as Mixamo downloads), GLB, glTF or BVH files in it.`);
  const source = { $schema: 'https://ara3dgen.com/schemas/pack-source.v1.json', id, name: values.name ?? cleanName(basename(resolve(folder))), author: '', license: '', description: '', animations };
  writeFileSync(file, JSON.stringify(source, null, 2) + '\n');
  result(`Wrote ${file} with ${animations.length} animation${animations.length === 1 ? '' : 's'}.`);
  console.log(`Names and groups (${PACK_CATEGORIES.join(', ')}) are filled in; change any, set loop where it repeats, then: ara3d pack build ${folder}`);
}

async function build(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { out: { type: 'string' } } });
  const target = positionals[0];
  if (!target) throw new UserError('Name the pack folder: ara3d pack build <folder>');
  const file = existsSync(target) && statSync(target).isDirectory() ? join(target, 'pack.json') : target;
  if (!existsSync(file)) throw new UserError(`No pack.json in ${target}. Start one with ara3d pack new ${target}`);
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw new UserError(`${file} isn't valid JSON: ${(error as Error).message}`); }
  let source;
  try { source = parsePackSource(raw); } catch (error) { throw new UserError(`${file}: ${(error as Error).message}`); }
  const folder = dirname(file);
  for (const a of source.animations) if (!existsSync(join(folder, a.file))) throw new UserError(`${file}: no such file ${a.file} next to it.`);
  nodeLoaders();
  const started = performance.now();
  let pack: Pack;
  try { pack = await buildPack(source, async (f) => new Uint8Array(await readFile(join(folder, f))), (message) => result(`  ${message}`)); }
  catch (error) { throw new UserError((error as Error).message); }
  const text = JSON.stringify(pack), out = values.out ?? join(dirname(resolve(folder)), `${pack.id}${PACK_EXTENSION}`);
  writeSafely(out, new TextEncoder().encode(text));
  finish();
  result(`Wrote ${out}: ${pack.animations!.length} animation${pack.animations!.length === 1 ? '' : 's'}, ${(text.length / 1024).toFixed(0)} KB, in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
  console.log(`Host it anywhere that allows other sites to read it (GitHub, jsDelivr, your own site), then add its address in Ara (Add animations), or try it with: ara3d export --preset "The Soldier" --pack ${out} --animations ${pack.id}`);
}

/** Loads packs given as files or addresses into this process, for export and the animation list. */
export async function usePackFiles(items: readonly string[]): Promise<LoadedPack[]> {
  const out: LoadedPack[] = [];
  for (const item of items) {
    try {
      out.push(/^https?:\/\//.test(item) ? await loadPack(item) : registerPack(readFileSync(item, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new UserError(`No such pack file: ${item}`);
      throw new UserError(`${item}: ${(error as Error).message}`);
    }
  }
  return out;
}

async function check(args: string[]) {
  const item = args[0];
  if (!item) throw new UserError('Give a pack file or address: ara3d pack check <file|address>');
  let pack: Pack;
  try {
    pack = /^https?:\/\//.test(item) ? (await loadPack(item)).pack : parsePack(readFileSync(item, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new UserError(`No such file: ${item}`);
    throw new UserError(`${item}: ${(error as Error).message}`);
  }
  const about = [pack.author && `by ${pack.author}`, pack.license].filter(Boolean).join(', ');
  console.log(`${pack.name} (${pack.id})${about ? ` ${about}` : ''}: OK`);
  if (pack.description) console.log(pack.description);
  for (const a of pack.animations ?? []) console.log(`  ${pack.id}/${a.id}  ${a.name} · ${a.category} · ${a.motion.duration.toFixed(2)} s${a.motion.loop ? ' (loop)' : ''}`);
}

/** Every animation file in these folders and files (folders read through), with its path. */
function animationFiles(items: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    if (statSync(path).isDirectory()) { for (const name of readdirSync(path).sort()) if (!name.startsWith('.')) walk(join(path, name));return; }
    if (isAnimationFile(path)) out.push(path);
  };
  for (const item of items) { if (!existsSync(item)) throw new UserError(`No such file or folder: ${item}`);walk(item); }
  return out;
}

/** ara3d pack <folder|files...>: animation files straight into a pack. A folder with a pack.json is built from it. */
async function quick(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { name: { type: 'string' }, out: { type: 'string' } } });
  if (positionals.length === 1 && existsSync(join(positionals[0], 'pack.json'))) return build([positionals[0], ...(values.out ? ['--out', values.out] : [])]);
  const paths = animationFiles(positionals);
  if (!paths.length) throw new UserError(`No animation files in ${positionals.join(', ')}. Use FBX (such as Mixamo downloads), GLB, glTF or BVH files.`);
  const folder = positionals.length === 1 && statSync(positionals[0]).isDirectory() ? resolve(positionals[0]) : undefined;
  const name = values.name ?? (folder ? cleanName(basename(folder)) : 'My animations');
  nodeLoaders();
  const started = performance.now();
  const files: ImportFile[] = paths.map((p) => ({ name: folder ? relative(folder, resolve(p)) : basename(p), bytes: new Uint8Array(readFileSync(p)) }));
  let imported;
  try { imported = await importAnimations(files, { name, progress: (done, total, label) => { if (done < total) status(`Converting ${done + 1} of ${total}: ${label}`); } }); }
  catch (error) { throw new UserError((error as Error).message); }
  finish();
  const { pack, skipped } = imported, text = JSON.stringify(pack);
  const out = values.out ?? join(folder ? dirname(folder) : process.cwd(), `${pack.id}${PACK_EXTENSION}`);
  writeSafely(out, new TextEncoder().encode(text));
  const width = Math.max(...pack.animations!.map((a) => a.name.length));
  for (const a of pack.animations!) console.log(`  ${a.name.padEnd(width)}  ${a.category.padEnd(15)} ${a.motion.duration.toFixed(1).padStart(5)} s${a.motion.loop ? '  loops' : ''}`);
  for (const s of skipped) note(`  skipped ${s.file}: ${s.reason}`);
  result(`Wrote ${out}: ${pack.name}, ${pack.animations!.length} animation${pack.animations!.length === 1 ? '' : 's'}, ${(text.length / 1024).toFixed(0)} KB, in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
  console.log(`Add it in Ara (Add animations, then drop the file in), or use it here: ara3d export --preset "The Soldier" --pack ${out} --animations ${pack.id}`);
}

export async function packCommand(args: string[]) {
  const [sub, ...rest] = args;
  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') return console.log(PACK_HELP);
  if (sub === 'new') return newPack(rest);
  if (sub === 'build') return build(rest);
  if (sub === 'check') return check(rest);
  return quick(args);
}
