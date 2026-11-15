/**
 * Failures a user can act on: plain-language messages for permission, disk and network errors, a free-space check
 * before writing, and files written under a temporary name and renamed when complete. Ctrl+C keeps Node's instant
 * stop (a handler couldn't run during a long build); the temporary name means it never leaves a broken file, and
 * `removeLeftovers` tidies any temporary file on the next run.
 */
import { mkdirSync, readdirSync, renameSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { megabytes } from './status';

/** Where downloads are cached: ARA3D_CACHE, or the platform's usual cache folder. */
export function cacheRoot() {
  if (process.env.ARA3D_CACHE) return process.env.ARA3D_CACHE;
  if (process.platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ara3d', 'cache');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'ara3d');
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'ara3d');
}

/** Errors whose message is already written for the user. */
export class UserError extends Error {}

/** Free bytes on the drive holding `path`, or undefined where the system can't tell. */
export function freeSpace(path: string) {
  try { const s = statfsSync(path);return Number(s.bavail) * Number(s.bsize); } catch { return undefined; }
}

/** Stops with a clear message when the drive holding `folder` has less than `bytes` free. */
export function ensureSpace(folder: string, bytes: number, what: string) {
  const free = freeSpace(folder);
  if (free !== undefined && free < bytes) throw new UserError(`Not enough disk space for ${what}: it needs about ${megabytes(bytes)}, and ${megabytes(free)} is free on the drive holding ${folder}. Free some space, or choose another folder${what.includes('character data') ? ' with ARA3D_CACHE' : ' with --out'}.`);
}

/** Writes a file completely or not at all, so a full disk, a crash or Ctrl+C never leaves a broken file. */
export function writeSafely(file: string, data: Uint8Array) {
  const temp = `${file}.partial`;
  mkdirSync(dirname(file), { recursive: true });
  ensureSpace(dirname(file), data.length + 1e6, file);
  try { writeFileSync(temp, data);renameSync(temp, file); }
  catch (error) { rmSync(temp, { force: true });throw error; }
}

const NETWORK = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);
const codeOf = (error: unknown): string | undefined => {
  const e = error as { code?: string; cause?: unknown };
  return e?.code ?? (e?.cause ? codeOf(e.cause) : undefined);
};
export const isNetworkError = (error: unknown) => (error as Error)?.name === 'AbortError' || (error as Error)?.message === 'fetch failed' || (error as Error)?.message === 'terminated' || NETWORK.has(codeOf(error) ?? '');
/** Errors that would hit every remaining character too, so a batch stops instead of repeating them. */
export const isFatal = (error: unknown) => error instanceof UserError ? /disk space|Can't write/.test(error.message) : ['EACCES', 'EPERM', 'EROFS', 'ENOSPC'].includes(codeOf(error) ?? '');

/** One line a user can act on, for any error. */
export function explain(error: unknown): string {
  if (error instanceof UserError) return error.message;
  const e = error as NodeJS.ErrnoException, code = codeOf(error), path = e?.path ? ` ${e.path}` : '';
  const setting = e?.path && resolve(e.path).startsWith(resolve(cacheRoot())) ? 'ARA3D_CACHE' : '--out';
  if (code === 'EACCES' || code === 'EPERM') return `Can't write to${path}: permission denied. Choose another folder with ${setting}.`;
  if (code === 'EROFS') return `Can't write to${path}: the drive is read-only. Choose another folder with ${setting}.`;
  if (code === 'EISDIR') return `Can't write${(e as { dest?: string })?.dest ? ` ${(e as { dest?: string }).dest}` : path}: a folder with that name is in the way. Rename or remove it, or choose another folder with --out.`;
  if (code === 'ENOTDIR') return `Can't write to${path}: part of that path is a file, not a folder. Choose another folder with --out.`;
  if (code === 'ENOSPC') return `The disk is full${path ? ` (writing${path})` : ''}. Free some space and try again.`;
  if (code === 'ENOENT') return `Not found:${path || ' a file or folder'}.`;
  if (code === 'ENOMEM' || /heap out of memory|Array buffer allocation failed/i.test(e?.message ?? '')) return 'Ran out of memory. Try --detail low, fewer --animations, or one format at a time.';
  if (isNetworkError(error)) return 'The network connection failed. Check your connection and try again.';
  return e?.message ?? String(error);
}

/** Removes temporary files a stopped run left in `folder` (only ara3d's own: a model or zip name plus ".partial"). */
export function removeLeftovers(folder: string) {
  try { for (const name of readdirSync(folder)) if (/\.(glb|fbx|obj|zip)\.partial$/.test(name)) rmSync(join(folder, name), { force: true }); } catch { /* Nothing to tidy. */ }
}
