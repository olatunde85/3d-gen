/**
 * Lip sync: mouth shapes worked out from a spoken line, its audio and its words. Node-safe (no browser APIs).
 *
 * The audio gives the timing and the vowels: loudness opens the jaw and closes it in pauses, and the vowel's resonances
 * (its first two formants, from a linear-prediction envelope) say whether the lips are open (ah), wide (eh, ee) or
 * round (oh, oo). The words give what the audio can't: where the lips close (p, b, m), touch the teeth (f, v), push out
 * (sh, ch, j) or let the tongue show (th). Their vowels are matched to the audio's syllables, so each consonant lands
 * between the syllables it sits between in the words. Without audio (a line not voiced yet), the words are laid
 * evenly over the line's length.
 */

/**
 * The face shapes lip sync drives: the speech mouth shapes (Oculus/Meta viseme names, as in the face) and the jaw, which
 * drops further the louder and more open the vowel. The jaw is added to the face's own; the mouth shapes replace it.
 */
export const MOUTH_SHAPES = ['viseme_PP', 'viseme_FF', 'viseme_TH', 'viseme_DD', 'viseme_kk', 'viseme_CH', 'viseme_SS', 'viseme_nn', 'viseme_RR', 'viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U', 'jawOpen'] as const;
export type MouthShape = typeof MOUTH_SHAPES[number];
const S = Object.fromEntries(MOUTH_SHAPES.map((name, i) => [name.replace('viseme_', ''), i])) as Record<string, number>;
const K = MOUTH_SHAPES.length, VOWELS = ['aa', 'E', 'I', 'O', 'U'] as const;
type Vowel = typeof VOWELS[number];
/** How far each shape opens the mouth (its share of the face's 'mouth-open'), and the most speech opens it. */
const OPENS: Record<string, number> = { TH: 0.25, DD: 0.28, kk: 0.38, nn: 0.22, RR: 0.15, aa: 0.85, E: 0.35, I: 0.15, O: 0.45, U: 0.08, FF: 0.05, CH: 0.08, jawOpen: 1 };
const MOST_OPEN = 0.6;
/** How far each vowel drops the jaw. */
const JAW: Record<Vowel, number> = { aa: 1, E: 0.6, I: 0.3, O: 0.65, U: 0.25 };

/** Mouth shape weights through a line: `rate` frames a second, MOUTH_SHAPES.length values a frame. */
export interface MouthTrack { rate: number; frames: number; data: Float32Array }
const RATE = 100;
/** The lips move a little ahead of the sound they make. */
const LEAD = 0.035;

/** The mouth `t` seconds into the line (0 outside it). */
export function mouthAt(track: MouthTrack, t: number): Float32Array {
  const out = new Float32Array(K), x = (t + LEAD) * track.rate, i = Math.floor(x), f = x - i;
  if (i < 0 || i >= track.frames) return out;
  const j = Math.min(track.frames - 1, i + 1);
  for (let k = 0; k < K; k++) out[k] = track.data[i * K + k] * (1 - f) + track.data[j * K + k] * f;
  return out;
}

// ——— The words ———

