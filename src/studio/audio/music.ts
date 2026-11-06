/** Lazy recorded music. Cache only one film-length PCM excerpt, independent of cast size. */
import { MUSIC_TRACKS, type MusicId } from './tracks';
let cached:{id:MusicId;buffer:AudioBuffer;rate:number}|undefined;
async function musicBuffer(ctx:BaseAudioContext,id:MusicId,signal?:AbortSignal){
  signal?.throwIfAborted();if(cached?.id===id&&cached.rate===ctx.sampleRate)return cached.buffer;
  const track=MUSIC_TRACKS.find(t=>t.id===id);if(!track?.file)throw Error('Choose a music track from the library.');
  const url=new URL(`${import.meta.env.BASE_URL}media/music/${track.file}`,location.href);
  const response=await fetch(url,{signal});if(!response.ok)throw Error(`Could not load “${track.name}”. Please try again (${response.status}).`);
  let full:AudioBuffer;try{full=await ctx.decodeAudioData(await response.arrayBuffer());}catch(error){signal?.throwIfAborted();throw Error(`Could not decode “${track.name}”: ${(error as Error).message}`);}
  signal?.throwIfAborted();
  const frames=Math.min(full.length,Math.ceil(60*ctx.sampleRate)),buffer=ctx.createBuffer(Math.min(2,full.numberOfChannels),frames,ctx.sampleRate);
  for(let c=0;c<buffer.numberOfChannels;c++)buffer.copyToChannel(full.getChannelData(c).subarray(0,frames),c);
  cached={id,buffer,rate:ctx.sampleRate};return buffer;
}
export async function addMusic(ctx:BaseAudioContext,id:MusicId,duration:number,destination:AudioNode,signal?:AbortSignal,start=0){
  if(id==='none')return;const buffer=await musicBuffer(ctx,id,signal);signal?.throwIfAborted();
  const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(destination);source.start(start);source.stop(start+duration);
}
