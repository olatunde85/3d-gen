/** The library's background worker: builds characters off the main thread and sends back GLB bytes. */
import { generate, libraryAt, type CharacterInput, type ConvertedModel, type GenerateOptions } from './generate';

export type WorkerRequest = { id: number; assetsUrl: string; input: CharacterInput | ConvertedModel; options: GenerateOptions };
export type WorkerReply =
  | { id: number; type: 'progress'; label: string; fraction: number }
  | { id: number; type: 'done'; result: Awaited<ReturnType<typeof generate>> }
  | { id: number; type: 'error'; message: string };

const post = (reply: WorkerReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(reply, transfer);

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  const { id, assetsUrl, input, options } = data;
  try {
    const lib = await libraryAt(assetsUrl);
    const result = await generate(lib, input, options, (label, fraction) => post({ id, type: 'progress', label, fraction }));
    post({ id, type: 'done', result }, [...new Set(result.files.map((f) => f.data.buffer as ArrayBuffer))]);
  } catch (error) {
    post({ id, type: 'error', message: (error as Error)?.message ?? String(error) });
  }
};
