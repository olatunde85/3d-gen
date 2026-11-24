/**
 * Converts animation files into a pack off the main thread, so the page stays responsive while dozens of Mixamo
 * files are read. Only motion is read: textures inside the files are skipped (workers can't decode them into
 * three.js images, and animations don't need them).
 */
import { ImageBitmapLoader, Texture, TextureLoader } from 'three';
import { importAnimations, type ImportFile, type ImportResult } from '../../core/packs/build';
import type { Pack } from '../../core/packs/format';

export type ImportRequest = { files: ImportFile[]; into?: Pack; name?: string; takenIds: string[] };
export type ImportReply =
  | { type: 'progress'; done: number; total: number; label: string }
  | { type: 'done'; result: ImportResult }
  | { type: 'error'; message: string };

const skip = function (_url: string, onLoad?: (texture: Texture) => void) {
  const texture = new Texture();
  onLoad?.(texture);
  return texture;
};
TextureLoader.prototype.load = skip as TextureLoader['load'];
ImageBitmapLoader.prototype.load = skip as unknown as ImageBitmapLoader['load'];

const post = (reply: ImportReply) => (self as unknown as Worker).postMessage(reply);
self.onmessage = async ({ data }: MessageEvent<ImportRequest>) => {
  try {
    const result = await importAnimations(data.files, { into: data.into, name: data.name, takenIds: data.takenIds, progress: (done, total, label) => post({ type: 'progress', done, total, label }) });
    post({ type: 'done', result });
  } catch (error) {
    post({ type: 'error', message: (error as Error).message ?? String(error) });
  }
};
