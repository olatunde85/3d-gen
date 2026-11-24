/**
 * The packs added in this browser, kept in IndexedDB so the builder, Studio and Play all have them, offline too.
 * A pack loaded for a film or game (from its "packs" list) is kept the same way, so the film opens again anywhere
 * on this device. Each app calls restorePacks() once before it opens saved work.
 */
import { loadPack, loadedPack, loadedPacks, onPacksChange, PACK_EXTENSION, parsePack, registerPack, unregisterPack, type LoadedPack, type Pack } from '../../core/packs';
import type { ImportFile, ImportResult } from '../../core/packs/build';
import type { ImportReply, ImportRequest } from './import-worker';

interface Saved { id: string; url?: string; text: string; added: number }
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ara-packs', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('packs', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined;reject(request.error ?? Error('This browser can\'t keep packs.')); };
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const store = (await db()).transaction('packs', mode).objectStore('packs');
  return new Promise<T>((resolve, reject) => { const r = fn(store);r.onsuccess = () => resolve(r.result);r.onerror = () => reject(r.error ?? Error('Pack storage failed.')); });
}

/** Packs that failed to load from storage (a newer pack format, damaged data), by ID, with the reason. */
export const unusablePacks = new Map<string, string>();
/** The text of each pack kept in storage, by ID (a new version is stored again). */
const kept = new Map<string, string>();
let restored: Promise<void> | undefined;

/** Loads the packs kept in this browser (once per page), then keeps any pack loaded later. */
export function restorePacks(): Promise<void> {
  return restored ??= (async () => {
    let saved: Saved[] = [];
    try { saved = await run<Saved[]>('readonly', (s) => s.getAll()); } catch { /* Private browsing or storage off: packs last for this visit. */ }
    for (const p of saved.sort((a, b) => a.added - b.added)) {
      try { registerPack(p.text, p.url ? { url: p.url } : {});kept.set(p.id, p.text); }
      catch (error) { unusablePacks.set(p.id, (error as Error).message); }
    }
    onPacksChange(() => void keepNew());
    await keepNew();
  })();
}

async function keepNew() {
  for (const p of loadedPacks()) {
    if (kept.get(p.pack.id) === p.text) continue;
    kept.set(p.pack.id, p.text);
    try { await run('readwrite', (s) => s.put({ id: p.pack.id, ...(p.url ? { url: p.url } : {}), text: p.text, added: Date.now() } satisfies Saved)); }
    catch { kept.delete(p.pack.id); }
  }
}

/** Adds a pack from a web address or a file's text, keeping it in this browser. A new version of a pack replaces it. */
export async function addPack(source: { url: string } | { text: string }): Promise<LoadedPack> {
  await restorePacks();
  return 'url' in source ? loadPack(source.url, { replace: true }) : registerPack(source.text, { replace: true });
}

/** Removes a pack from this page and from this browser. */
export async function removePack(id: string) {
  unregisterPack(id);
  unusablePacks.delete(id);
  kept.delete(id);
  try { await run('readwrite', (s) => s.delete(id)); } catch { /* Nothing kept. */ }
}

/**
 * Imports animation files (FBX, GLB, glTF, BVH) as a pack, converted in a background worker: into an imported pack
 * (`into`, its ID), or as a new pack named `name`. The pack is kept in this browser like any other.
 */
export async function importFiles(files: readonly ImportFile[], options: { into?: string; name?: string; progress?: (done: number, total: number, label: string) => void } = {}): Promise<ImportResult & { loaded: LoadedPack }> {
  await restorePacks();
  // Imported packs live only in this browser: ask it not to clear them when space runs low (it may decline).
  void navigator.storage?.persist?.().catch(() => false);
  const into = options.into ? loadedPack(options.into)?.pack : undefined;
  const worker = new Worker(new URL('./import-worker.ts', import.meta.url), { type: 'module' });
  try {
    const result = await new Promise<ImportResult>((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<ImportReply>) => {
        if (data.type === 'progress') options.progress?.(data.done, data.total, data.label);
        else if (data.type === 'done') resolve(data.result);
        else reject(Error(data.message));
      };
      worker.onerror = (event) => reject(Error(event.message || 'The import stopped unexpectedly.'));
      const request: ImportRequest = { files: [...files], into, name: options.name, takenIds: loadedPacks().map((p) => p.pack.id) };
      worker.postMessage(request, [...new Set(files.map((f) => f.bytes.buffer as ArrayBuffer))]);
    });
    return { ...result, loaded: registerPack(JSON.stringify(result.pack), { replace: true }) };
  } finally { worker.terminate(); }
}

/** Whether a pack can be edited here: one imported or added from a file (a hosted pack keeps its author's version). */
export const editablePack = (id: string) => { const p = loadedPack(id);return !!p && !p.url; };

/** Changes an imported pack (its name, or its animations' names and groups, or which animations it keeps). */
export function editPack(id: string, change: (pack: Pack) => void): LoadedPack {
  const current = loadedPack(id);
  if (!current || current.url) throw Error('Only imported packs can be edited.');
  const next = structuredClone(current.pack);
  change(next);
  return registerPack(JSON.stringify(parsePack(JSON.stringify(next))), { replace: true });
}

/** The pack as a file to download (to host it, or to share it). */
export function packFile(id: string): File {
  const p = loadedPack(id);
  if (!p) throw Error('That pack is no longer loaded.');
  return new File([p.text], `${p.pack.id}${PACK_EXTENSION}`, { type: 'application/json' });
}