interface Sound { shape: string; vowel: boolean; length: number; weight: number; pause?: number }
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const DIGRAPHS: [string, [string, boolean, number][]][] = [
  ['tch', [['CH', false, 0.07]]], ['th', [['TH', false, 0.07]]], ['sh', [['CH', false, 0.08]]], ['ch', [['CH', false, 0.08]]], ['ph', [['FF', false, 0.07]]],
  ['wh', [['U', false, 0.05]]], ['ck', [['kk', false, 0.06]]], ['ng', [['nn', false, 0.06]]], ['qu', [['kk', false, 0.05], ['U', false, 0.04]]], ['gh', []],
  ['ee', [['I', true, 0.12]]], ['ea', [['I', true, 0.12]]], ['oo', [['U', true, 0.12]]], ['ou', [['aa', true, 0.08], ['U', true, 0.06]]], ['ow', [['aa', true, 0.08], ['U', true, 0.06]]],
  ['oi', [['O', true, 0.08], ['I', true, 0.06]]], ['oy', [['O', true, 0.08], ['I', true, 0.06]]], ['ai', [['E', true, 0.09], ['I', true, 0.05]]], ['ay', [['E', true, 0.09], ['I', true, 0.05]]],
  ['ei', [['E', true, 0.09], ['I', true, 0.05]]], ['ey', [['E', true, 0.09], ['I', true, 0.05]]], ['au', [['O', true, 0.12]]], ['aw', [['O', true, 0.12]]], ['ie', [['I', true, 0.11]]],
  ['oa', [['O', true, 0.12]]], ['ue', [['U', true, 0.11]]], ['ew', [['U', true, 0.11]]], ['ui', [['U', true, 0.1]]],
];
const LETTER: Record<string, [string, boolean, number][]> = {
  a: [['aa', true, 0.11]], e: [['E', true, 0.09]], i: [['I', true, 0.09]], o: [['O', true, 0.11]], u: [['aa', true, 0.08]], y: [['I', true, 0.08]],
  p: [['PP', false, 0.07]], b: [['PP', false, 0.06]], m: [['PP', false, 0.07]], f: [['FF', false, 0.08]], v: [['FF', false, 0.06]],
  s: [['SS', false, 0.08]], z: [['SS', false, 0.07]], t: [['DD', false, 0.05]], d: [['DD', false, 0.05]], n: [['nn', false, 0.06]], l: [['DD', false, 0.06]],
  r: [['RR', false, 0.06]], k: [['kk', false, 0.06]], g: [['kk', false, 0.06]], q: [['kk', false, 0.06]], j: [['CH', false, 0.07]], w: [['U', false, 0.05]],
  x: [['kk', false, 0.05], ['SS', false, 0.06]], h: [],
};
const isVowel = (c: string) => 'aeiouy'.includes(c);

/** A word's sounds, near enough for the mouth: letters and common letter pairs, a silent final e left out. */
function wordSounds(word: string): Sound[] {
  const out: Sound[] = [];
  const w = word.length > 2 && word.endsWith('e') && !isVowel(word[word.length - 2]) && word.slice(0, -2).split('').some(isVowel) ? word.slice(0, -1) : word;
  for (let i = 0; i < w.length;) {
    if (i > 0 && w[i] === w[i - 1] && !isVowel(w[i])) { i++; continue; }
    const pair = DIGRAPHS.find(([d]) => w.startsWith(d, i));
    let parts: [string, boolean, number][];
    if (pair) { parts = pair[1];i += pair[0].length; }
    else {
      const c = w[i];
      // c before e, i or y is an s; y starting a word is a glide; u before a consonant and a final e is "oo".
      if (c === 'c') parts = 'eiy'.includes(w[i + 1] ?? '') ? LETTER.s : LETTER.k;
      else if (c === 'y' && i === 0 && isVowel(w[1] ?? '')) parts = [['I', false, 0.04]];
      else if (c === 'u' && i + 2 === w.length - 1 && word.endsWith('e')) parts = [['U', true, 0.11]];
      else parts = LETTER[c] ?? [];
      i++;
    }
    // The tongue between the teeth (th) shows only a little.
    for (const [shape, vowel, length] of parts) out.push({ shape, vowel, length, weight: vowel || shape === 'PP' ? 1 : shape === 'TH' ? 0.55 : 0.85 });
  }
  return out;
}

