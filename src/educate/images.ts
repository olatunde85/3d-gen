/**
 * A lesson's images (diagrams, photos), kept in this browser (IndexedDB) by ID so a large picture never weighs on the
 * lesson itself. A saved lesson file carries them inside it, as data, and opening one keeps them here again.
 */
import { setBoardImage } from '../studio/board';

let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ara-educate-images', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined;reject(request.error ?? Error('This browser can’t keep images.')); };
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const s = (await db()).transaction('images', mode).objectStore('images');
  return new Promise<T>((resolve, reject) => { const r = fn(s);r.onsuccess = () => resolve(r.result);r.onerror = () => reject(r.error ?? Error('Image storage failed.')); });
}

/** The longest side an image is kept at: plenty for a 1080p video, small enough to keep. */
const MAX_SIDE = 2048;
export const MAX_IMAGE_FILE = 30 * 1024 * 1024;

/** Keeps an image a person chose: scaled down if it's very large, under a new ID. */
export async function addImage(file: Blob): Promise<string> {
  if (file.size > MAX_IMAGE_FILE) throw Error('Choose an image smaller than 30 MB.');
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) throw Error('Choose a PNG, JPEG, WebP, GIF or SVG image.');
  const bitmap = await createImageBitmap(file).catch(() => { throw Error('This image couldn’t be read.'); });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  let blob: Blob = file;
  if (scale < 1 || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await canvas.convertToBlob({ type: file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', quality: 0.9 });
  }
  const id = `img-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  await run('readwrite', (s) => s.put(blob, id));
  setBoardImage(id, await createImageBitmap(blob));
  return id;
}

/** Makes sure each of these images is decoded and ready to draw; returns the IDs this browser doesn't have. */
export async function loadImages(ids: Iterable<string>): Promise<string[]> {
  const missing: string[] = [];
  for (const id of new Set(ids)) {
    const blob = await run<Blob | undefined>('readonly', (s) => s.get(id)).catch(() => undefined);
    if (!blob) { missing.push(id);continue; }
    setBoardImage(id, await createImageBitmap(blob));
  }
  return missing;
}

/** An image, decoded, for the editor's own view of it. */
export async function imageBitmap(id: string): Promise<ImageBitmap | undefined> {
  const blob = await run<Blob | undefined>('readonly', (s) => s.get(id)).catch(() => undefined);
  return blob ? createImageBitmap(blob) : undefined;
}

/** The images as data, for a lesson file. */
export async function imagesData(ids: Iterable<string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of new Set(ids)) {
    const blob = await run<Blob | undefined>('readonly', (s) => s.get(id)).catch(() => undefined);
    if (blob) out[id] = await new Promise<string>((resolve) => { const r = new FileReader();r.onload = () => resolve(r.result as string);r.readAsDataURL(blob); });
  }
  return out;
}

/** Keeps the images a lesson file carries. */
export async function keepImages(data: Record<string, string>) {
  for (const [id, url] of Object.entries(data)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || !/^data:image\/(png|jpeg|webp);base64,/.test(url)) continue;
    const blob = await (await fetch(url)).blob();
    await run('readwrite', (s) => s.put(blob, id));
    setBoardImage(id, await createImageBitmap(blob));
  }
}
