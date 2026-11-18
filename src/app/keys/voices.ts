/**
 * Every voice a line can use: Ara's own voices (free, on this device) and the voices of connected providers. A voice
 * is named "F1" … "M2" for Ara's, or "provider/voice" (such as "gemini/Kore" or "elevenlabs/<voice id>").
 */
import { call, elevenVoiceList, PROVIDERS, type ProviderId } from './providers';
import { keySettings, type SavedKey } from './store';
import { ProviderError } from './http';

export interface Voice { id: string; name: string; detail?: string; gender?: 'female' | 'male'; preview?: string }
export interface VoiceGroup { label: string; provider?: ProviderId; voices: Voice[] }

export const ARA_VOICES: Voice[] = [
  { id: 'F1', name: 'Ara · Female 1', gender: 'female' }, { id: 'F2', name: 'Ara · Female 2', gender: 'female' },
  { id: 'M1', name: 'Ara · Male 1', gender: 'male' }, { id: 'M2', name: 'Ara · Male 2', gender: 'male' },
];

/** Gemini's prebuilt voices with Google's description of each. */
const GEMINI: [string, string, 'female' | 'male'][] = [
  ['Kore', 'Firm', 'female'], ['Puck', 'Upbeat', 'male'], ['Aoede', 'Breezy', 'female'], ['Charon', 'Informative', 'male'], ['Leda', 'Youthful', 'female'],
  ['Fenrir', 'Excitable', 'male'], ['Zephyr', 'Bright', 'female'], ['Orus', 'Firm', 'male'], ['Callirrhoe', 'Easy-going', 'female'], ['Enceladus', 'Breathy', 'male'],
  ['Autonoe', 'Bright', 'female'], ['Iapetus', 'Clear', 'male'], ['Despina', 'Smooth', 'female'], ['Umbriel', 'Easy-going', 'male'], ['Erinome', 'Clear', 'female'],
  ['Algieba', 'Smooth', 'male'], ['Laomedeia', 'Upbeat', 'female'], ['Algenib', 'Gravelly', 'male'], ['Achernar', 'Soft', 'female'], ['Rasalgethi', 'Informative', 'male'],
  ['Gacrux', 'Mature', 'female'], ['Alnilam', 'Firm', 'male'], ['Pulcherrima', 'Forward', 'female'], ['Schedar', 'Even', 'male'], ['Vindemiatrix', 'Gentle', 'female'],
  ['Achird', 'Friendly', 'male'], ['Sulafat', 'Warm', 'female'], ['Zubenelgenubi', 'Casual', 'male'], ['Sadachbia', 'Lively', 'male'], ['Sadaltager', 'Knowledgeable', 'male'],
];
const GEMINI_VOICES: Voice[] = GEMINI.map(([name, detail, gender]) => ({ id: `gemini/${name}`, name, detail: `${gender}, ${detail.toLowerCase()}`, gender }));

export const VOICE_PATTERN = /^(F1|F2|M1|M2|gemini\/[A-Za-z]{2,40}|elevenlabs\/[A-Za-z0-9]{8,64})$/;
export const isVoice = (id: unknown): id is string => typeof id === 'string' && VOICE_PATTERN.test(id);
export const voiceProvider = (id: string): ProviderId | undefined => id.startsWith('gemini/') ? 'gemini' : id.startsWith('elevenlabs/') ? 'elevenlabs' : undefined;

// ---- ElevenLabs voices from the visitor's account ----
let eleven: { key: string; voices: Voice[] } | undefined;
const NAMES = 'ara.voices.names.v1';
/** Names of voices seen before, so a film shows "Rachel" even before the list loads. */
function rememberNames(voices: Voice[]) {
  try { const saved = JSON.parse(localStorage.getItem(NAMES) || '{}'); for (const v of voices) saved[v.id] = v.name; localStorage.setItem(NAMES, JSON.stringify(saved)); } catch { /* A convenience. */ }
}
async function elevenVoices(): Promise<Voice[]> {
  const saved = keySettings().keys.elevenlabs;
  if (!saved) return [];
  if (eleven?.key === saved.key) return eleven.voices;
  const voices: Voice[] = [];
  const j = await elevenVoiceList(saved);
  for (const v of j.voices ?? []) {
    const l = v.labels ?? {}, own = v.category && v.category !== 'premade';
    const detail = [own ? 'your voice' : '', l.gender, l.age, l.accent, l.description ?? l.descriptive ?? l.use_case].filter(Boolean).join(' · ');
    voices.push({ id: `elevenlabs/${v.voice_id}`, name: v.name, detail, ...(l.gender === 'female' || l.gender === 'male' ? { gender: l.gender } : {}), ...(v.preview_url ? { preview: v.preview_url } : {}) });
  }
  // Your own voices first, then the rest by name.
  voices.sort((a, b) => Number(b.detail?.startsWith('your voice') ?? 0) - Number(a.detail?.startsWith('your voice') ?? 0) || a.name.localeCompare(b.name));
  eleven = { key: saved.key, voices };
  rememberNames(voices);
  return voices;
}

