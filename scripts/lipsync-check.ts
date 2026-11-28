/**
 * Lip sync without a browser: synthetic speech (a buzz shaped into vowels, with gaps where lips close) is read for its
 * vowels, closures and pauses; the mouth never opens past its limit; a line not voiced yet follows its words; and a
 * character's mouth follows their own lines only, the later one where two overlap.
 *   npx tsx scripts/lipsync-check.ts
 */
import assert from 'node:assert/strict';
import { analyseSpeech, estimateMouth, mouthAt, MOUTH_SHAPES } from '../src/studio/lipsync';
import { speakingMouth } from '../src/studio/mouths';
import type { StudioProject } from '../src/studio/project';

const rate = 24000, at = (name: string) => MOUTH_SHAPES.indexOf(name as never);
/** A voice-like buzz (120 Hz) through three resonances: a vowel. */
function vowel(f1: number, f2: number, f3: number, seconds: number, loudness = 0.3) {
  const n = Math.round(seconds * rate), out = new Float32Array(n);
  const res = [[f1, 80], [f2, 100], [f3, 150]].map(([f, bw]) => { const r = Math.exp(-Math.PI * bw / rate);return { c: 2 * r * Math.cos(2 * Math.PI * f / rate), r2: -r * r, y1: 0, y2: 0 }; });
  for (let i = 0; i < n; i++) {
    let x = i % 200 === 0 ? 1 : 0;
    for (const z of res) { const y = x + z.c * z.y1 + z.r2 * z.y2;z.y2 = z.y1;z.y1 = y;x = y; }
    out[i] = x * Math.min(1, i / (0.02 * rate), (n - i) / (0.02 * rate));
  }
  let peak = 0;for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < n; i++) out[i] *= loudness / peak;
  return out;
}
const gap = (seconds: number) => new Float32Array(Math.round(seconds * rate));
const join = (parts: Float32Array[]) => { const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));let o = 0;for (const p of parts) { out.set(p, o);o += p.length; }return out; };
const AH = [750, 1200, 2500], EE = [300, 2300, 3000], OO = [320, 850, 2400];
const lead = 0.035, mouth = (track: ReturnType<typeof analyseSpeech>, t: number) => mouthAt(track, t - lead);
const top = (m: Float32Array) => MOUTH_SHAPES[[...m].slice(0, 14).reduce((best, w, k, all) => (w > all[best] ? k : best), 0)];
const opening = (m: Float32Array) => ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U', 'viseme_kk', 'viseme_DD', 'viseme_nn', 'viseme_TH', 'jawOpen'].reduce((s, k) => s + m[at(k)], 0);

// "pa bee boo": ah, ee and oo heard, the lips shut in the gaps for b, and still before and after.
const line = join([gap(0.2), vowel(AH[0], AH[1], AH[2], 0.3), gap(0.08), vowel(EE[0], EE[1], EE[2], 0.3), gap(0.08), vowel(OO[0], OO[1], OO[2], 0.3), gap(0.3)]);
const track = analyseSpeech(line, rate, 'pa bee boo');
assert.equal(top(mouth(track, 0.35)), 'viseme_aa', 'ah is heard as ah');
assert.equal(top(mouth(track, 0.73)), 'viseme_I', 'ee is heard as ee');
assert.equal(top(mouth(track, 1.11)), 'viseme_U', 'oo is heard as oo');
for (const t of [0.54, 0.92]) assert.ok(mouth(track, t)[at('viseme_PP')] > 0.9 && opening(mouth(track, t)) < 0.1, `the lips shut for b at ${t}s`);
for (const t of [0.05, 1.4]) assert.ok(opening(mouth(track, t)) < 0.02, `the mouth is still at ${t}s, before and after`);
assert.ok(0.85 * mouth(track, 0.35)[at('viseme_aa')] + mouth(track, 0.35)[at('jawOpen')] > 0.45, 'the mouth opens wide for ah');
assert.ok(mouth(track, 0.73)[at('jawOpen')] > 0.05, 'the jaw drops a little for ee too');
console.log('OK vowels, lip closures and stillness read from the audio');

