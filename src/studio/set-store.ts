/**
 * The sets imported into Studio, kept in this browser (IndexedDB), like animation packs and imported characters: each
 * set's details, staging map and preview, read when Studio opens, and its file, read when a film first shows it.
 * Studio calls restoreSets() once before it opens saved work.
 */
import { isMissingSet, sceneById, type SetId } from './catalog';
import { registerSets, stagingMapOf } from './set-check';
import { buildSet, MAX_SET_FILE, readSetFile, type SetManifest } from './set-files';
import { disposeSet, type StudioSet } from './sets';
import type { LocationMap } from './spatial-types';

interface Kept { id: SetId; manifest: SetManifest; map: LocationMap; preview?: Blob; size: number; added: number }
interface KeptFile { id: SetId; bytes: ArrayBuffer }

let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ara-sets', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('sets', { keyPath: 'id' });request.result.createObjectStore('files', { keyPath: 'id' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined;reject(request.error ?? Error('This browser can\'t keep sets.')); };
  });
}
async function run<T>(store: 'sets' | 'files', mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const s = (await db()).transaction(store, mode).objectStore(store);
  return new Promise<T>((resolve, reject) => { const r = fn(s);r.onsuccess = () => resolve(r.result);r.onerror = () => reject(r.error ?? Error('Set storage failed.')); });
}

const kept = new Map<SetId, Kept>(), previews = new Map<SetId, string>();
const loading = new Map<SetId, Promise<StudioSet>>(), loaded = new Map<SetId, StudioSet>();
let restored: Promise<void> | undefined;

function publish() {
  registerSets([...kept.values()].sort((a, b) => a.added - b.added));
}
function remember(set: Kept) {
  kept.set(set.id, set);
  const old = previews.get(set.id);
  if (old) URL.revokeObjectURL(old);
  if (set.preview) previews.set(set.id, URL.createObjectURL(set.preview));else previews.delete(set.id);
}

/** Lists the sets kept in this browser (once per page). */
export function restoreSets(): Promise<void> {
  return restored ??= (async () => {
    let saved: Kept[] = [];
    try { saved = await run<Kept[]>('sets', 'readonly', (s) => s.getAll()); } catch { /* Private browsing or storage off: no sets kept. */ }
    for (const set of saved) remember(set);
    publish();
  })();
}

/** The sets imported into this browser, oldest first. */
export const importedSets = () => [...kept.values()].sort((a, b) => a.added - b.added).map((s) => ({ id: s.id, name: s.manifest.name, author: s.manifest.author, license: s.manifest.license, release: s.manifest.release, size: s.size }));
/** An imported set's details, as its file gives them. */
export const setDetails = (id: SetId) => kept.get(id)?.manifest;
/** Whether a set's file is kept in this browser. */
export const hasSet = (id: SetId) => kept.has(id);
/** A still of an imported set, as a page address, if its file has one. */
export const setPreview = (id: SetId) => previews.get(id);
/** An imported set, once loaded (see loadSet). */
export const loadedSet = (id: SetId) => loaded.get(id);

/** Loads an imported set from this browser (once), ready to draw. */
export function loadSet(id: SetId): Promise<StudioSet> {
  let p = loading.get(id);
  if (!p) {
    p = (async () => {
      const file = await run<KeptFile | undefined>('files', 'readonly', (s) => s.get(id)).catch(() => undefined);
      if (!file) throw Error(`The set “${sceneById.get(id)?.name ?? id}” isn't in this browser. Import its set file to use it.`);
      return buildSet(file.bytes);
    })();
    p.then((set) => loaded.set(id, set), () => loading.delete(id));
    loading.set(id, p);
  }
  return p;
}

/**
 * Imports a set file: checks it, builds it once to measure its staging map, then keeps it in this browser. A set
 * with the same ID is replaced. Returns the set's ID and name.
 */
export async function importSetFile(file: Blob): Promise<{ id: SetId; name: string; release: string; author: string; replaced: boolean }> {
  await restoreSets();
  if (file.size > MAX_SET_FILE) throw Error(`That set file is over ${MAX_SET_FILE / 1024 / 1024} MB.`);
  const bytes = await file.arrayBuffer(), { manifest, preview } = readSetFile(bytes);
  // A set removed earlier, or one a film opened without it uses, is only noted by its ID: importing it is welcome.
  if (sceneById.has(manifest.id) && !kept.has(manifest.id) && !isMissingSet(manifest.id)) throw Error(`A set with the ID ${manifest.id} is already in Studio.`);
  const set = await buildSet(bytes);
  let map: LocationMap;
  try { map = stagingMapOf(manifest, set); }
  catch (error) { disposeSet(set.group);throw error; }
  // Imported sets live only in this browser: ask it not to clear them when space runs low (it may decline).
  void navigator.storage?.persist?.().catch(() => false);
  const entry: Kept = { id: manifest.id, manifest, map, ...(preview ? { preview } : {}), size: bytes.byteLength, added: kept.get(manifest.id)?.added ?? Date.now() };
  try {
    await run('files', 'readwrite', (s) => s.put({ id: manifest.id, bytes } satisfies KeptFile));
    await run('sets', 'readwrite', (s) => s.put(entry));
  } catch (error) {
    disposeSet(set.group);
    throw Error(`This browser couldn't keep the set (${(error as Error).name === 'QuotaExceededError' ? 'it is out of space' : (error as Error).message}).`);
  }
  const replaced = kept.has(manifest.id), old = loaded.get(manifest.id);
  if (old && old.group.parent === null) disposeSet(old.group);
  remember(entry);
  loaded.set(manifest.id, set);loading.set(manifest.id, Promise.resolve(set));
  publish();
  return { id: manifest.id, name: manifest.name, release: manifest.release, author: manifest.author, replaced };
}

/** Removes an imported set from Studio and this browser. Films using it keep its ID and show a stand-in stage. */
export async function removeSet(id: SetId) {
  kept.delete(id);
  const url = previews.get(id);
  if (url) URL.revokeObjectURL(url);
  previews.delete(id);loading.delete(id);
  const set = loaded.get(id);
  loaded.delete(id);
  if (set && set.group.parent === null) disposeSet(set.group);
  try { await run('files', 'readwrite', (s) => s.delete(id));await run('sets', 'readwrite', (s) => s.delete(id)); } catch { /* Nothing kept. */ }
  publish();
}