/** The voices to choose from, grouped: Ara's, then each connected provider's. */
export async function voiceMenu(): Promise<VoiceGroup[]> {
  const s = keySettings(), groups: VoiceGroup[] = [{ label: 'Ara voices · free, on this device', voices: ARA_VOICES }];
  if (s.keys.gemini) groups.push({ label: 'Google Gemini', provider: 'gemini', voices: GEMINI_VOICES });
  if (s.keys.elevenlabs) {
    try { groups.push({ label: 'ElevenLabs', provider: 'elevenlabs', voices: await elevenVoices() }); }
    catch (error) { groups.push({ label: `ElevenLabs · ${(error as Error).message}`, provider: 'elevenlabs', voices: [] }); }
  }
  return groups;
}

export function voiceName(id: string): string {
  const ara = ARA_VOICES.find(v => v.id === id); if (ara) return ara.name;
  if (id.startsWith('gemini/')) return `Gemini · ${id.slice(7)}`;
  if (id.startsWith('elevenlabs/')) {
    const known = eleven?.voices.find(v => v.id === id)?.name ?? (() => { try { return JSON.parse(localStorage.getItem(NAMES) || '{}')[id]; } catch { return undefined; } })();
    return `ElevenLabs · ${known ?? 'voice ' + id.slice(11, 17)}`;
  }
  return id;
}

/** Ara's voices can't take direction; Gemini and ElevenLabs can. */
export const supportsDelivery = (id: string) => !!voiceProvider(id);
export const deliveryHint = (id: string) => voiceProvider(id) === 'elevenlabs'
  ? 'A word or two in brackets works best, such as whispers, laughs, excited or sarcastic.'
  : 'Describe it in plain words, such as “whispered urgently” or “warm and slow”.';

/**
 * A voice for a new speaker: from the first connected provider when there is one, otherwise Ara's. Speakers take turns
 * through the voices that match them, so two people rarely sound alike.
 */
export function defaultVoice(index: number, gender?: number): string {
  const want: 'female' | 'male' | undefined = gender === undefined ? undefined : gender >= .5 ? 'male' : 'female';
  const s = keySettings();
  const from = (list: Voice[]) => { const fit = want ? list.filter(v => v.gender === want) : list; return fit.length ? fit[index % fit.length].id : undefined; };
  if (s.keys.elevenlabs && eleven?.voices.length) { const v = from(eleven.voices.filter(v => !v.detail?.startsWith('your voice'))); if (v) return v; }
  if (s.keys.gemini) { const v = from(GEMINI_VOICES); if (v) return v; }
  return want === 'male' ? (index % 2 ? 'M2' : 'M1') : want === 'female' ? (index % 2 ? 'F2' : 'F1') : 'M2';
}

/** What voicing these lines involves, for the button that voices them. HTML. */
export function generationNote(lines: { voice: string; text: string }[]): string {
  if (!lines.length) return 'Lines are voiced in the voice chosen for each speaker. You can also record your own.';
  const s = keySettings(), parts: string[] = [];
  const ara = lines.filter(l => !voiceProvider(l.voice)).length;
  if (ara) parts.push(`${ara} with Ara voices, on this device and free (about 265 MB to download the first time). <a href="../third-party/speech/MODEL-LICENSE.txt" target="_blank" rel="noopener">Model terms</a>`);
  for (const id of ['gemini', 'elevenlabs'] as const) {
    const mine = lines.filter(l => voiceProvider(l.voice) === id);
    if (!mine.length) continue;
    const chars = mine.reduce((n, l) => n + l.text.length, 0);
    if (!s.keys[id]) parts.push(`<b>${mine.length} use ${PROVIDERS[id].name} voices, which aren’t connected in this browser.</b> Connect your key with More voices, or choose other voices above.`);
    else parts.push(`${mine.length} with ${PROVIDERS[id].name}: ${id === 'elevenlabs' ? `about ${chars.toLocaleString()} characters of your allowance` : 'a little of your free daily allowance, or well under a cent without one'}`);
  }
  return parts.join('<br>');
}

