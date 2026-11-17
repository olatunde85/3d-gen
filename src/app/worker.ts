/**
 * Generation worker: builds characters and runs exports off the main thread,
 * so the UI and the 3D view stay fluid while they work. Messages are handled
 * one at a time, in order.
 */
import { AssetLibrary, fetchSource } from '../core/assets';
import { buildHuman, type Character } from '../core/human';
import { neededTargets } from '../core/morph';
import type { HumanParams } from '../core/params';
import { planExport, runExport, type ExportFile, type ExportSettings } from '../export';

export type ToWorker =
  | { type: 'init'; assets: string }
  | { type: 'build'; id: number; params: HumanParams }
  | { type: 'export'; id: number; settings: ExportSettings; previewPng?: Uint8Array };

export type FromWorker =
  | { type: 'progress'; id: number; label: string; frac?: number }
  | { type: 'built'; id: number; ch: Character; textures: [string, Uint8Array][] }
  | { type: 'exported'; id: number; file: ExportFile }
  | { type: 'error'; id: number; message: string };

let lib: Promise<AssetLibrary> | undefined;
let current: Character | undefined;
const sent = new Set<string>();
const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

async function handle(m: ToWorker) {
  if (m.type === 'init') {
    // Body shapes load as each character needs them (see AssetLibrary.initWeb), not all up front.
    lib = new AssetLibrary(fetchSource(m.assets)).initWeb();
    return;
  }
  try {
    const L = await lib!;
    if (m.type === 'build') {
      await L.loadTargets(neededTargets(L, m.params));
      current = await buildHuman(L, m.params, { onStage: (label) => post({ type: 'progress', id: m.id, label }) });
      // Generated textures (fabrics, tattoos, hair) the main thread hasn't seen yet.
      const textures: [string, Uint8Array][] = [];
      for (const name of L.generatedNames())
        if (!sent.has(name)) {
          sent.add(name);
          textures.push([name, L.peekTexture(name)!]);
        }
      post({ type: 'built', id: m.id, ch: current, textures });
    } else {
      if (!current) throw new Error('no character built yet');
      const plan = planExport(current, m.settings);
      const file = await runExport(L, current, plan, {
        previewPng: m.previewPng,
        onProgress: (label, frac) => post({ type: 'progress', id: m.id, label, frac }),
      });
      post({ type: 'exported', id: m.id, file }, [file.data.buffer]);
    }
  } catch (e) {
    post({ type: 'error', id: 'id' in m ? m.id : -1, message: (e as Error).message ?? String(e) });
  }
}

let chain = Promise.resolve();
self.onmessage = (e: MessageEvent<ToWorker>) => {
  chain = chain.then(() => handle(e.data));
};