// A pause in the words lands on the silence in the audio: nothing opens the mouth in it.
const paused = analyseSpeech(join([gap(0.2), vowel(AH[0], AH[1], AH[2], 0.25), gap(0.06), vowel(AH[0], AH[1], AH[2], 0.25), gap(0.8), vowel(EE[0], EE[1], EE[2], 0.25), gap(0.06), vowel(EE[0], EE[1], EE[2], 0.25), gap(0.2)]), rate, 'Lay down, see these.');
for (let t = 0.85; t < 1.5; t += 0.05) assert.ok(opening(mouth(paused, t)) < 0.03, `nothing opens the mouth in the pause at ${t.toFixed(2)}s`);
assert.ok(opening(mouth(paused, 1.65)) > 0.15, 'speech after the pause opens the mouth');
console.log('OK the words\' pauses land on the audio\'s silences');

// However loud, the mouth opens only so far.
const shout = analyseSpeech(join([gap(0.1), vowel(850, 1300, 2600, 0.6, 0.95), gap(0.1)]), rate, 'Ah!');
const SHARE: Record<string, number> = { viseme_TH: 0.25, viseme_DD: 0.28, viseme_kk: 0.38, viseme_nn: 0.22, viseme_RR: 0.15, viseme_aa: 0.85, viseme_E: 0.35, viseme_I: 0.15, viseme_O: 0.45, viseme_U: 0.08, viseme_FF: 0.05, viseme_CH: 0.08, jawOpen: 1 };
for (let t = 0; t < 0.8; t += 0.02) { const m = mouthAt(shout, t);const total = Object.entries(SHARE).reduce((s, [k, w]) => s + w * m[at(k)], 0);assert.ok(total <= 0.601, `the mouth opens at most 0.6 at ${t.toFixed(2)}s (${total.toFixed(2)})`); }
console.log('OK a loud vowel opens the mouth only so far');

// Before a line is voiced, its words are spread over its length.
const estimate = estimateMouth('Pop music.', 1.5);
assert.ok(Array.from({ length: 30 }, (_, i) => mouthAt(estimate, i * 0.05)[at('viseme_PP')]).some((w) => w > 0.8), 'p and m close the lips');
assert.ok(Array.from({ length: 30 }, (_, i) => opening(mouthAt(estimate, i * 0.05))).some((w) => w > 0.2), 'its vowels open the mouth');
assert.ok(opening(mouthAt(estimate, 1.7)) === 0, 'still after the line');
console.log('OK a line not voiced yet follows its words');

// A character's mouth follows their own lines; the later of two overlapping lines; others' mouths are their own.
const cue = (id: string, actor: string, text: string, start: number, duration: number) => ({ source: 'tts', id, name: id, actor, text, voice: 'M1', start, duration, offset: 0, speed: 1, volume: 1, pan: 0, effect: 'natural' });
const project = { audio: { speech: [cue('a', 'one', 'Aaah aaah aaah aaah.', 0, 3), cue('b', 'one', 'Moo moo moo moo moo moo.', 2, 3)], effects: [], music: { track: 'none' }, muted: false } } as unknown as StudioProject;
assert.equal(speakingMouth(project, 'two', 1), undefined, 'a character without lines keeps the animation\'s mouth');
assert.ok(speakingMouth(project, 'one', 6)!.every((w) => w === 0), 'between lines the mouth rests');
const overlap = speakingMouth(project, 'one', 2.4)!, later = mouthAt(estimateMouth('Moo moo moo moo moo moo.', 3), 0.4);
assert.deepEqual([...overlap], [...later], 'where lines overlap, the later line speaks');
console.log('OK each character speaks their own lines, one at a time');
console.log('Lip sync checks passed.');
