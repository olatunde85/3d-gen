/**
 * Turns a character model (GLB, glTF, VRM or FBX) into an Ara character off the main thread, textures included: they are
 * decoded here and re-encoded as PNG (at most 2048 pixels across) for the viewer and the exporters.
 */
import { Texture, TextureLoader, type Texture as ThreeTexture } from 'three';
import { characterFromFile, type EncodedTexture, type ImportedCharacter } from '../../core/characters/model';

export type CharacterImportRequest = { id: string; name: string; bytes: Uint8Array; /** Files beside it, by lower-case name (textures). */ files?: [string, Uint8Array][] };
export type CharacterImportReply = { type: 'progress'; label: string } | { type: 'done'; result: ImportedCharacter } | { type: 'error'; message: string };

// Workers have no <img>: three's TextureLoader (used for FBX textures) decodes through fetch and createImageBitmap
// instead. glTF already uses ImageBitmapLoader, which works here.
// FBX textures arrive after the file is read: each one's decoding is remembered by its image source (which copies of
// the texture share), so encoding waits for it.
const decoding = new WeakMap<object, Promise<unknown>>();
TextureLoader.prototype.load = function (this: TextureLoader, url: string, onLoad?: (t: Texture) => void, _progress?: unknown, onError?: (e: unknown) => void) {
  const texture = new Texture(), full = /^(blob|data):/.test(url) ? url : this.manager.resolveURL((this.path ?? '') + url);
  decoding.set(texture.source, fetch(full).then((r) => r.blob()).then((b) => createImageBitmap(b, { premultiplyAlpha: 'none' })).then((image) => {
    texture.image = image;texture.needsUpdate = true;onLoad?.(texture);
  }).catch((e) => onError?.(e)));
  return texture;
} as TextureLoader['load'];

const MAX_TEXTURE = 2048;
/**
 * A texture's image as PNG bytes, as stored in the file: images are decoded in their own orientation (glTF's
 * ImageBitmapLoader and the loader above), which is right for Ara once glTF's texture coordinates are flipped.
 */
async function encode(texture: ThreeTexture, exact: boolean): Promise<EncodedTexture | undefined> {
  await decoding.get(texture.source);
  let image = texture.image as (ImageBitmap & { width: number; height: number; data?: ArrayLike<number> }) | undefined;
  if (!image?.width) return undefined;
  // Decoded pixels (TGA, which three's reader puts top row first, like any image): drawn into a canvas first.
  if (image.data) {
    const raw = new OffscreenCanvas(image.width, image.height);
    raw.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.data as ArrayLike<number>), image.width, image.height), 0, 0);
    image = raw as unknown as typeof image;
  }
  const k = Math.min(1, MAX_TEXTURE / Math.max(image!.width, image!.height)), w = Math.max(1, Math.round(image!.width * k)), h = Math.max(1, Math.round(image!.height * k));
  const canvas = new OffscreenCanvas(w, h), ctx = canvas.getContext('2d')!;
  ctx.drawImage(image as CanvasImageSource, 0, 0, w, h);
  // How see-through it is: no transparent pixels, hard-edged cut-outs, or soft edges (more than 2% part-transparent).
  const pixels = ctx.getImageData(0, 0, w, h).data;
  let clear = 0, partial = 0;
  for (let i = 3; i < pixels.length; i += 4) { const a = pixels[i];if (a < 10) clear++;else if (a < 245) partial++; }
  const alpha: EncodedTexture['alpha'] = !clear && !partial ? 'none' : partial > (w * h) * 0.02 ? 'soft' : 'cutout';
  // Colours without see-through parts keep their look as JPEG at a fraction of the size; the rest stay exact as PNG.
  const png = exact || alpha !== 'none';
  const blob = await canvas.convertToBlob(png ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.92 });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: png ? 'png' : 'jpg', alpha };
}

const post = (reply: CharacterImportReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(reply, transfer);
self.onmessage = async ({ data }: MessageEvent<CharacterImportRequest>) => {
  try {
    const result = await characterFromFile(data.bytes, data.name, { id: data.id, encodeTexture: encode, progress: (label) => post({ type: 'progress', label }), files: new Map(data.files ?? []) });
    post({ type: 'done', result });
  } catch (error) {
    post({ type: 'error', message: (error as Error).message ?? String(error) });
  }
};
