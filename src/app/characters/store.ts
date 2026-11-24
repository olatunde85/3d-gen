/**
 * Characters imported from model files (GLB, glTF, FBX), kept in this browser for the builder, Studio and Play. The
 * original file is kept (not the converted character) and converted again, in a worker, each time it's opened: it's
 * smaller, and a model opened later gets any improvements to the converter.
 */
import type { AssetLibrary } from '../../core/assets';
import type { ImportedCharacter } from '../../core/characters/model';
import { isModelFile } from '../../core/packs/build';
import type { CharacterImportReply, CharacterImportRequest } from './import-worker';

/**
 * Largest model the website opens, in bytes: 50 MB, as everything runs in the visitor's browser and phones run out
 * of memory on bigger ones. VITE_MAX_MODEL_MB raises it for a copy of Ara on a computer with room (up to 200).
 */
export const SITE_MODEL_LIMIT = Math.min(200, Math.max(1, Number(import.meta.env.VITE_MAX_MODEL_MB) || 50)) * 1e6;
type Progress = (label: string) => void;

export interface SavedModel { id: string; name: string; fileName: string; bytes: Uint8Array; added: number; /** Files beside it that it uses (its textures), by lower-case name. */ files?: [string, Uint8Array][] }
export interface OpenedCharacter extends ImportedCharacter { id: string; name: string }

let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ara-characters', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('models', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined;reject(request.error ?? Error('This browser can\'t keep characters.')); };
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const store = (await db()).transaction('models', mode).objectStore('models');
  return new Promise<T>((resolve, reject) => { const r = fn(store);r.onsuccess = () => resolve(r.result);r.onerror = () => reject(r.error ?? Error('Character storage failed.')); });
}

/** Converts a model in a worker. */
function convert(id: string, name: string, bytes: Uint8Array, progress?: Progress, files?: [string, Uint8Array][]): Promise<ImportedCharacter> {
  const worker = new Worker(new URL('./import-worker.ts', import.meta.url), { type: 'module' });
  return new Promise<ImportedCharacter>((resolve, reject) => {
    worker.onmessage = ({ data }: MessageEvent<CharacterImportReply>) => { if (data.type === 'progress') progress?.(data.label);else if (data.type === 'done') resolve(data.result);else reject(Error(data.message)); };
    worker.onerror = (event) => reject(Error(event.message || 'The import stopped unexpectedly.'));
    // The worker gets its own copy (the kept file stays here), moved rather than copied again.
    const copy = bytes.slice();
    worker.postMessage({ id, name, bytes: copy, ...(files?.length ? { files } : {}) } satisfies CharacterImportRequest, [copy.buffer]);
  }).finally(() => worker.terminate());
}

const opened = new Map<string, Promise<OpenedCharacter>>();

/** Imports a model file: converts it (an error says what's wrong with it) and keeps it in this browser. */
export async function importCharacterFile(file: File, progress?: Progress, beside: readonly File[] = []): Promise<OpenedCharacter> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  // Files that came with it (its textures, a glTF's .bin), by name: the model finds the ones it names.
  const files = await Promise.all(beside.filter((f) => f !== file && isModelFile(f.name)).map(async (f) => [f.name.toLowerCase(), new Uint8Array(await f.arrayBuffer())] as [string, Uint8Array]));
  const result = await convert(id, file.name, bytes, progress, files), name = result.character.params.name;
  // Only the files it used are kept with it.
  const used = new Set(result.report.files ?? []), kept = files.filter(([n]) => used.has(n));
  void navigator.storage?.persist?.().catch(() => false);
  try { await run('readwrite', (s) => s.put({ id, name, fileName: file.name, bytes, added: Date.now(), ...(kept.length ? { files: kept } : {}) } satisfies SavedModel)); }
  catch { /* Not kept (private browsing, storage full): it still works until the page closes. */ }
  const character: OpenedCharacter = { ...result, id, name };
  opened.set(id, Promise.resolve(character));
  return character;
}

/** An imported character by its ID, converted from its kept file (once per page). */
export function openCharacter(id: string, progress?: Progress): Promise<OpenedCharacter> {
  let p = opened.get(id);
  if (!p) {
    p = (async () => {
      const saved = await run<SavedModel | undefined>('readonly', (s) => s.get(id));
      if (!saved) throw Error('That imported character is no longer in this browser. Open its file again.');
      const result = await convert(id, saved.fileName, saved.bytes, progress, saved.files);
      result.character.params = { ...result.character.params, name: saved.name };
      return { ...result, id, name: saved.name };
    })();
    p.catch(() => opened.delete(id));
    opened.set(id, p);
  }
  return p;
}

/** The imported characters kept in this browser, newest first (without their files). */
export async function importedCharacters(): Promise<Omit<SavedModel, 'bytes' | 'files'>[]> {
  try {
    const all = await run<SavedModel[]>('readonly', (s) => s.getAll());
    return all.sort((a, b) => b.added - a.added).map(({ bytes: _bytes, files: _files, ...rest }) => rest);
  } catch { return []; }
}

/** Renames an imported character. */
export async function renameCharacter(id: string, name: string) {
  const saved = await run<SavedModel | undefined>('readonly', (s) => s.get(id));
  if (saved) await run('readwrite', (s) => s.put({ ...saved, name: name.slice(0, 60) }));
  const o = opened.get(id);
  if (o) opened.set(id, o.then((c) => ({ ...c, name, character: { ...c.character, params: { ...c.character.params, name } } })));
}

/** Removes an imported character from this browser. */
export async function removeCharacter(id: string) {
  opened.delete(id);
  try { await run('readwrite', (s) => s.delete(id)); } catch { /* Nothing kept. */ }
}

/** Makes a character's textures available to the viewer and the exporters (in this page's asset library). */
export function registerTextures(lib: AssetLibrary, textures: readonly [string, Uint8Array][]) {
  for (const [name, bytes] of textures) if (!lib.hasTexture(name)) lib.registerTexture(name, bytes);
}
