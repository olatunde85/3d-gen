/** Screen recording for the Ara Play promo: Chrome's screencast frames, timed by Chrome, into a constant-rate clip. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface Cdp { send<T = Record<string, unknown>>(method: string, params?: object): Promise<T>; on(listener: (message: { method?: string; params?: any }) => void): () => void }
/** Record until `until` resolves, then write `<folder>/<name>.mp4` at 30 fps. Returns the clip's length in seconds. */
export async function record(cdp: Cdp, folder: string, name: string, until: () => Promise<unknown>, size = { width: 1920, height: 1080 }) {
  const frames: { data: string; time: number }[] = [];
  const off = cdp.on((m) => {
    if (m.method !== 'Page.screencastFrame') return;
    frames.push({ data: m.params.data, time: m.params.metadata.timestamp });
    void cdp.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });
  try { await until(); } finally { await cdp.send('Page.stopScreencast').catch(() => {});off(); }
  if (frames.length < 2) throw Error(`${name}: no frames recorded`);
  const work = mkdtempSync(join(tmpdir(), 'ara-promo-')), list: string[] = [];
  frames.forEach((f, i) => {
    const file = join(work, `${String(i).padStart(6, '0')}.jpg`);writeFileSync(file, Buffer.from(f.data, 'base64'));
    const next = frames[i + 1]?.time ?? f.time + 1 / 30;list.push(`file '${file}'`, `duration ${Math.max(0.001, next - f.time).toFixed(4)}`);
  });
  list.push(`file '${join(work, `${String(frames.length - 1).padStart(6, '0')}.jpg`)}'`);
  writeFileSync(join(work, 'list.txt'), list.join('\n'));mkdirSync(folder, { recursive: true });
  const out = join(folder, `${name}.mp4`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt'), '-vf', `fps=30,scale=${size.width}:${size.height}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', out]);
  rmSync(work, { recursive: true, force: true });
  const seconds = frames.at(-1)!.time - frames[0].time;
  console.log(`  recorded ${name}: ${frames.length} frames over ${seconds.toFixed(1)} s (${(frames.length / seconds).toFixed(0)} fps captured)`);
  return seconds;
}
