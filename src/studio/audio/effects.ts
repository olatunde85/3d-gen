/** Recorded one-shot and looping cues share a bounded decoded cache; timing is deterministic in every output. */
import { soundEffectById, type SoundEffectId } from './effects-catalog';
import type { SoundEffectCue } from './schema';
const buffers=new Map<string,AudioBuffer>();
export async function effectBuffer(ctx:BaseAudioContext,id:SoundEffectId,signal?:AbortSignal){
  signal?.throwIfAborted();const key=`${id}:${ctx.sampleRate}`,cached=buffers.get(key);if(cached)return cached;
  const effect=soundEffectById(id);if(!effect)throw Error('Choose a sound effect from the library.');
  const url=new URL(`${import.meta.env.BASE_URL}media/effects/${effect.file}`,location.href),response=await fetch(url,{signal});
  if(!response.ok)throw Error(`Could not load “${effect.name}” (${response.status}). Try again.`);
  const buffer=await ctx.decodeAudioData(await response.arrayBuffer());signal?.throwIfAborted();
  buffers.set(key,buffer);if(buffers.size>8)buffers.delete(buffers.keys().next().value!);return buffer;
}
export async function addSoundEffects(ctx:BaseAudioContext,cues:SoundEffectCue[],destination:AudioNode,signal?:AbortSignal){
  for(const cue of cues){
    if(cue.volume<=0)continue;signal?.throwIfAborted();const buffer=await effectBuffer(ctx,cue.sound,signal);
    if(cue.offset>=buffer.duration)throw Error(`“${cue.name}” starts beyond its recording. Adjust its trim.`);
    const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();source.buffer=buffer;source.loop=cue.loop===true;source.loopStart=cue.offset;source.loopEnd=buffer.duration;source.playbackRate.value=cue.speed;pan.pan.value=cue.pan;
    const end=cue.start+cue.duration,fade=Math.min(.002,cue.duration/3);
    gain.gain.setValueAtTime(0,cue.start);gain.gain.linearRampToValueAtTime(cue.volume,cue.start+fade);gain.gain.setValueAtTime(cue.volume,end-fade);gain.gain.linearRampToValueAtTime(0,end);
    source.connect(gain).connect(pan).connect(destination);source.start(cue.start,cue.offset);source.stop(end);
  }
}
