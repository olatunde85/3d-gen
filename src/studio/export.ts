/** Deterministic, bounded video encoding. A slow render still creates an exact 30 fps movie. */
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, AudioBufferSource, canEncodeAudio, canEncodeVideo } from 'mediabunny';
import { hasAudio } from './audio/schema';
import { renderSoundtrack } from './audio/mix';
import type { StudioScene } from './scene';
import { durationOf, type StudioProject } from './project';
import { fadeLevel, filmDuration, sceneStarts } from './film';

const bitrateFor = (width: number, height: number) => Math.max(width, height) >= 1920 ? 8_000_000 : 4_500_000;
export async function supportsMp4(width = 1920, height = 1080) {
  try { return await canEncodeVideo('avc', { width, height, bitrate: bitrateFor(width, height) }); } catch { return false; }
}
export async function audioCodec(){for(const codec of ['aac','opus']as const)if(new Mp4OutputFormat().getSupportedAudioCodecs().includes(codec)&&await canEncodeAudio(codec,{sampleRate:48000,numberOfChannels:2,bitrate:128000}))return codec;return undefined;}
export interface ExportOptions { width: number; height: number; signal: AbortSignal; progress: (done: number, total: number) => void; bitrate?:number;
  /** Before each scene of a film after the first: put that scene's cast on the stage. */
  prepare?: (index: number) => Promise<void> }
/** Every scene's soundtrack, one after another, silent where a scene has no sound. */
async function filmSoundtrack(scenes: StudioProject[], signal: AbortSignal): Promise<AudioBuffer | undefined> {
  if (!scenes.some(s => hasAudio(s.audio))) return;
  const mixes: (AudioBuffer | undefined)[] = [];
  for (const s of scenes) mixes.push(hasAudio(s.audio) ? await renderSoundtrack(s, signal) : undefined);
  if (scenes.length === 1) return mixes[0];
  const rate = 48000, starts = sceneStarts(scenes), length = Math.ceil(filmDuration(scenes) * rate);
  const out = new AudioBuffer({ length, numberOfChannels: 2, sampleRate: rate });
  mixes.forEach((mix, i) => {
    if (!mix) return;
    const at = Math.round(starts[i] * rate), end = Math.min(length, at + Math.round(durationOf(scenes[i]) * rate));
    for (let c = 0; c < 2; c++) out.getChannelData(c).set(mix.getChannelData(Math.min(c, mix.numberOfChannels - 1)).subarray(0, end - at), at);
  });
  return out;
}
export const exportMovie = (scene: StudioScene, project: StudioProject, options: ExportOptions) => exportFilm(scene, [project], options);
/** A film of one or more scenes as one MP4, at exactly 30 frames a second. */
export async function exportFilm(scene: StudioScene, scenes: StudioProject[], options: ExportOptions): Promise<Blob> {
  const { width, height, signal, progress } = options;
  if (!await supportsMp4(width, height)) throw new Error('MP4 encoding is unavailable at this resolution. Try 720p in a current Chrome, Edge or Safari browser.');
  const sound = scenes.some(s => hasAudio(s.audio)), codec = sound ? await audioCodec() : undefined;
  if (sound && !codec) throw Error('This browser cannot encode the film audio. Save the soundtrack as WAV or export in a current Chrome/Edge/Safari browser.');
  const mix = sound ? await filmSoundtrack(scenes, signal) : undefined;
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const source = new CanvasSource(scene.output, { codec: 'avc', bitrate: options.bitrate??bitrateFor(width, height), keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: 30 });
  const audio=codec?new AudioBufferSource({codec,bitrate:128000}):undefined;if(audio)output.addAudioTrack(audio);
  const old = { width: scene.output.width, height: scene.output.height };
  try {
    scene.resize(width, height);
    signal.throwIfAborted(); await output.start();if(audio&&mix){await audio.add(mix);audio.close();}
    const counts = scenes.map(s => Math.round(durationOf(s) * 30)), total = counts.reduce((a, b) => a + b, 0);
    let done = 0;
    for (const [index, project] of scenes.entries()) {
      if (index > 0) await options.prepare?.(index);
      signal.throwIfAborted(); await scene.ready(); scene.titleCard = index === 0; await scene.warmup(project);
      for (let frame = 0; frame < counts[index]; frame++, done++) {
        signal.throwIfAborted(); scene.darkness = fadeLevel(scenes, index, frame / 30); scene.render(project, frame / 30);
        await source.add(done / 30, 1 / 30);
        if (done % 3 === 0 || done === total - 1) { progress(done + 1, total); await new Promise<void>((r) => setTimeout(r, 0)); }
      }
    }
    source.close(); await output.finalize(); signal.throwIfAborted();
    if (!target.buffer) throw new Error('The encoder did not produce a video.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } catch (error) { await output.cancel().catch(() => {}); throw error; }
  finally { scene.resize(old.width, old.height); scene.titleCard = true; scene.darkness = 0; }
}
