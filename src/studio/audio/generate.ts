/**
 * Sound effects and music made from a description with the visitor's own ElevenLabs key. The audio is saved in the
 * local audio library like a recording, so films play and export the same everywhere.
 */
import { call } from '../../app/keys/providers';
import { keySettings } from '../../app/keys/store';
import { ProviderError } from '../../app/keys/http';
import { putAsset, wavBlob, type AudioAsset } from './assets';

const need = () => {
  const saved = keySettings().keys.elevenlabs;
  if (!saved) throw new ProviderError('Making sounds and music uses ElevenLabs. Connect your ElevenLabs key in Keys first.', 'key');
  return saved;
};
export const canGenerate = () => !!keySettings().keys.elevenlabs;

async function save(res: Response, name: string, origin: { text: string; voice: string; model: string }, maxSeconds = 60): Promise<AudioAsset> {
  const bytes = await res.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, 44100);
  let buffer: AudioBuffer;
  try { buffer = await ctx.decodeAudioData(bytes); }
  catch { throw new ProviderError('ElevenLabs sent audio this browser couldn’t read. Try again.', 'other'); }
  if (buffer.duration < .1) throw new ProviderError('ElevenLabs sent back silence. Try again, or describe it differently.', 'other');
  const frames = Math.min(buffer.length, Math.floor(maxSeconds * buffer.sampleRate));
  const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => buffer.getChannelData(i).slice(0, frames));
  return putAsset(wavBlob(channels, buffer.sampleRate), name, frames / buffer.sampleRate, buffer.sampleRate, channels.length, origin);
}

/** A sound effect from a description: 0.5–30 seconds, or a length ElevenLabs picks; optionally made to loop. */
export async function generateSoundEffect(prompt: string, options: { seconds?: number; loop?: boolean }, signal?: AbortSignal): Promise<AudioAsset> {
  const saved = need(), text = prompt.trim();
  if (!text) throw Error('Describe the sound first.');
  const seconds = options.seconds === undefined ? undefined : Math.min(30, Math.max(.5, options.seconds));
  const res = await call('elevenlabs', saved, '/v1/sound-generation?output_format=mp3_44100_128', { signal, body: {
    text, model_id: 'eleven_text_to_sound_v2', prompt_influence: .5, ...(seconds ? { duration_seconds: seconds } : {}), ...(options.loop ? { loop: true } : {}),
  } });
  return save(res, text.slice(0, 60), { text, voice: 'elevenlabs/sound', model: 'eleven_text_to_sound_v2' }, 30.5);
}

/** Music from a description, made to a length (3–60 seconds here, the longest film). */
export async function composeMusic(prompt: string, options: { seconds: number; instrumental: boolean }, signal?: AbortSignal): Promise<AudioAsset> {
  const saved = need(), text = prompt.trim();
  if (!text) throw Error('Describe the music first.');
  const ms = Math.round(Math.min(60, Math.max(3, options.seconds)) * 1000);
  const res = await call('elevenlabs', saved, '/v1/music?output_format=mp3_44100_128', { signal, body: {
    prompt: text, music_length_ms: ms, model_id: 'music_v1', force_instrumental: options.instrumental,
  } });
  return save(res, text.slice(0, 60), { text, voice: 'elevenlabs/music', model: 'music_v1' }, 60.05);
}
