/**
 * Builds the web copy of the character data that the ara3d library downloads, in public/assets/web/:
 *   - targets/: each body-shape target in its own small file (the face's expression units in one), so a page fetches
 *     only the shapes its character uses instead of the whole targets.pack;
 *   - textures/: every texture at most 1024 pixels across, for characters built at low or medium detail;
 *   - index.json: which file holds each target.
 * Everything is made from public/assets, so it needs npm run setup-assets first. It runs as part of setup-assets and
 * release-cli; the builder and the command line keep using the full files.
 *   npx tsx scripts/build-web-assets.ts
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import sharp from 'sharp';
import { decodePack, encodePack } from '../src/core/pack';
import type { TargetsMeta } from '../src/core/assets';

const assets = join(import.meta.dirname, '../public/assets'), web = join(assets, 'web');
if (!existsSync(join(assets, 'targets.pack'))) throw Error('Set up the character data first: npm run setup-assets');
const SIZE = 1024;

rmSync(web, { recursive: true, force: true });
mkdirSync(join(web, 'targets'), { recursive: true });mkdirSync(join(web, 'textures'), { recursive: true });

// --- Targets: slices of targets.pack, still in its compact form (delta-coded, low and high byte planes) -------------
const pack = decodePack<TargetsMeta>(readFileSync(join(assets, 'targets.pack')));
if (pack.meta.format !== 2) throw Error('Expected a format-2 targets.pack');
const files = new Map<string, string[]>();
for (const name of Object.keys(pack.meta.targets)) {
  // The face's expression units are small and every character uses them, so they travel together.
  const file = name.startsWith('expression/units/') ? 'expression-units.pack' : `${name.replace(/[^a-zA-Z0-9-]+/g, '_')}.pack`;
  files.set(file, [...(files.get(file) ?? []), name]);
}
const index: Record<string, string> = {};
let bytes = 0;
for (const [file, names] of files) {
  const meta: TargetsMeta = { format: 2, targets: {} }, parts: Record<string, number[][]> = {};
  const keys = ['idx', 'xlo', 'xhi', 'ylo', 'yhi', 'zlo', 'zhi'] as const;
  let at = 0;
  for (const name of names) {
    const [offset, count, scale] = pack.meta.targets[name];
    meta.targets[name] = [at, count, scale];at += count;
    for (const key of keys) (parts[key] ??= []).push(Array.from(pack.arrays[key].subarray(offset, offset + count)));
    index[name] = file;
  }
  const arrays = Object.fromEntries(keys.map((key) => [key, key === 'idx' ? Uint16Array.from(parts[key].flat()) : Uint8Array.from(parts[key].flat())]));
  const data = encodePack(meta, arrays);bytes += data.length;
  writeFileSync(join(web, 'targets', file), data);
}
writeFileSync(join(web, 'index.json'), JSON.stringify({ textureSize: SIZE, targets: index }));
console.log(`web/targets: ${files.size} files for ${Object.keys(index).length} targets, ${(bytes / 1e6).toFixed(1)} MB in all`);

// --- Textures: the same formats, at most 1024 pixels across -------------------------------------------------------
let before = 0, after = 0;
for (const name of readdirSync(join(assets, 'textures'))) {
  const from = join(assets, 'textures', name), to = join(web, 'textures', name), source = readFileSync(from);
  const { width = 0, height = 0, isPalette } = await sharp(source).metadata();
  before += source.length;
  if (Math.max(width, height) <= SIZE) { copyFileSync(from, to);after += source.length;continue; }
  const image = sharp(source).resize({ width: SIZE, height: SIZE, fit: 'inside' });
  // Palette PNGs (most of the hair, teeth and eyes) stay palette PNGs; full-colour ones stay full colour.
  const out = extname(name) === '.png' ? await image.png({ compressionLevel: 9, palette: !!isPalette, quality: 100, effort: 10 }).toBuffer() : await image.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  writeFileSync(to, out);after += out.length;
}
console.log(`web/textures: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
