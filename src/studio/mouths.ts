/**
 * Each speaking character's mouth, from their lines: worked out once per voiced line (its audio and words) and kept,
 * so preview and export show the same mouth. A line not voiced yet follows its words over its length meanwhile.
 */
import { getAsset } from './audio/assets';
import type { SpeechCue } from './audio/schema';
import { analyseSpeech, estimateMouth, mouthAt, MOUTH_SHAPES, type MouthTrack } from './lipsync';
import type { StudioProject } from './project';

const voiced = new Map<string, MouthTrack>(), working = new Map<string, Promise<void>>(), estimates = new Map<string, MouthTrack>();
const listeners = new Set<() => void>();
/** Calls `fn` when a line's mouth is ready, so a still frame can be drawn again with it. */
export function onMouthReady(fn: () => void) { listeners.add(fn);return () => listeners.delete(fn); }

const keyOf = (cue: SpeechCue) => `${cue.asset}|${cue.text}`;
async function analyse(cue: SpeechCue) {
  const asset = await getAsset(cue.asset!);
  if (!asset) throw Error('missing audio');
  const context = new OfflineAudioContext(1, 1, asset.sampleRate), buffer = await context.decodeAudioData(await asset.blob.arrayBuffer());
  let samples = buffer.getChannelData(0);
  if (buffer.numberOfChannels > 1) { const mixed = new Float32Array(samples.length), other = buffer.getChannelData(1);for (let i = 0; i < mixed.length; i++) mixed[i] = (samples[i] + other[i]) / 2;samples = mixed; }
  voiced.set(keyOf(cue), analyseSpeech(samples, buffer.sampleRate, cue.text));
}
function start(cue: SpeechCue): Promise<void> {
  const key = keyOf(cue);
  let job = working.get(key);
  if (!job) {
    job = analyse(cue).then(() => { for (const fn of listeners) fn(); }, () => { /* Without its audio the line keeps following its words. */ });
    working.set(key, job);
  }
  return job;
}
function trackFor(cue: SpeechCue): MouthTrack {
  if (cue.asset) {
    const ready = voiced.get(keyOf(cue));
    if (ready) return ready;
    void start(cue);
  }
  const key = `${cue.text}|${cue.duration.toFixed(2)}`;
  let estimate = estimates.get(key);
  if (!estimate) { estimate = estimateMouth(cue.text, cue.duration);estimates.set(key, estimate);if (estimates.size > 400) estimates.delete(estimates.keys().next().value!); }
  return estimate;
}

/** Waits until every voiced line in the project has its mouth worked out (before an export). */
export async function prepareMouths(project: StudioProject) {
  await Promise.all(project.audio.speech.filter((cue) => cue.asset).map((cue) => voiced.has(keyOf(cue)) ? undefined : start(cue)));
}

/**
 * The mouth of character `actor` at `time`, by shape name, or undefined when they have no lines in the project (their
 * mouth is then the animation's own, such as Talk's).
 */
export function speakingMouth(project: StudioProject, actor: string, time: number): Float32Array | undefined {
  let lines = false, speaking: SpeechCue | undefined;
  for (const cue of project.audio.speech) {
    if (cue.actor !== actor || !cue.text.trim() && !cue.asset) continue;
    lines = true;
    // One mouth says one line: where a character's lines overlap, the later one.
    if (time >= cue.start && time <= cue.start + cue.duration && (!speaking || cue.start >= speaking.start)) speaking = cue;
  }
  if (!lines) return undefined;
  return speaking ? mouthAt(trackFor(speaking), speaking.offset + (time - speaking.start) * speaking.speed) : new Float32Array(MOUTH_SHAPES.length);
}
