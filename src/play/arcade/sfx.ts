/**
 * Arcade sound effects synthesised with Web Audio: countdown beeps, coins, boosts, crashes, whooshes and pickups.
 * Rain and sandstorms loop Studio's recordings, with filtered noise until the recording loads or if it cannot.
 * Silent until a user gesture unlocks audio; respects the game's mute.
 */
import { soundEffectById } from '../../studio/audio/effects-catalog';
/** Weather beds and the ambience of each terrain: rainforest birdsong, waves on the coast, wind on snow and peaks. */
export type Bed = 'rain' | 'sandstorm' | 'birds' | 'ocean' | 'wind';
const WEATHER_EFFECT = { rain: 'heavy-rain', sandstorm: 'sandstorm', birds: 'forest-birds', ocean: 'ocean', wind: 'wind' } as const;
const WEATHER_LEVEL = { rain: { noise: 0.16, recorded: 0.7 }, sandstorm: { noise: 0.22, recorded: 0.45 }, birds: { noise: 0, recorded: 0.35 }, ocean: { noise: 0.05, recorded: 0.4 }, wind: { noise: 0.08, recorded: 0.32 } } as const;
const AMBIENCE: Record<string, Bed> = { jungle: 'birds', forest: 'birds', 'jungle-ruins': 'birds', 'temple-ruins': 'birds', beach: 'ocean', 'beach-boardwalk': 'ocean', harbour: 'ocean', lagoon: 'ocean', snow: 'wind', mountain: 'wind', 'snowy-peaks': 'wind', 'haunted-forest': 'wind', desert: 'wind', 'desert-canyon': 'wind' };
/** The bed for a race or run: its weather, otherwise its terrain's ambience. */
export const bedFor = (weather: string | undefined, theme: string): Bed | 'none' => (weather === 'rain' || weather === 'sandstorm' ? weather : AMBIENCE[theme] ?? 'none');
/** A loop of the recording whose end crossfades into its start, so the seam is not heard. */
function seamless(c: BaseAudioContext, b: AudioBuffer) {
  const fade = Math.min(Math.floor(b.sampleRate * 0.4), Math.floor(b.length / 3)), length = b.length - fade, out = c.createBuffer(b.numberOfChannels, length, b.sampleRate);
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const src = b.getChannelData(ch), dst = out.getChannelData(ch);dst.set(src.subarray(0, length));
    for (let i = 0; i < fade; i++) { const k = i / fade;dst[i] = src[i] * Math.sqrt(k) + src[length + i] * Math.sqrt(1 - k); }
  }
  return out;
}
export type ArcadeSound = 'beep' | 'go' | 'coin' | 'boost' | 'crash' | 'bump' | 'whoosh' | 'power' | 'jump' | 'slide' | 'land' | 'lap' | 'best' | 'stumble' | 'shield' | 'spin' | 'item' | 'win' | 'lose';
export class ArcadeSfx {
  private context?: AudioContext; private master?: GainNode; private noise?: AudioBuffer; private last = new Map<ArcadeSound, number>();
  enabled = true;
  unlock() {
    try {
      if (!this.context) {
        const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) return;
        this.context = new Context();this.master = this.context.createGain();this.master.gain.value = 0.32;this.master.connect(this.context.destination);
        const n = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate), data = n.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;this.noise = n;
      }
      if (this.context.state === 'suspended') void this.context.resume();
    } catch { /* audio is optional */ }
  }
  private tone(freq: number, length: number, type: OscillatorType = 'sine', volume = 0.4, slide?: number, delay = 0) {
    const c = this.context!, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type;o.frequency.setValueAtTime(freq, t);if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + length);
    g.gain.setValueAtTime(0.0001, t);g.gain.exponentialRampToValueAtTime(volume, t + 0.01);g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(g).connect(this.master!);o.start(t);o.stop(t + length + 0.02);
  }
  private hiss(length: number, from: number, to: number, volume = 0.5, type: BiquadFilterType = 'bandpass') {
    const c = this.context!, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise!;f.type = type;f.frequency.setValueAtTime(from, t);f.frequency.exponentialRampToValueAtTime(to, t + length);f.Q.value = 0.8;
    g.gain.setValueAtTime(volume, t);g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    s.connect(f).connect(g).connect(this.master!);s.start(t, Math.random() * 0.5);s.stop(t + length + 0.02);
  }
  private bed?: { source: AudioBufferSourceNode; gain: GainNode; kind: string; level: number; recorded: boolean };
  private recordings = new Map<Bed, AudioBuffer | null>();
  private loading = new Set<string>();
  /** Fetch and decode a weather recording once; a failure leaves the noise bed in place. */
  private loadWeather(kind: Bed) {
    const c = this.context, effect = soundEffectById(WEATHER_EFFECT[kind]);if (!c || !effect || this.recordings.has(kind) || this.loading.has(kind)) return;
    this.loading.add(kind);
    const base = new URL(import.meta.env?.BASE_URL ?? '/', location.href);
    fetch(new URL(`media/effects/${effect.file}`, base)).then(r => { if (!r.ok) throw Error('Audio unavailable');return r.arrayBuffer(); }).then(b => c.decodeAudioData(b))
      .then(b => { this.recordings.set(kind, seamless(c, b)); }, () => { this.recordings.set(kind, null); })
      .finally(() => { this.loading.delete(kind);if (this.bed?.kind === kind && !this.bed.recorded && this.recordings.get(kind)) { const { level } = this.bed;this.bed.gain.gain.setTargetAtTime(0, c.currentTime, 0.3);const old = this.bed.source;setTimeout(() => { try { old.stop(); } catch { /* Ended. */ } }, 1200);this.bed = undefined;this.weather(kind, level > 0); } });
  }
  /** A looping rain or sandstorm bed; it follows the play state and the game's mute. */
  weather(kind: Bed | 'none', on: boolean) {
    const c = this.context;if (!c || !this.noise || !this.master) return;
    if (this.bed && this.bed.kind !== kind) { this.bed.source.stop();this.bed = undefined; }
    if (!this.bed && kind !== 'none') {
      this.loadWeather(kind);
      const recording = this.recordings.get(kind), source = c.createBufferSource(), gain = c.createGain();source.loop = true;gain.gain.value = 0;
      if (recording) { source.buffer = recording;source.connect(gain); }
      else { const filter = c.createBiquadFilter();source.buffer = this.noise;filter.type = kind === 'rain' ? 'highpass' : 'lowpass';filter.frequency.value = kind === 'rain' ? 1400 : kind === 'ocean' ? 420 : 650;source.connect(filter).connect(gain); }
      gain.connect(this.master);source.start();this.bed = { source, gain, kind, level: 0, recorded: !!recording };
    }
    if (!this.bed) return;
    const levels = WEATHER_LEVEL[this.bed.kind as Bed], level = on && this.enabled ? (this.bed.recorded ? levels.recorded : levels.noise) : 0;
    if (this.bed.level !== level) { this.bed.level = level;this.bed.gain.gain.setTargetAtTime(level, c.currentTime, level ? 0.4 : 0.12); }
  }
  /** `strength` 0..1 scales impacts; repeated sounds are rate-limited so a long scrape cannot stack. */
  play(sound: ArcadeSound, strength = 1) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const now = performance.now(), gap = sound === 'coin' ? 45 : sound === 'crash' || sound === 'bump' ? 120 : 60;
    if (now - (this.last.get(sound) ?? 0) < gap) return;this.last.set(sound, now);
    const v = Math.max(0.15, Math.min(1, strength));
    switch (sound) {
      case 'beep': this.tone(660, 0.18, 'square', 0.25);break;
      case 'go': this.tone(1320, 0.45, 'square', 0.3);break;
      case 'coin': this.tone(1568, 0.07, 'square', 0.12);this.tone(2093, 0.12, 'square', 0.12, undefined, 0.06);break;
      case 'boost': this.hiss(0.6, 400, 3200, 0.55);this.tone(180, 0.5, 'sawtooth', 0.12, 520);break;
      case 'crash': this.hiss(0.5 * v + 0.2, 1800, 120, 0.9 * v, 'lowpass');this.tone(90, 0.3, 'triangle', 0.5 * v, 40);break;
      case 'bump': this.hiss(0.18, 900, 200, 0.5 * v, 'lowpass');this.tone(120, 0.12, 'triangle', 0.3 * v, 60);break;
      case 'whoosh': this.hiss(0.45, 300, 2400, 0.35);break;
      case 'power': [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.18, undefined, i * 0.06));break;
      case 'jump': this.tone(330, 0.18, 'triangle', 0.18, 660);break;
      case 'slide': this.hiss(0.35, 1400, 500, 0.3, 'lowpass');break;
      case 'land': this.hiss(0.12, 500, 150, 0.3 * v, 'lowpass');break;
      case 'lap': this.tone(880, 0.12, 'triangle', 0.2);this.tone(1175, 0.25, 'triangle', 0.2, undefined, 0.1);break;
      case 'best': [880, 1109, 1319, 1760].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.2, undefined, i * 0.08));break;
      case 'stumble': this.tone(220, 0.25, 'sawtooth', 0.15, 110);this.hiss(0.2, 700, 200, 0.35, 'lowpass');break;
      case 'shield': this.tone(1046, 0.4, 'sine', 0.25, 523);break;
      case 'spin': this.tone(600, 0.6, 'sawtooth', 0.1, 150);break;
      case 'item': this.tone(1046, 0.08, 'square', 0.12);this.tone(1318, 0.08, 'square', 0.12, undefined, 0.07);break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.22, undefined, i * 0.12));break;
      case 'lose': [392, 330, 262].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.2, undefined, i * 0.16));break;
    }
  }
}