// ---- Speaking ----

export interface Spoken { samples: Float32Array; sampleRate: number; model: string }

function pcm16(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = new Float32Array(bytes.byteLength >> 1);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
async function decode(bytes: Uint8Array): Promise<{ samples: Float32Array; sampleRate: number }> {
  const ctx = new OfflineAudioContext(1, 1, 24000), buffer = await ctx.decodeAudioData(bytes.slice().buffer);
  return { samples: buffer.getChannelData(0), sampleRate: buffer.sampleRate };
}

/** ElevenLabs models, best first; an account without one falls back to the next. */
const ELEVEN_MODELS = ['eleven_v4', 'eleven_v3', 'eleven_multilingual_v2'];
const TAGS = new Set(['eleven_v4', 'eleven_v3']);
let elevenModel = 0;
async function speakEleven(voice: string, text: string, delivery: string | undefined, signal?: AbortSignal): Promise<Spoken> {
  const saved = keySettings().keys.elevenlabs!;
  for (;;) {
    const model = ELEVEN_MODELS[elevenModel];
    const words = delivery && TAGS.has(model) ? `[${delivery.replace(/[[\]]/g, '')}] ${text}` : text;
    try {
      const res = await call('elevenlabs', saved, `/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=pcm_24000`, { signal, body: { text: words, model_id: model } });
      return { samples: pcm16(new Uint8Array(await res.arrayBuffer())), sampleRate: 24000, model: `elevenlabs/${model}` };
    } catch (error) {
      const e = error as ProviderError;
      const modelProblem = (e.problem === 'permission' || e.problem === 'model') && /model|subscription/i.test(`${e.message} ${e.detail ?? ''}`);
      if (!modelProblem || elevenModel >= ELEVEN_MODELS.length - 1) throw error;
      elevenModel++;
    }
  }
}

/** Gemini's speech model for this key, found once from its model list. */
let geminiTts: { key: string; model: string } | undefined;
async function geminiModel(signal?: AbortSignal) {
  const saved = keySettings().keys.gemini!;
  if (geminiTts?.key === saved.key) return geminiTts.model;
  let found: string[] = [];
  try {
    const j = await (await call('gemini', saved, '/models?pageSize=1000', { signal })).json();
    found = (j.models ?? []).map((m: { name: string }) => m.name.replace(/^models\//, '')).filter((m: string) => /tts/.test(m));
  } catch { /* Use the usual name. */ }
  const order = [/^gemini-3\.8-flash-tts$/, /^gemini-3\.8-flash-lite-tts$/, /flash-tts/, /tts/];
  const model = order.map(re => found.find(m => re.test(m))).find(Boolean) ?? 'gemini-3.8-flash-tts';
  geminiTts = { key: saved.key, model };
  return model;
}
async function speakGemini(voice: string, text: string, delivery: string | undefined, signal?: AbortSignal): Promise<Spoken> {
  const saved = keySettings().keys.gemini!, model = await geminiModel(signal);
  // Gemini's speech models read the text word for word, so direction goes in its own style field (Interactions API).
  if (delivery) {
    try { return await speakGeminiStyled(saved, model, voice, text, delivery, signal); }
    catch (error) {
      const e = error as ProviderError;
      // Only a request Gemini doesn't understand falls back, to the line spoken plainly; key and allowance problems stand.
      if (e.problem !== 'other' && e.problem !== 'model') throw error;
    }
  }
  const res = await call('gemini', saved, `/models/${encodeURIComponent(model)}:generateContent`, { signal, body: {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  } });
  const j = await res.json();
  const part = (j.candidates?.[0]?.content?.parts ?? []).find((p: { inlineData?: { data?: string } }) => p.inlineData?.data);
  if (!part) {
    const why = j.promptFeedback?.blockReason ?? j.candidates?.[0]?.finishReason;
    throw new ProviderError(why && why !== 'STOP' ? 'Gemini declined to speak this line. Try rewording it.' : 'Gemini sent no audio for this line. Try again.', why ? 'refused' : 'other');
  }
  return { ...(await audioFrom(fromBase64(part.inlineData.data), part.inlineData.mimeType ?? '')), model: `gemini/${model}` };
}
/** A line with direction: the words in text, the direction in a speech_metadata style annotation. */
async function speakGeminiStyled(saved: SavedKey, model: string, voice: string, text: string, style: string, signal?: AbortSignal): Promise<Spoken> {
  const res = await call('gemini', saved, '/interactions', { signal, body: {
    model,
    input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice }] },
  } });
  const j = await res.json();
  const audio = (j.steps ?? []).filter((s: { type?: string }) => s.type === 'model_output').flatMap((s: { content?: { type?: string; data?: string; mime_type?: string }[] }) => s.content ?? []).filter((c: { type?: string; data?: string }) => c.type === 'audio' && c.data).pop();
  if (!audio) throw new ProviderError('Gemini sent no audio for this line. Try again.', 'other');
  return { ...(await audioFrom(fromBase64(audio.data), audio.mime_type ?? '')), model: `gemini/${model}` };
}
/** A 16-bit PCM WAV, read chunk by chunk (mono, or the first channel); undefined for anything else. */
function pcmWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), tag = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4));
  let rate = 0, channels = 1, bits = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = tag(at), size = view.getUint32(at + 4, true), body = at + 8;
    if (id === 'fmt ') { if (view.getUint16(body, true) !== 1) return; channels = view.getUint16(body + 2, true); rate = view.getUint32(body + 4, true); bits = view.getUint16(body + 14, true); }
    else if (id === 'data' && rate && bits === 16) {
      // Streamed WAVs can give a placeholder size; read what's there.
      const end = Math.min(bytes.length, size && size !== 0xffffffff ? body + size : bytes.length), frames = Math.floor((end - body) / (2 * channels)), out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) out[i] = view.getInt16(body + i * 2 * channels, true) / 32768;
      return { samples: out, sampleRate: rate };
    }
    at = body + size + (size & 1);
  }
}
/** WAV (or another container) is decoded; headerless 16-bit PCM is read directly at its stated rate. */
async function audioFrom(bytes: Uint8Array, mime: string) {
  const riff = bytes.length > 44 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF';
  if (riff) { const wav = pcmWav(bytes); if (wav) return wav; }
  if (riff || /wav|mpeg|mp3|ogg/.test(mime)) return decode(bytes);
  return { samples: pcm16(bytes), sampleRate: Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000) };
}

