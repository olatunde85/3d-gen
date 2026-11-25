/**
 * Turns a character model (GLB, glTF, VRM or FBX) into an Ara character off the main thread, textures included (see
 * textures.ts).
 */
import { characterFromFile, type ImportedCharacter } from '../../core/characters/model';
import { encodeTexture, workerTextures } from './textures';

export type CharacterImportRequest = { id: string; name: string; bytes: Uint8Array; /** Files beside it, by lower-case name (textures). */ files?: [string, Uint8Array][] };
export type CharacterImportReply = { type: 'progress'; label: string } | { type: 'done'; result: ImportedCharacter } | { type: 'error'; message: string };

workerTextures();
const post = (reply: CharacterImportReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(reply, transfer);
self.onmessage = async ({ data }: MessageEvent<CharacterImportRequest>) => {
  try {
    const result = await characterFromFile(data.bytes, data.name, { id: data.id, encodeTexture, progress: (label) => post({ type: 'progress', label }), files: new Map(data.files ?? []) });
    post({ type: 'done', result });
  } catch (error) {
    post({ type: 'error', message: (error as Error).message ?? String(error) });
  }
};
