/**
 * The props imported in this browser, kept in IndexedDB so the builder, Studio and Play all have them, like content
 * packs. Each app calls restoreProps() once before it opens saved work; a character or film that names a prop this
 * browser doesn't have keeps its name and shows Ara's own vehicle until the prop file is imported.
 */
import { loadPropModel, propModel, registerPropModel, unregisterPropModel, type PropManifest } from '../../core/props/prop-models';

interface Kept { id: string; manifest: PropManifest; bytes: ArrayBuffer; added: number }
let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ara-props', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('props', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined;reject(request.error ?? Error('This browser can\'t keep props.')); };
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const store = (await db()).transaction('props', mode).objectStore('props');
  return new Promise<T>((resolve, reject) => { const r = fn(store);r.onsuccess = () => resolve(r.result);r.onerror = () => reject(r.error ?? Error('Prop storage failed.')); });
}

/** Props that failed to load from storage, by ID, with the reason. */
export const unusableProps = new Map<string, string>();
let restored: Promise<void> | undefined;

/** Loads the props kept in this browser (once per page). */
export function restoreProps(): Promise<void> {
  return restored ??= (async () => {
    let saved: Kept[] = [];
    try { saved = await run<Kept[]>('readonly', (s) => s.getAll()); } catch { /* Private browsing or storage off: no props kept. */ }
    for (const p of saved.sort((a, b) => a.added - b.added)) {
      try { registerPropModel(await loadPropModel(p.bytes)); }
      catch (error) { unusableProps.set(p.id, (error as Error).message); }
    }
  })();
}

/** Imports a prop file and keeps it in this browser; a prop with the same ID is replaced. */
export async function importPropFile(file: Blob): Promise<{ manifest: PropManifest; replaced: boolean }> {
  await restoreProps();
  const bytes = await file.arrayBuffer(), model = await loadPropModel(bytes), id = model.manifest.id;
  const replaced = !!propModel(id);
  // Imported props live only in this browser: ask it not to clear them when space runs low (it may decline).
  void navigator.storage?.persist?.().catch(() => false);
  try { await run('readwrite', (s) => s.put({ id, manifest: model.manifest, bytes, added: Date.now() } satisfies Kept)); }
  catch (error) { throw Error(`This browser couldn't keep the prop (${(error as Error).name === 'QuotaExceededError' ? 'it is out of space' : (error as Error).message}).`); }
  registerPropModel(model);
  unusableProps.delete(id);
  return { manifest: model.manifest, replaced };
}

/** Removes a prop from this page and this browser. */
export async function removeProp(id: string) {
  unregisterPropModel(id);
  unusableProps.delete(id);
  try { await run('readwrite', (s) => s.delete(id)); } catch { /* Nothing kept. */ }
}

/** Imports a chosen prop file, saying how it went; resolves with its ID, or undefined if it couldn't be used. */
export async function importChosenProp(file: File | undefined, notify: (text: string, ok: boolean) => void): Promise<string | undefined> {
  if (!file) return undefined;
  try {
    const { manifest, replaced } = await importPropFile(file);
    notify(replaced ? `Updated “${manifest.name}” to ${manifest.release}.` : `Imported “${manifest.name}” ${manifest.release} by ${manifest.author}. It's kept in this browser.`, true);
    return manifest.id;
  } catch (error) { notify((error as Error).message, false);return undefined; }
}
