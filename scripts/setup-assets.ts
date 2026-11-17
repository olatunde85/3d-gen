/**
 * One-time setup: downloads the CC0 MakeHuman source data into vendor/ and
 * builds public/assets. Cross-platform (Windows, macOS, Linux): needs only
 * Node 20+ and git.
 *   npm run setup-assets
 */
import { spawnSync } from 'node:child_process';
import { closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Unzip, UnzipInflate } from 'fflate';
import { MOCAP_FILES, MOCAP_SOURCE, MOCAP_TAKES } from './mocap-takes';

const ROOT = join(import.meta.dirname, '..');
const VENDOR = join(ROOT, 'vendor');
const MH_REPO = 'https://github.com/makehumancommunity/makehuman.git';
const SYS_ZIP_URL = 'https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip';

const log = (m: string) => console.log(`[setup-assets] ${m}`);

function git(args: string[]) {
  const r = spawnSync('git', args, { stdio: 'inherit' });
  if (r.error) throw new Error(`git is required (${r.error.message})`);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed with exit code ${r.status}`);
}

/** MakeHuman base mesh, targets, skeleton and slider definitions (sparse checkout of makehuman/data only). */
function fetchMakeHumanData() {
  const dir = join(VENDOR, 'mh');
  if (existsSync(join(dir, 'makehuman', 'data'))) return log('MakeHuman data: already present');
  log('MakeHuman data: cloning (sparse, makehuman/data only)…');
  rmSync(dir, { recursive: true, force: true });
  git(['clone', '--depth', '1', '--filter=blob:none', '--sparse', MH_REPO, dir]);
  git(['-C', dir, 'sparse-checkout', 'set', 'makehuman/data']);
}

/** Download a URL to a file with progress; reuses a complete earlier download. */
async function download(url: string, file: string) {
  const head = await fetch(url, { method: 'HEAD' });
  const size = Number(head.headers.get('content-length') ?? 0);
  if (existsSync(file) && size && statSync(file).size === size) return log(`${file}: already downloaded`);
  mkdirSync(dirname(file), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status} ${res.statusText} (${url})`);
  const total = Number(res.headers.get('content-length') ?? size);
  let got = 0, shown = -1;
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
  body.on('data', (c: Buffer) => {
    got += c.length;
    const pct = total ? Math.floor((got / total) * 100) : -1;
    if (pct !== shown && pct % 5 === 0) {
      shown = pct;
      process.stdout.write(`\r[setup-assets] downloading ${(got / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB (${pct}%)`);
    }
  });
  const part = `${file}.part`;
  await pipeline(body, createWriteStream(part));
  process.stdout.write('\n');
  renameSync(part, file);
}

/** Stream-unzip `zip` into `dest` (never holds the whole archive in memory). */
async function unzip(zip: string, dest: string) {
  const root = resolve(dest);
  mkdirSync(root, { recursive: true });
  let files = 0;
  const unz = new Unzip((entry) => {
    if (entry.name.endsWith('/')) return;
    const out = resolve(root, entry.name);
    // Refuse entries that would escape the destination ("zip slip").
    if (!out.startsWith(root + sep)) throw new Error(`unsafe path in zip: ${entry.name}`);
    mkdirSync(dirname(out), { recursive: true });
    const fd = openSync(out, 'w');
    entry.ondata = (err, data, final) => {
      if (err) throw err;
      writeSync(fd, data);
      if (final) {
        closeSync(fd);
        files++;
      }
    };
    entry.start();
  });
  unz.register(UnzipInflate);
  for await (const chunk of createReadStream(zip, { highWaterMark: 1 << 20 })) unz.push(chunk as Uint8Array);
  unz.push(new Uint8Array(0), true);
  log(`unzipped ${files} files into ${dest}`);
}

/** Skins, hair, clothes, eyes… (MakeHuman system assets, CC0). */
async function fetchSystemAssets() {
  const sys = join(VENDOR, 'sys');
  if (existsSync(join(sys, 'skins'))) return log('MakeHuman system assets: already present');
  const zip = join(VENDOR, 'dl', 'sys.zip');
  log('MakeHuman system assets: downloading (~280 MB)…');
  await download(SYS_ZIP_URL, zip);
  rmSync(sys, { recursive: true, force: true });
  await unzip(zip, sys);
}

/**
 * CMU motion-capture takes (vendor/mocap/cmu). Only needed to rebuild the clip data with
 * `npm run build-mocap`; the baked data is committed, so a failed download isn't fatal.
 */
async function fetchMocap() {
  const dir = join(VENDOR, 'mocap', 'cmu');
  const missing = [...new Set(MOCAP_TAKES.map((t) => t.take))].filter((t) => !existsSync(join(dir, `${t}.bvh`)));
  if (!missing.length) return log('Motion capture: already present');
  try {
    for (const take of missing) {
      const zip = join(VENDOR, 'dl', 'mocap', `${take}.zip`);
      await download(`${MOCAP_SOURCE}/${MOCAP_FILES[take]}`, zip);
      await unzip(zip, dir);
    }
  } catch (e) {
    log(`Motion capture: download failed (${(e as Error).message}); only needed for npm run build-mocap`);
  }
}

fetchMakeHumanData();
await fetchSystemAssets();
await fetchMocap();
log('building public/assets…');
await import('./build-assets');
log('building the web copy for the library…');
await import('./build-web-assets');