/** A line's sounds in order, with pauses where the punctuation pauses. */
export function lineSounds(text: string): Sound[] {
  const out: Sound[] = [];
  const tokens = text.toLowerCase().replace(/\d/g, (d) => ` ${DIGITS[+d]} `).match(/[a-z']+|[.!?;:]+|,/g) ?? [];
  for (const token of tokens) {
    if (/^[.!?;:]+$/.test(token)) { out.push({ shape: '', vowel: false, length: 0.35, weight: 0, pause: 0.35 });continue; }
    if (token === ',') { out.push({ shape: '', vowel: false, length: 0.2, weight: 0, pause: 0.2 });continue; }
    out.push(...wordSounds(token.replace(/'/g, '')));
  }
  return out;
}

// ——— The audio ———

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;for (; j & bit; bit >>= 1) j ^= bit;j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]];[im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr;im[q] = im[p] - ti;re[p] += tr;im[p] += ti;
        const nr = cr * wr - ci * wi;ci = cr * wi + ci * wr;cr = nr;
      }
    }
  }
}

/** Linear-prediction coefficients from autocorrelation (Levinson–Durbin). */
function lpc(r: Float64Array, order: number): Float64Array {
  const a = new Float64Array(order + 1);a[0] = 1;
  let e = r[0] || 1e-12;
  for (let i = 1; i <= order; i++) {
    let acc = r[i];for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / e, prev = a.slice();
    for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
    a[i] = k;e *= 1 - k * k;if (e <= 1e-12) break;
  }
  return a;
}

interface Frames { db: Float64Array; voiced: Float64Array; hiss: Float64Array; f1: Float64Array; f2: Float64Array; n: number }

/** Loudness, voicing, hiss and the first two formants, every 10 ms. */
function measure(samples: Float32Array, sampleRate: number): Frames {
  const size = 2 ** Math.round(Math.log2(0.023 * sampleRate)), hop = sampleRate / RATE, n = Math.max(1, Math.floor(samples.length / hop));
  const out: Frames = { db: new Float64Array(n), voiced: new Float64Array(n), hiss: new Float64Array(n), f1: new Float64Array(n), f2: new Float64Array(n), n };
  const re = new Float64Array(size), im = new Float64Array(size), hann = Float64Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size));
  const bin = (hz: number) => Math.min(size / 2, Math.round(hz / sampleRate * size));
  const top = bin(5000), env = 120, order = 10, r = new Float64Array(order + 1), power = new Float64Array(size / 2 + 1);
  // Cosines and sines used every frame: the autocorrelation's (bin by lag) and the envelope's (point by coefficient).
  const lagCos = Float64Array.from({ length: (top + 1) * (order + 1) }, (_, x) => Math.cos(Math.PI * Math.floor(x / (order + 1)) / top * (x % (order + 1))));
  const emphasis = Float64Array.from({ length: top + 1 }, (_, k) => (1.9025 - 1.9 * Math.cos(2 * Math.PI * k / size)) * (k === 0 || k === top ? 0.5 : 1));
  const envCos = Float64Array.from({ length: (env + 1) * (order + 1) }, (_, x) => Math.cos(Math.PI * Math.floor(x / (order + 1)) / env * (x % (order + 1))));
  const envSin = Float64Array.from({ length: (env + 1) * (order + 1) }, (_, x) => Math.sin(Math.PI * Math.floor(x / (order + 1)) / env * (x % (order + 1))));
  for (let f = 0; f < n; f++) {
    const centre = Math.round(f * hop), start = centre - size / 2;
    for (let i = 0; i < size; i++) { const s = samples[start + i] ?? 0;re[i] = s * hann[i];im[i] = 0; }
    fft(re, im);
    let total = 0, low = 0, high = 0;
    for (let k = 0; k <= size / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k], hz = k * sampleRate / size;power[k] = p;
      if (hz >= 80 && hz <= 8000) total += p;
      if (hz >= 80 && hz < 1000) low += p;
      if (hz >= 3500 && hz <= 9000) high += p;
    }
    out.db[f] = 10 * Math.log10(total / size + 1e-12);
    out.voiced[f] = low / (low + high + 1e-12);
    out.hiss[f] = high / (total + 1e-12);
    // Formants: the envelope of the pre-emphasised spectrum up to 5 kHz, from its autocorrelation.
    r.fill(0);
    for (let k = 0; k <= top; k++) {
      const p = power[k] * emphasis[k], row = k * (order + 1);
      for (let j = 0; j <= order; j++) r[j] += p * lagCos[row + j];
    }
    r[0] *= 1.0001;
    const a = lpc(r, order), peaks: number[] = [];
    let before = 0, here = 0;
    for (let i = 0; i <= env; i++) {
      const row = i * (order + 1);let ar = 0, ai = 0;
      for (let j = 0; j <= order; j++) { ar += a[j] * envCos[row + j];ai -= a[j] * envSin[row + j]; }
      const g = 1 / (ar * ar + ai * ai + 1e-12);
      if (i >= 2 && here > before && here > g) peaks.push((i - 1) / env * 5000);
      before = here;here = g;
    }
    const first = peaks.find((hz) => hz >= 200 && hz <= 1100) ?? 0, second = peaks.find((hz) => hz > first + 250 && hz >= 650 && hz <= 3200);
    out.f1[f] = first;
    // Back vowels' formants run together into one peak: no second peak means a low one.
    out.f2[f] = second ?? (first ? first + 350 : 0);
  }
  return out;
}

