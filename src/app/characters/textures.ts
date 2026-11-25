/**
 * Textures of models read in a worker (the builder's import worker, the ara3d library's worker): decoded without
 * <img>, and encoded as PNG or JPEG (at most 2048 pixels across) for the viewer and the exporters.
 */
import { Texture, TextureLoader, type Texture as ThreeTexture } from 'three';
import type { EncodedTexture } from '../../core/characters/model';

// Workers have no <img>: three's TextureLoader (used for FBX textures) decodes through fetch and createImageBitmap
// instead. glTF already uses ImageBitmapLoader, which works there.
// FBX textures arrive after the file is read: each one's decoding is remembered by its image source (which copies of
// the texture share), so encoding waits for it.
const decoding = new WeakMap<object, Promise<unknown>>();
let installed = false;
/** Makes three's TextureLoader work in this worker. */
export function workerTextures() {
  if (installed) return;
  installed = true;
  TextureLoader.prototype.load = function (this: TextureLoader, url: string, onLoad?: (t: Texture) => void, _progress?: unknown, onError?: (e: unknown) => void) {
    const texture = new Texture(), full = /^(blob|data):/.test(url) ? url : this.manager.resolveURL((this.path ?? '') + url);
    decoding.set(texture.source, fetch(full).then((r) => { if (!r.ok) throw Error(`${r.status}`);return r.blob(); }).then((b) => createImageBitmap(b, { premultiplyAlpha: 'none' })).then((image) => {
      texture.image = image;texture.needsUpdate = true;onLoad?.(texture);
    }).catch((e) => onError?.(e)));
    return texture;
  } as TextureLoader['load'];
}

/**
 * A texture's image as PNG or JPEG bytes, at most `size` pixels across, as stored in the file: images are decoded in their own orientation (glTF's
 * ImageBitmapLoader and the loader above), which is right for Ara once glTF's texture coordinates are flipped.
 */
export async function encodeTexture(texture: ThreeTexture, exact: boolean, size = 2048): Promise<EncodedTexture | undefined> {
  await decoding.get(texture.source);
  let image = texture.image as (ImageBitmap & { width: number; height: number; data?: ArrayLike<number> }) | undefined;
  if (!image?.width) return undefined;
  // Decoded pixels (TGA, which three's reader puts top row first, like any image): drawn into a canvas first.
  if (image.data) {
    const raw = new OffscreenCanvas(image.width, image.height);
    raw.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(image.data as ArrayLike<number>), image.width, image.height), 0, 0);
    image = raw as unknown as typeof image;
  }
  const k = Math.min(1, size / Math.max(image!.width, image!.height)), w = Math.max(1, Math.round(image!.width * k)), h = Math.max(1, Math.round(image!.height * k));
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
