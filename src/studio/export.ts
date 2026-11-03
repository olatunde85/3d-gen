/** Deterministic, bounded video encoding. A slow render still creates an exact 30 fps movie. */
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeVideo } from 'mediabunny';
import type { StudioScene } from './scene';
import { durationOf, type StudioProject } from './project';

const bitrateFor = (width: number, height: number) => Math.max(width, height) >= 1920 ? 8_000_000 : 4_500_000;
export async function supportsMp4(width = 1920, height = 1080) {
  try { return await canEncodeVideo('avc', { width, height, bitrate: bitrateFor(width, height) }); } catch { return false; }
}
export interface ExportOptions { width: number; height: number; signal: AbortSignal; progress: (done: number, total: number) => void }
export async function exportMovie(scene: StudioScene, project: StudioProject, options: ExportOptions): Promise<Blob> {
  const { width, height, signal, progress } = options;
  if (!await supportsMp4(width, height)) throw new Error('MP4 encoding is unavailable at this resolution. Try 720p in a current Chrome, Edge or Safari browser.');
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(scene.output, { codec: 'avc', bitrate: bitrateFor(width, height), keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: 30 });
  const old = { width: scene.output.width, height: scene.output.height };
  try {
    scene.resize(width, height); await scene.ready(); await scene.warmup(project);
    signal.throwIfAborted(); await output.start();
    const total = Math.round(durationOf(project) * 30);
    for (let frame = 0; frame < total; frame++) {
      signal.throwIfAborted(); scene.render(project, frame / 30);
      await source.add(frame / 30, 1 / 30);
      if (frame % 3 === 0 || frame === total - 1) { progress(frame + 1, total); await new Promise<void>((r) => setTimeout(r, 0)); }
    }
    source.close(); await output.finalize(); signal.throwIfAborted();
    if (!target.buffer) throw new Error('The encoder did not produce a video.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } catch (error) { await output.cancel().catch(() => {}); throw error; }
  finally { scene.resize(old.width, old.height); }
}
