/** Main-thread client for the generation worker (see worker.ts). */
import type { AssetLibrary } from '../core/assets';
import type { Character } from '../core/human';
import type { HumanParams } from '../core/params';
import type { ExportFile, ExportSettings } from '../export';
import type { FromWorker, ToWorker } from './worker';
import { loadedPacks, onPacksChange } from '../core/packs/registry';

type Progress = (label: string, frac?: number) => void;
/** A request without its id (distributes over the message union). */
type WorkerRequest = ToWorker extends infer T ? (T extends { id: number } ? Omit<T, 'id'> : never) : never;
interface Pending {
  resolve: (v: never) => void;
  reject: (e: Error) => void;
  progress?: Progress;
}

export class Engine {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private pending = new Map<number, Pending>();
  private next = 1;

  /** `lib` receives the textures the worker generates, so the viewer can show them. */
  constructor(private lib: AssetLibrary, assets: string) {
    this.send({ type: 'init', assets });
    // The worker exports animations too, so it gets every content pack this page has, now and as they change.
    const packs = () => this.send({ type: 'packs', packs: loadedPacks().map((p) => ({ text: p.text, url: p.url })) });
    packs();
    onPacksChange(packs);
    // A worker that fails to load or crashes fails every pending call (instead of hanging).
    this.worker.onerror = (e) => {
      const err = new Error(e.message || 'generation worker failed to start');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') return p.progress?.(m.label, m.frac);
      this.pending.delete(m.id);
      if (m.type === 'error') return p.reject(new Error(m.message));
      if (m.type === 'built') {
        for (const [name, data] of m.textures) this.lib.registerTexture(name, data);
        return p.resolve(m.ch as never);
      }
      p.resolve(m.file as never);
    };
  }

  private send(m: ToWorker, transfer: Transferable[] = []) {
    this.worker.postMessage(m, transfer);
  }

  private call<T>(m: WorkerRequest, progress?: Progress): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: never) => void, reject, progress });
      this.send({ ...m, id } as ToWorker);
    });
  }

  build(params: HumanParams, progress?: Progress): Promise<Character> {
    return this.call({ type: 'build', params }, progress);
  }

  /** Exports the most recently built character. */
  export(settings: ExportSettings, previewPng: Uint8Array | undefined, progress?: Progress): Promise<ExportFile> {
    return this.call({ type: 'export', settings, previewPng }, progress);
  }
}
