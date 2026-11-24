/**
 * Loading packs from the web, and the packs a saved film or game needs. Works in browsers, workers and Node 18+.
 */
import { MAX_PACK_SIZE, PACK_ID, packUrl } from './format';
import { loadedPack, loadedPacks, registerPack, type LoadedPack, type PackRef } from './registry';

/** Packs a film or game can list. */
export const MAX_PACK_REFS = 24;
const inFlight = new Map<string, Promise<LoadedPack>>();

/** Downloads, checks and adds the pack at `url` (once, however many times it is asked for). */
export function loadPack(address: string, options: { signal?: AbortSignal; replace?: boolean } = {}): Promise<LoadedPack> {
  const url = packUrl(address, typeof location === 'undefined' ? undefined : location.href);
  // Asked to replace (adding a pack again), it is fetched again in case it changed.
  const already = !options.replace && loadedPacks().find((p) => p.url === url);
  if (already) return Promise.resolve(already);
  let pending = inFlight.get(url);
  if (!pending) {
    pending = (async () => {
      let response: Response;
      try { response = await fetch(url, { signal: options.signal, headers: { accept: 'application/json' } }); }
      catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        throw Error(`Couldn't reach ${url}. Check the address and the connection; the server must allow other sites to read it (CORS).`);
      }
      if (!response.ok) throw Error(`Couldn't load the pack at ${url} (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`);
      if (Number(response.headers.get('content-length')) > MAX_PACK_SIZE) throw Error(`The pack at ${url} is larger than ${MAX_PACK_SIZE / 1e6} MB.`);
      const text = await response.text();
      try { return registerPack(text, { url, replace: options.replace }); }
      catch (error) { throw Error(`The pack at ${url} can't be used: ${(error as Error).message}`); }
    })().finally(() => inFlight.delete(url));
    inFlight.set(url, pending);
  }
  return pending;
}

/** Checks the "packs" list of a film or game: [{ id, name?, url? }]. */
export function readPackRefs(value: unknown): PackRef[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_PACK_REFS) throw Error(`packs must be a list of up to ${MAX_PACK_REFS} packs.`);
  return value.map((raw, i) => {
    const r = raw as Record<string, unknown>;
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !PACK_ID.test(r.id)) throw Error(`Pack ${i + 1} needs an id (lower-case letters, digits and hyphens).`);
    if (r.url !== undefined && (typeof r.url !== 'string' || r.url.length > 2048)) throw Error(`Pack ${r.id}: url must be a web address.`);
    if (r.name !== undefined && (typeof r.name !== 'string' || r.name.length > 60)) throw Error(`Pack ${r.id}: name must be text of up to 60 characters.`);
    return { id: r.id, ...(typeof r.name === 'string' ? { name: r.name } : {}), ...(typeof r.url === 'string' ? { url: r.url } : {}) };
  });
}

/**
 * Loads the packs a film or game lists that aren't loaded yet. A pack without a web address that isn't loaded is an
 * error that names it, as is a pack whose file turns out to have another ID.
 */
export async function ensurePacks(value: unknown, options: { signal?: AbortSignal } = {}): Promise<LoadedPack[]> {
  const refs = readPackRefs(value);
  return Promise.all(refs.map(async (ref) => {
    const have = loadedPack(ref.id);
    if (have) return have;
    if (!ref.url) throw Error(`This needs the ${ref.name ?? ref.id} pack. Add it (Packs), then open this again.`);
    const got = await loadPack(ref.url, options);
    if (got.pack.id !== ref.id) throw Error(`The pack at ${ref.url} is "${got.pack.id}", not "${ref.id}".`);
    return got;
  }));
}

/** Loads the packs listed in a saved film or game (JSON text or the parsed object), before it is checked. */
export async function preparePacks(file: string | unknown, options: { signal?: AbortSignal } = {}): Promise<void> {
  let value = file;
  if (typeof file === 'string') { try { value = JSON.parse(file); } catch { return; } }
  if (value && typeof value === 'object' && 'packs' in value) await ensurePacks((value as { packs: unknown }).packs, options);
}
