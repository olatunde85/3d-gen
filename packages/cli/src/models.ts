/**
 * Rigged models from other tools on the command line and in the MCP server: read from disk with the files beside them
 * (their textures), and turned into Ara characters.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { AssetLibrary } from '../../../src/core/assets';
import { characterFromFile, type ImportedCharacter } from '../../../src/core/characters/model';
import { isModelFile } from '../../../src/core/packs/build';
import { nodeLoaders, textureBytes } from './pack';

/**
 * Image and data files near a model that it may name: in its folder, the folders inside it, and the folders beside
 * it (Unity packages keep _FBX/ beside Texture/). By lower-case name, the nearest first; at most 400 MB read.
 */
export function filesNear(model: string): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>(), here = dirname(resolve(model)), up = dirname(here);
  let total = 0;
  const take = (dir: string, deeper: boolean) => {
    let names: string[];
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      const path = join(dir, name);
      let stat;
      try { stat = statSync(path); } catch { continue; }
      if (stat.isDirectory()) { if (deeper && !name.startsWith('.')) take(path, false);continue; }
      const key = name.toLowerCase();
      if (!isModelFile(name) || out.has(key) || stat.size > 64e6 || total + stat.size > 400e6) continue;
      out.set(key, new Uint8Array(readFileSync(path)));total += stat.size;
    }
  };
  take(here, true);
  if (up !== here) take(up, true);
  return out;
}

let count = 0;
/**
 * A model file as an Ara character, with what was found beside it in one line: its textures are registered with the
 * character data, so the exporters find them.
 */
export async function readModel(lib: AssetLibrary, file: string): Promise<{ imported: ImportedCharacter; found: string }> {
  nodeLoaders();
  const imported = await characterFromFile(new Uint8Array(readFileSync(file)), basename(file), { id: `model${++count}`, encodeTexture: textureBytes, files: filesNear(file) });
  for (const [name, bytes] of imported.textures) lib.registerTexture(name, bytes);
  const used = imported.report.files ?? [], mats = used.filter((f) => f.endsWith('.mat')).length, images = used.length - mats, plural = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
  return { imported, found: used.length ? `${[images && plural(images, 'texture'), mats && plural(mats, 'Unity material colour')].filter(Boolean).join(' and ')} found beside it` : '' };
}