const percentile = (values: ArrayLike<number>, p: number) => { const s = Array.from(values).sort((a, b) => a - b);return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a)));return t * t * (3 - 2 * t); };
/** Where each vowel sits among a speaker's vowels: [first formant, second formant], as z-scores of the log frequencies. */
const VOWEL_AT: Record<Vowel, [number, number]> = { aa: [1.35, -0.15], E: [0.35, 0.85], I: [-1.15, 1.35], O: [0.35, -1.15], U: [-1.1, -1.1] };

/** Zero-phase smoothing: a one-pole filter run forwards and back. */
function smooth(values: Float64Array, seconds: number) {
  const a = Math.exp(-1 / (seconds * RATE));
  for (let i = 1; i < values.length; i++) values[i] = a * values[i - 1] + (1 - a) * values[i];
  for (let i = values.length - 2; i >= 0; i--) values[i] = a * values[i + 1] + (1 - a) * values[i];
}

interface Timed extends Sound { at: number }

/**
 * Places the words' sounds in the audio: the line's pauses on its longest silences, its vowels on the syllables (the
 * loudness peaks), consonants between the vowels either side of them.
 */
function align(sounds: Sound[], open: Float64Array, active: boolean[]): Timed[] {
  const n = open.length;
  // Syllables: loudness peaks at least 90 ms apart that stand out from the dip before them.
  const peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (!active[i] || open[i] < 0.25 || open[i] < open[i - 1] || open[i] < open[i + 1]) continue;
    let dip = open[i];for (let j = i - 1; j >= Math.max(0, i - 25); j--) dip = Math.min(dip, open[j]);
    if (open[i] - dip < 0.08 && peaks.length) continue;
    if (peaks.length && i - peaks[peaks.length - 1] < 9) { if (open[i] > open[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;continue; }
    peaks.push(i);
  }
  // Speech time: the audio with its silences taken out, and the words with their pauses taken out.
  const cumulative = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cumulative[i + 1] = cumulative[i] + (active[i] ? 1 : 0);
  const spoken = cumulative[n] || 1, wordsLength = sounds.reduce((s, x) => s + (x.pause ? 0 : x.length), 0) || 1;
  /** The frame from `lo` to `hi` by which `count` frames of speech have been heard. */
  const frameAt = (count: number, lo: number, hi: number) => { while (lo < hi) { const mid = (lo + hi) >> 1;if (cumulative[mid + 1] < count) lo = mid + 1;else hi = mid; }return lo; };
  // The words' pauses go on the audio's silences (120 ms or more, inside the speech), the nearest in order.
  const silences: { from: number; to: number; at: number }[] = [];
  for (let i = 0; i < n;) {
    if (active[i]) { i++;continue; }
    let j = i;while (j < n && !active[j]) j++;
    if (i > 0 && j < n && j - i >= 12) silences.push({ from: i, to: j, at: cumulative[i] / spoken });
    i = j;
  }
  const anchors: { words: number; from: number; to: number }[] = [{ words: 0, from: 0, to: 0 }];
  let into = 0, used = 0;
  for (const s of sounds) {
    if (!s.pause) { into += s.length;continue; }
    const at = into / wordsLength;let best = -1;
    for (let k = used; k < silences.length; k++) if (Math.abs(silences[k].at - at) < 0.3 && (best < 0 || Math.abs(silences[k].at - at) < Math.abs(silences[best].at - at))) best = k;
    if (best >= 0 && at > anchors[anchors.length - 1].words) { anchors.push({ words: at, from: silences[best].from, to: silences[best].to });used = best + 1; }
  }
  anchors.push({ words: 1, from: n, to: n });
  // Between two anchors the words are spread evenly over the speech; each sound keeps the stretch it falls in.
  const locate = (fraction: number) => {
    let k = 0;while (k < anchors.length - 2 && fraction >= anchors[k + 1].words) k++;
    const a = anchors[k], b = anchors[k + 1], f = (fraction - a.words) / ((b.words - a.words) || 1);
    const lo = a.to, hi = Math.max(lo, b.from - 1);
    return { at: frameAt(cumulative[lo] + f * (cumulative[b.from] - cumulative[lo]), lo, hi), lo, hi };
  };
  into = 0;
  const stretch: { lo: number; hi: number }[] = [];
  const timed: Timed[] = sounds.map((s) => { const mid = into + (s.pause ? 0 : s.length / 2);if (!s.pause) into += s.length;const p = locate(mid / wordsLength);stretch.push(p);return { ...s, at: p.at }; });
  // Each vowel takes the nearest syllable within 150 ms in its stretch, after the last vowel's, keeping their order.
  let next = 0;
  timed.forEach((v, i) => {
    if (!v.vowel) return;
    let best = -1, distance = 15;
    for (let p = next; p < peaks.length; p++) { if (peaks[p] < stretch[i].lo || peaks[p] > stretch[i].hi) continue;const d = Math.abs(peaks[p] - v.at);if (d < distance) { distance = d;best = p; } if (peaks[p] > v.at + 15) break; }
    if (best >= 0) { v.at = peaks[best];next = best + 1; }
  });
  // A consonant sits between the vowels either side, where the words put it; lips closing land on the quietest frame.
  for (let i = 0; i < timed.length; i++) {
    const s = timed[i];if (s.vowel || s.pause) continue;
    let before = i - 1;while (before >= 0 && !timed[before].vowel && !timed[before].pause) before--;
    let after = i + 1;while (after < timed.length && !timed[after].vowel && !timed[after].pause) after++;
    const a = before >= 0 ? timed[before].at : Math.max(0, s.at - 12), b = after < timed.length ? timed[after].at : Math.min(n - 1, s.at + 12);
    if (b > a) {
      const ids = timed.slice(before + 1, after), share = ids.reduce((sum, x) => sum + x.length, 0), ahead = timed.slice(before + 1, i).reduce((sum, x) => sum + x.length, 0) + s.length / 2;
      s.at = Math.round(a + (b - a) * (ahead / (share || 1)));
      if (s.shape === 'PP' || s.shape === 'FF') {
        let quiet = s.at;for (let j = Math.max(a + 1, s.at - 6); j <= Math.min(b - 1, s.at + 6); j++) if (open[j] < open[quiet]) quiet = j;
        s.at = quiet;
      }
    }
  }

  return timed;
}

/** Adds a sound's shape around its moment: easing in and out over about its length. */
function place(data: Float64Array[], s: Timed, scale: number) {
  const half = Math.max(4, Math.round(s.length * RATE * 0.75)), n = data[0].length, k = S[s.shape];
  if (k === undefined) return;
  for (let i = Math.max(0, s.at - half); i <= Math.min(n - 1, s.at + half); i++) {
    const x = 1 - Math.abs(i - s.at) / (half + 1), w = s.weight * scale * x * x * (3 - 2 * x);
    data[k][i] = Math.max(data[k][i], w);
  }
}

function finish(data: Float64Array[], frames: number): MouthTrack {
  const out = new Float32Array(frames * K);
  for (let i = 0; i < frames; i++) {
    // The lips shut for p, b and m and meet the teeth for f and v: whatever else is open closes for them.
    const shut = Math.max(data[S.PP][i], 0.7 * data[S.FF][i], 0.35 * data[S.CH][i]);
    let openSum = 0;
    for (const v of VOWELS) openSum += data[S[v]][i];
    const room = Math.min(1, 1 / Math.max(1, openSum));
    for (let k = 0; k < K; k++) {
      let w = data[k][i];
      if (VOWELS.includes(MOUTH_SHAPES[k].slice(7) as Vowel)) w *= room * (1 - shut);
      else if (k === S.jawOpen) w *= 1 - shut;
      else if (k !== S.PP && k !== S.FF) w *= 1 - 0.6 * data[S.PP][i];
      out[i * K + k] = Math.max(0, Math.min(1, w));
    }
    // Loud syllables open the mouth only so far: past that the jaw gives way first, then the shapes.
    let opens = 0;
    for (const [name, share] of Object.entries(OPENS)) opens += share * out[i * K + S[name]];
    if (opens > MOST_OPEN) {
      const jaw = out[i * K + S.jawOpen], over = opens - MOST_OPEN, cut = Math.min(jaw, over);
      out[i * K + S.jawOpen] = jaw - cut;
      if (over > cut) { const scale = MOST_OPEN / (opens - cut);for (const name of Object.keys(OPENS)) if (name !== 'jawOpen') out[i * K + S[name]] *= scale; }
    }
  }
  return { rate: RATE, frames, data: out };
}

/** The mouth through a voiced line, from its audio and (when known) its words. */
export function analyseSpeech(samples: Float32Array, sampleRate: number, text = ''): MouthTrack {
  const m = measure(samples, sampleRate), n = m.n;
  const loud = percentile(m.db, 0.95), floor = loud - 34;
  const open = new Float64Array(n), active: boolean[] = [];
  for (let i = 0; i < n; i++) open[i] = smoothstep(floor + 4, loud - 4, m.db[i]);
  smooth(open, 0.018);
  for (let i = 0; i < n; i++) active.push(m.db[i] > floor + 2);
  // Gaps shorter than 80 ms are part of the speech (stops inside words), not pauses.
  for (let i = 0; i < n;) {
    if (active[i]) { i++;continue; }
    let j = i;while (j < n && !active[j]) j++;
    if (i > 0 && j < n && j - i < 8) for (let x = i; x < j; x++) active[x] = true;
    i = j;
  }
  // Where this speaker's vowels sit: z-scores of log formants over the clearly voiced frames.
  const voicedFrames: number[] = [];
  for (let i = 0; i < n; i++) if (open[i] > 0.4 && m.voiced[i] > 0.75 && m.f1[i] > 0) voicedFrames.push(i);
  const stats = (values: number[]) => { const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);return [mean, Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length || 1)) || 1]; };
  const [m1, s1] = stats(voicedFrames.map((i) => Math.log(m.f1[i]))), [m2, s2] = stats(voicedFrames.map((i) => Math.log(m.f2[i])));
  const data = MOUTH_SHAPES.map(() => new Float64Array(n));
  const sounds = text.trim() ? lineSounds(text) : [], timed = sounds.length ? align(sounds, open, active) : [];
  // The words' vowels, spread round their syllables, steer the audio's guess at the vowel.
  const spoken = VOWELS.map(() => new Float64Array(n));
  for (const s of timed) if (s.vowel) { const v = VOWELS.indexOf(s.shape as Vowel);for (let i = Math.max(0, s.at - 10); i <= Math.min(n - 1, s.at + 10); i++) spoken[v][i] = Math.max(spoken[v][i], 1 - Math.abs(i - s.at) / 11); }
  for (let i = 0; i < n; i++) {
    if (open[i] <= 0) continue;
    const heard = new Float64Array(5);
    if (m.f1[i] > 0 && m.voiced[i] > 0.5) {
      const z1 = (Math.log(m.f1[i]) - m1) / s1, z2 = (Math.log(m.f2[i]) - m2) / s2;let sum = 0;
      VOWELS.forEach((v, k) => { const [a, b] = VOWEL_AT[v];heard[k] = Math.exp(-((z1 - a) ** 2 + (z2 - b) ** 2) / 1.3);sum += heard[k]; });
      for (let k = 0; k < 5; k++) heard[k] /= sum || 1;
    } else heard[1] = 1;
    let said = 0;for (let k = 0; k < 5; k++) said = Math.max(said, spoken[k][i]);
    const mix = said > 0 ? 0.55 * said : 0;let total = 0;const blend = new Float64Array(5);
    // Squared, so the clearest vowel leads rather than a blur of all five.
    for (let k = 0; k < 5; k++) { blend[k] = (heard[k] * (1 - mix) + (spoken[k][i] / (said || 1)) * mix) ** 2;total += blend[k]; }
    // Louder is wider open; quiet voiced speech keeps the lips just apart.
    const amount = 1.2 * open[i] * Math.min(1, 0.45 + 0.55 * m.voiced[i]);
    let jaw = 0;
    for (let k = 0; k < 5; k++) { data[S[VOWELS[k]]][i] = amount * blend[k] / (total || 1);jaw += JAW[VOWELS[k]] * blend[k] / (total || 1); }
    data[S.jawOpen][i] = open[i] * Math.min(1, 0.45 + 0.55 * m.voiced[i]) * (0.1 + 0.34 * jaw);
    data[S.nn][i] = 0.25 * open[i] * (1 - open[i]);
    // Hiss (s, z, sh) with no voice behind it shows teeth.
    if (m.hiss[i] > 0.35 && m.voiced[i] < 0.6) data[S.SS][i] = Math.min(0.75, (m.hiss[i] - 0.35) * 2.5) * smoothstep(floor, loud - 15, m.db[i]);
  }
  for (const v of VOWELS) smooth(data[S[v]], 0.02);
  smooth(data[S.jawOpen], 0.025);
  // A consonant that would open the mouth shows only where there's speech to hear; closing the lips is right anywhere.
  for (const s of timed) if (!s.vowel && !s.pause && (s.shape === 'PP' || s.shape === 'FF' || active[s.at])) place(data, s, s.shape === 'PP' ? 1 : 0.85);
  return finish(data, n);
}

/** The mouth through a line not voiced yet: its words spread over `seconds`. */
export function estimateMouth(text: string, seconds: number): MouthTrack {
  const n = Math.max(1, Math.round(seconds * RATE)), sounds = lineSounds(text), data = MOUTH_SHAPES.map(() => new Float64Array(n));
  const total = sounds.reduce((s, x) => s + x.length, 0) || 1, scale = Math.max(0, seconds - 0.15) / total;
  let into = 0.05;
  for (const s of sounds) {
    const at = Math.round((into + s.length * scale / 2) * RATE);into += s.length * scale;
    if (s.pause || !s.shape) continue;
    place(data, { ...s, at, length: s.length * scale }, s.vowel ? 0.7 : 0.85);
    if (s.vowel) place(data, { ...s, shape: 'jawOpen', at, length: s.length * scale }, 0.35 * JAW[s.shape as Vowel]);
  }
  for (const v of VOWELS) smooth(data[S[v]], 0.02);
  smooth(data[S.jawOpen], 0.025);
  return finish(data, n);
}