/** Speaks a line with a provider's voice. */
export async function speakCloud(voiceId: string, text: string, delivery?: string, signal?: AbortSignal): Promise<Spoken> {
  const provider = voiceProvider(voiceId);
  if (!provider) throw Error('That isn’t a provider voice.');
  if (!keySettings().keys[provider]) throw new ProviderError(`This line uses a ${PROVIDERS[provider].name} voice. Connect your ${PROVIDERS[provider].name} key (More voices), or choose another voice.`, 'key');
  const voice = voiceId.slice(provider.length + 1);
  const spoken = provider === 'elevenlabs' ? await speakEleven(voice, text, delivery, signal) : await speakGemini(voice, text, delivery, signal);
  if (spoken.samples.length < spoken.sampleRate * .05) throw new ProviderError(`${PROVIDERS[provider].name} sent back silence. Try again.`, 'other');
  return spoken;
}

// ---- Hearing a voice before choosing it ----
const samples = new Map<string, AudioBuffer>();
let sampleContext: AudioContext | undefined, playing: AudioBufferSourceNode | HTMLAudioElement | undefined;
export function stopSample() { if (playing instanceof HTMLAudioElement) playing.pause(); else try { playing?.stop(); } catch { /* Ended. */ } playing = undefined; }

/**
 * Plays a short sample of a voice: ElevenLabs' own free preview when there is one, otherwise a short sentence spoken by
 * the voice (Ara's voices download their model the first time).
 */
