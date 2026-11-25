/**
 * The library's model worker: turns a rigged model from another tool (GLB, glTF, VRM or FBX) into an Ara character,
 * textures included. It's its own file, loaded the first time a model is converted, as the model readers are large
 * and most pages never need them.
 */
import { characterFromFile, type ImportedCharacter } from '../../../../src/core/characters/model';
import { encodeTexture, workerTextures } from '../../../../src/app/characters/textures';
import type { ModelInput } from './generate';

export type ModelRequest = { id: number; input: ModelInput };
export type ModelReply = { id: number; type: 'progress'; label: string } | { id: number; type: 'done'; result: ImportedCharacter } | { id: number; type: 'error'; message: string };

workerTextures();
const post = (reply: ModelReply) => (self as unknown as Worker).postMessage(reply);
self.onmessage = async ({ data: { id, input } }: MessageEvent<ModelRequest>) => {
  try {
    const { model } = input;
    const result = await characterFromFile(model.bytes, model.fileName, {
      id: `model${id}`, ...(input.name ? { name: input.name } : {}), encodeTexture: (texture, exact) => encodeTexture(texture, exact, input.textureSize), files: new Map(model.files ?? []), ...(model.base ? { base: model.base } : {}),
      progress: (label) => post({ id, type: 'progress', label }),
    });
    post({ id, type: 'done', result });
  } catch (error) {
    post({ id, type: 'error', message: (error as Error)?.message ?? String(error) });
  }
};
