/** The same offline Web Audio graph supplies real-time playback, WAV and MP4 audio. */
import { durationOf, type StudioProject } from '../project';
import { decodeAsset } from './assets';
import { addMusic } from './music';
import { hasAudio, type VoiceEffect } from './schema';
function impulse(ctx:BaseAudioContext){const buffer=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*1.2),ctx.sampleRate);let seed=5283;for(let channel=0;channel<2;channel++){const samples=buffer.getChannelData(channel);for(let i=0;i<samples.length;i++){seed=(seed*1664525+1013904223)>>>0;samples[i]=(seed/4294967296*2-1)*(1-i/samples.length)**3;}}return buffer;}
function effectChain(ctx:BaseAudioContext,input:AudioNode,effect:VoiceEffect,end:number):AudioNode{
  if(effect==='natural')return input;
  const output=ctx.createGain();
  const filter=(type:BiquadFilterType,hz:number,gain=0)=>{const f=ctx.createBiquadFilter();f.type=type;f.frequency.value=hz;f.gain.value=gain;return f;};
  if(effect==='robotic'){
    const ring=ctx.createGain(),carrier=ctx.createOscillator(),depth=ctx.createGain(),shape=ctx.createWaveShaper(),curve=new Float32Array(2048);for(let i=0;i<curve.length;i++)curve[i]=Math.tanh((i/(curve.length-1)*2-1)*2)/Math.tanh(2);shape.curve=curve;
    ring.gain.value=.5;carrier.frequency.value=42;carrier.type='sine';depth.gain.value=.48;carrier.connect(depth).connect(ring.gain);carrier.start(0);carrier.stop(end);
    input.connect(filter('highpass',120)).connect(ring).connect(shape).connect(filter('lowpass',4300)).connect(output);
  }else if(effect==='dramatic'){
    const body=filter('lowshelf',180,5),presence=filter('peaking',2400,2),dry=ctx.createGain(),wet=ctx.createGain(),reverb=ctx.createConvolver();dry.gain.value=.9;wet.gain.value=.16;reverb.buffer=impulse(ctx);
    input.connect(body).connect(presence);presence.connect(dry).connect(output);presence.connect(reverb).connect(wet).connect(output);
  }else if(effect==='echo'){
    const dry=ctx.createGain(),delay=ctx.createDelay(1),feedback=ctx.createGain(),wet=ctx.createGain();dry.gain.value=.85;delay.delayTime.value=.22;feedback.gain.value=.28;wet.gain.value=.27;input.connect(dry).connect(output);input.connect(delay).connect(wet).connect(output);delay.connect(feedback).connect(delay);
  }else{
    const high=filter('highpass',effect==='radio'?320:500),low=filter('lowpass',effect==='radio'?3400:2300);input.connect(high).connect(low).connect(output);
    if(effect==='radio'){const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-26;compressor.ratio.value=5;compressor.attack.value=.005;compressor.release.value=.1;output.connect(compressor);return compressor;}
  }
  return output;
}
export async function renderSoundtrack(project:StudioProject,signal?:AbortSignal):Promise<AudioBuffer|undefined>{
  if(!hasAudio(project.audio))return;signal?.throwIfAborted();
  const duration=durationOf(project),ctx=new OfflineAudioContext(2,Math.ceil(duration*48000),48000),master=ctx.createGain(),compressor=ctx.createDynamicsCompressor();master.gain.value=.85;compressor.threshold.value=-3;compressor.knee.value=3;compressor.ratio.value=18;compressor.attack.value=.003;compressor.release.value=.12;master.connect(compressor).connect(ctx.destination);
  const speech=project.audio.speech;
  for(const cue of speech){
    if(cue.volume<=0)continue;if(!cue.asset)throw Error(`Generate or attach audio for “${cue.name}” in Sound before playing/exporting.`);
    const buffer=await decodeAsset(cue.asset,ctx);signal?.throwIfAborted();if(cue.offset>=buffer.duration)throw Error(`“${cue.name}” starts beyond the end of its audio. Adjust its trim.`);
    const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();source.buffer=buffer;source.playbackRate.value=cue.speed;pan.pan.value=cue.pan;
    const end=Math.min(duration,cue.start+cue.duration),fade=Math.min(.015,(end-cue.start)/3);
    gain.gain.setValueAtTime(0,cue.start);gain.gain.linearRampToValueAtTime(cue.volume,cue.start+fade);gain.gain.setValueAtTime(cue.volume,Math.max(cue.start+fade,end-fade));gain.gain.linearRampToValueAtTime(0,end);
    effectChain(ctx,source,cue.effect,duration).connect(gain).connect(pan).connect(master);source.start(cue.start,cue.offset);source.stop(end);
  }
  const music=project.audio.music;
  if(music.track!=='none'&&music.volume>0){const gain=ctx.createGain(),step=.02,steps=Math.ceil(duration/step);const curve=new Float32Array(steps+1);
    for(let i=0;i<curve.length;i++){const t=i/steps*duration;let duck=1;
      if(music.ducking)for(const cue of speech)if(cue.volume>0){const before=(t-(cue.start-.12))/.12,after=(cue.start+cue.duration+.35-t)/.35;duck=Math.min(duck,1-.7*Math.max(0,Math.min(1,before,after)));}
      const fadeIn=music.fadeIn?Math.min(1,t/music.fadeIn):1,fadeOut=music.fadeOut?Math.min(1,(duration-t)/music.fadeOut):1;curve[i]=music.volume*duck*Math.max(0,Math.min(fadeIn,fadeOut));}
    gain.gain.setValueCurveAtTime(curve,0,duration);gain.connect(master);addMusic(ctx,music.track,duration,gain);
  }
  signal?.throwIfAborted();const rendered=await ctx.startRendering();signal?.throwIfAborted();
  // A final common gain preserves the mix while preventing clipping from overlapping recordings.
  let peak=0;for(let c=0;c<rendered.numberOfChannels;c++)for(const sample of rendered.getChannelData(c))peak=Math.max(peak,Math.abs(sample));
  if(peak>.98)for(let c=0;c<rendered.numberOfChannels;c++){const samples=rendered.getChannelData(c);for(let i=0;i<samples.length;i++)samples[i]*=.98/peak;}
  return rendered;
}
export class AudioPlayback{
  private context?:AudioContext;private source?:AudioBufferSourceNode;private token=0;private at=0;private offset=0;private key='';private buffer?:AudioBuffer;
  get active(){return !!this.source;}
  position(){return this.source&&this.context?this.offset+this.context.currentTime-this.at:undefined;}
  stop(){this.token++;if(this.source){this.source.onended=null;try{this.source.stop();}catch{/* already ended */}this.source.disconnect();this.source=undefined;}}
  async play(project:StudioProject,time:number,done:()=>void,length?:number){
    this.stop();const token=this.token;if(!hasAudio(project.audio))return false;
    this.context??=new AudioContext();await this.context.resume();const key=JSON.stringify({audio:project.audio,duration:durationOf(project)});
    if(this.key!==key||!this.buffer){const buffer=await renderSoundtrack(project);if(token!==this.token)return false;this.buffer=buffer;this.key=key;}
    if(token!==this.token||!this.buffer)return false;const source=this.context.createBufferSource();source.buffer=this.buffer;source.connect(this.context.destination);this.at=this.context.currentTime;this.offset=time;this.source=source;source.onended=()=>{if(this.source===source){this.source=undefined;done();}};source.start(0,Math.min(time,Math.max(0,this.buffer.duration-.001)),length);return true;
  }
  invalidate(){this.stop();this.key='';this.buffer=undefined;}
}