export async function playVoiceSample(voiceId: string, sentence: string, progress: (message: string) => void, speakLocal?: (text: string, voice: string) => Promise<{ samples: Float32Array; sampleRate: number }>) {
  stopSample();
  const preview = eleven?.voices.find(v => v.id === voiceId)?.preview;
  if (preview) { const audio = new Audio(preview); playing = audio; await audio.play(); return; }
  sampleContext ??= new AudioContext();
  await sampleContext.resume();
  let buffer = samples.get(voiceId);
  if (!buffer) {
    let spoken: { samples: Float32Array; sampleRate: number };
    if (voiceProvider(voiceId)) { progress(`Getting a sample from ${voiceName(voiceId)}…`); spoken = await speakCloud(voiceId, sentence); }
    else {
      if (!speakLocal) { const { speakLocally } = await import('../../studio/audio/tts'); speakLocal = (t, v) => speakLocally(t, v, progress); }
      progress('Preparing Ara’s voices…'); spoken = await speakLocal(sentence, voiceId);
    }
    buffer = sampleContext.createBuffer(1, spoken.samples.length, spoken.sampleRate);
    buffer.copyToChannel(spoken.samples as Float32Array<ArrayBuffer>, 0);
    samples.set(voiceId, buffer);
  }
  const source = sampleContext.createBufferSource(); source.buffer = buffer; source.connect(sampleContext.destination); source.start(); playing = source;
}

/**
 * The VOICES part of an Assist guide: Ara's voices, plus the connected providers' (ElevenLabs: up to 40, the
 * visitor's own first), so the AI can cast each speaker and direct their lines.
 */
export async function voiceGuide(): Promise<string> {
  const s = keySettings(), lines = ['VOICES', "- F1, F2: female; M1, M2: male. Ara voices, free, spoken on the user's device. They ignore delivery."];
  if (s.keys.gemini) lines.push(`- Google Gemini (connected): ${GEMINI_VOICES.map(v => `${v.id} (${v.detail})`).join(', ')}. delivery is plain words, such as "whispered urgently" or "warm and slow".`);
  if (s.keys.elevenlabs) {
    try {
      const list = (await elevenVoices()).slice(0, 40);
      if (list.length) lines.push(`- ElevenLabs (connected): ${list.map(v => `${v.id} (${v.name}${v.detail ? `, ${v.detail}` : ''})`).join('; ')}. delivery is one or two words such as whispers, laughs, excited or sarcastic.`);
    } catch { /* Leave ElevenLabs out of the guide if its voices can't load. */ }
  }
  if (s.keys.gemini || s.keys.elevenlabs) lines.push('- Prefer the connected provider voices: they sound far more natural. Match each voice to the character (gender, age, mood) and give lines a delivery where it helps the scene.');
  return lines.join('\n');
}

/** Ready-made directions for "How it's said", worded for each provider (ElevenLabs takes short tags). */
export const DELIVERY_PRESETS: { label: string; gemini: string; elevenlabs: string }[] = [
  { label: 'Whispered', gemini: 'in a whisper', elevenlabs: 'whispers' },
  { label: 'Shouting', gemini: 'shouting', elevenlabs: 'shouts' },
  { label: 'Excited', gemini: 'excitedly', elevenlabs: 'excited' },
  { label: 'Nervous', gemini: 'nervously, with hesitation', elevenlabs: 'nervous' },
  { label: 'Sad', gemini: 'sadly, holding back tears', elevenlabs: 'sad' },
  { label: 'Angry', gemini: 'angrily', elevenlabs: 'angry' },
  { label: 'Laughing', gemini: 'laughing as you speak', elevenlabs: 'laughs' },
  { label: 'Sarcastic', gemini: 'sarcastically', elevenlabs: 'sarcastic' },
  { label: 'Calm', gemini: 'calmly and slowly', elevenlabs: 'calm' },
  { label: 'Out of breath', gemini: 'out of breath, panting', elevenlabs: 'out of breath' },
];
/** The preset's wording for this voice's provider. */
export const presetFor = (voice: string, preset: (typeof DELIVERY_PRESETS)[number]) => voiceProvider(voice) === 'elevenlabs' ? preset.elevenlabs : preset.gemini;
