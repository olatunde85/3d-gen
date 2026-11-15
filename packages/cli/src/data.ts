/**
 * The character data the CLI builds from: Ara's built assets, downloaded once from a GitHub release and cached.
 * `ARA3D_DATA` points at an assets folder instead (for example public/assets in a clone of the repository).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { AssetLibrary } from '../../../src/core/assets';
import DATA from './data-version.json';

/** Where downloads are cached: ARA3D_CACHE, or the platform's usual cache folder. */
export function cacheRoot() {
  if (process.env.ARA3D_CACHE) return process.env.ARA3D_CACHE;
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ara3d', 'cache');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'ara3d');
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'ara3d');
}

/** Renames a folder, retrying briefly: on Windows, antivirus can hold freshly written files for a moment. */
function moveInto(from: string, to: string) {
  for (let attempt = 1; ; attempt++) {
    try { renameSync(from, to);return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 8 || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250 * attempt);
    }
  }
}

/** The folder holding the character data, downloading it on first use. */
export async function dataFolder(log: (line: string) => void): Promise<string> {
  if (process.env.ARA3D_DATA) return process.env.ARA3D_DATA;
  if (!DATA.asset) throw Error('This build of ara3d has no character data attached. Set ARA3D_DATA to an assets folder.');
  const folder = join(cacheRoot(), DATA.sha256.slice(0, 12));
  if (existsSync(join(folder, 'catalog.json'))) return folder;
  const url = `https://github.com/${DATA.repo}/releases/download/${DATA.release}/${DATA.asset}`;
  log(`Downloading character data (${(DATA.size / 1e6).toFixed(0)} MB, first run only)…`);
  const response = await fetch(url);
  if (!response.ok) throw Error(`Could not download the character data (${response.status}) from ${url}`);
  // Stream the download so a slow connection shows progress instead of looking stuck.
  const total = Number(response.headers.get('content-length')) || DATA.size, bytes = new Uint8Array(total), reader = response.body!.getReader();
  let received = 0, shown = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.length > total) throw Error('The character data download was larger than expected. Please try again.');
    bytes.set(value, received);received += value.length;
    const percent = Math.floor((received / total) * 100);
    if (percent === shown) continue;
    if (process.stderr.isTTY) process.stderr.write(`\r  ${percent}% of ${(total / 1e6).toFixed(0)} MB`);
    else if (percent % 25 === 0) log(`  ${percent}%`); // Logs, such as CI, get a line every quarter.
    shown = percent;
  }
  if (process.stderr.isTTY) process.stderr.write('\n');
  if (received !== total) throw Error('The character data download was cut short. Please try again.');
  if (createHash('sha256').update(bytes).digest('hex') !== DATA.sha256) throw Error('The character data download failed its checksum. Please try again.');
  // Unpack beside the final folder, then move it into place, so an interrupted run never leaves half the data.
  const temp = `${folder}.partial`;rmSync(temp, { recursive: true, force: true });
  for (const [path, content] of Object.entries(unzipSync(bytes))) {
    if (path.endsWith('/')) continue;
    const file = join(temp, path);mkdirSync(dirname(file), { recursive: true });writeFileSync(file, content);
  }
  rmSync(folder, { recursive: true, force: true });moveInto(temp, folder);
  log(`Character data cached in ${folder}`);
  return folder;
}

export async function loadLibrary(log: (line: string) => void) {
  const folder = await dataFolder(log);
  if (!existsSync(join(folder, 'catalog.json'))) throw Error(`No character data in ${folder} (catalog.json is missing).`);
  return new AssetLibrary({ read: async (p) => new Uint8Array(await readFile(join(folder, p))) }).init();
}
