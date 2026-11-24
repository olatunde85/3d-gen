/**
 * Turns a character model (GLB, glTF or FBX) into an Ara character off the main thread, textures included: they are
 * decoded here and re-encoded as PNG (at most 2048 pixels across) for the viewer and the exporters.
 */
import { Texture, TextureLoader, type Texture as ThreeTexture } from 'three';
import { characterFromFile, type ImportedCharacter } from '../../core/characters/model';

export type CharacterImportRequest = { id: string; name: string; bytes: Uint8Array };
export type CharacterImportReply = { type: 'done'; result: ImportedCharacter } | { type: 'error'; message: string };

// Workers have no <img>: three's TextureLoader (used for FBX textures) decodes through fetch and createImageBitmap
// instead. glTF already uses ImageBitmapLoader, which works here.
// FBX textures arrive after the file is read: each one's decoding is remembered by its image source (which copies of
// the texture share), so encoding waits for it.
const decoding = new WeakMap<object, Promise<unknown>>();
TextureLoader.prototype.load = function (url: string, onLoad?: (t: Texture) => void, _progress?: unknown, onError?: (e: unknown) => void) {
  const texture = new Texture();
  decoding.set(texture.source, fetch(url).then((r) => r.blob()).then((b) => createImageBitmap(b, { premultiplyAlpha: 'none' })).then((image) => {
    texture.image = image;texture.needsUpdate = true;onLoad?.(texture);
  }).catch((e) => onError?.(e)));
  return texture;
} as TextureLoader['load'];

const MAX_TEXTURE = 2048;
/**
 * A texture's image as PNG bytes, as stored in the file: images are decoded in their own orientation (glTF's
 * ImageBitmapLoader and the loader above), which is right for Ara once glTF's texture coordinates are flipped.
 */
async function encode(texture: ThreeTexture, exact: boolean): Promise<{ bytes: Uint8Array; type: 'png' | 'jpg' } | undefined> {
  await decoding.get(texture.source);
  const image = texture.image as (ImageBitmap & { width: number; height: number }) | undefined;
  if (!image?.width) return undefined;
  const k = Math.min(1, MAX_TEXTURE / Math.max(image.width, image.height)), w = Math.max(1, Math.round(image.width * k)), h = Math.max(1, Math.round(image.height * k));
  const canvas = new OffscreenCanvas(w, h), ctx = canvas.getContext('2d')!;
  ctx.drawImage(image as CanvasImageSource, 0, 0, w, h);
  // Colours without see-through parts keep their look as JPEG at a fraction of the size; the rest stay exact as PNG.
  const blob = await canvas.convertToBlob(exact ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.92 });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: exact ? 'png' : 'jpg' };
}

const post = (reply: CharacterImportReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(reply, transfer);
self.onmessage = async ({ data }: MessageEvent<CharacterImportRequest>) => {
  try {
    const result = await characterFromFile(data.bytes, data.name, { id: data.id, encodeTexture: encode });
    post({ type: 'done', result });
  } catch (error) {
    post({ type: 'error', message: (error as Error).message ?? String(error) });
  }
};
