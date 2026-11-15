/**
 * The character data the CLI builds from: Ara's built assets, downloaded once from a GitHub release and cached.
 * `ARA3D_DATA` points at an assets folder instead (for example public/assets in a clone of the repository).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { AssetLibrary } from '../../../src/core/assets';
import DATA from './data-version.json';
import { downloadProgress, megabytes, note, status } from './status';
import { cacheRoot, ensureSpace, isNetworkError, UserError } from './safety';
export { cacheRoot };


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

const ATTEMPTS = 4, STALL_MS = Number(process.env.ARA3D_STALL_MS) || 30_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Downloads the data into `bytes`, resuming after a dropped or stalled connection (no data for 30 s) and retrying
 * server errors and rate limits with growing waits. Gives up with a manual fallback after the last attempt.
 */
async function download(url: string, size: number) {
  const bytes = new Uint8Array(size), progress = downloadProgress(size);
  let received = 0, lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) {
      const seconds = [0, 0, 3, 10, 30][attempt];
      note(`Download interrupted (${reason(lastError)}). Retrying in ${seconds} s (attempt ${attempt} of ${ATTEMPTS})${received ? `, resuming at ${Math.floor((received / size) * 100)}%` : ''}...`);
      await wait(seconds * 1000);
    }
    const abort = new AbortController();let stall = setTimeout(() => abort.abort(), STALL_MS);
    const alive = () => { clearTimeout(stall);stall = setTimeout(() => abort.abort(), STALL_MS); };
    try {
      const response = await fetch(url, { signal: abort.signal, headers: received ? { range: `bytes=${received}-` } : {} });
      if (response.status === 429 || response.status >= 500) { lastError = new UserError(`the server is busy (${response.status})`);continue; }
      if (!response.ok) throw new UserError(`Could not download the character data: the server answered ${response.status}.${manual(url)}`);
      if (received && response.status !== 206) received = 0; // The server ignored the resume request: start over.
      const reader = response.body!.getReader();alive();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        alive();
        if (received + value.length > size) throw new UserError(`The character data download was larger than expected.${manual(url)}`);
        bytes.set(value, received);received += value.length;progress(received);
      }
      if (received === size) return bytes;
      lastError = new UserError('the connection closed early');
    } catch (error) {
      if (error instanceof UserError || !isNetworkError(error)) throw error;
      lastError = error;
    } finally { clearTimeout(stall); }
  }
  throw new UserError(`Could not download the character data after ${ATTEMPTS} attempts (${reason(lastError)}).${manual(url)}`);
}

/** A few words on why a download attempt failed. */
const reason = (error: unknown) => error instanceof UserError ? error.message : (error as Error)?.name === 'AbortError' ? `no data for ${Math.round(STALL_MS / 1000)} s` : 'connection lost';

/** How to fetch the data by hand: for proxies, firewalls and offline machines. */
const manual = (url: string) => `\nYou can download it yourself: ${url}\nUnzip it into a folder, then set ARA3D_DATA to that folder and run ara3d again.`;

/** The folder holding the character data, downloading it on first use. */
export async function dataFolder(): Promise<string> {
  if (process.env.ARA3D_DATA) {
    if (!existsSync(join(process.env.ARA3D_DATA, 'catalog.json'))) throw new UserError(`ARA3D_DATA is set to ${process.env.ARA3D_DATA}, but there is no character data there (catalog.json is missing). Unzip the data into that folder, or unset ARA3D_DATA.`);
    return process.env.ARA3D_DATA;
  }
  if (!DATA.asset) throw new UserError('This build of ara3d has no character data attached. Set ARA3D_DATA to an assets folder.');
  const root = cacheRoot(), folder = join(root, DATA.sha256.slice(0, 12));
  if (existsSync(join(folder, 'catalog.json'))) return folder;
  // ARA3D_DATA_URL points at a mirror, for networks that can't reach GitHub. The checksum still applies.
  const url = process.env.ARA3D_DATA_URL || `https://github.com/${DATA.repo}/releases/download/${DATA.release}/${DATA.asset}`;
  mkdirSync(root, { recursive: true });
  // The download is held in memory, then unpacked to disk: about its own size again, plus room to spare.
  ensureSpace(root, DATA.size * 1.3 + 20e6, 'the character data');
  note(`First run: downloading the character data (${megabytes(DATA.size)}). Later runs use the cached copy.`);
  status('Downloading character data...');
  const bytes = await download(url, DATA.size);
  status('Checking the download...');
  if (createHash('sha256').update(bytes).digest('hex') !== DATA.sha256) throw new UserError(`The character data download was damaged (its checksum doesn't match). Run ara3d again to download it afresh.${manual(url)}`);
  // Unpack beside the final folder, then move it into place, so an interrupted run never leaves half the data.
  status('Unpacking character data...');
  const temp = `${folder}.partial`;rmSync(temp, { recursive: true, force: true });
  try {
    for (const [path, content] of Object.entries(unzipSync(bytes))) {
      if (path.endsWith('/')) continue;
      const file = join(temp, path);mkdirSync(dirname(file), { recursive: true });writeFileSync(file, content);
    }
    rmSync(folder, { recursive: true, force: true });moveInto(temp, folder);
  } catch (error) { rmSync(temp, { recursive: true, force: true });throw error; }
  note(`Character data cached in ${folder}`);
  return folder;
}

export async function loadLibrary() {
  const folder = await dataFolder();
  status('Loading character data...');
  return new AssetLibrary({ read: async (p) => new Uint8Array(await readFile(join(folder, p))) }).init();
}
