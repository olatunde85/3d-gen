/** Browser-only audio assertions; built only by the focused audio integration suite. */
import { AudioBufferSink, BlobSource, Input, ALL_FORMATS } from 'mediabunny';
import { generateSpeech, previewDeviceSpeech } from '../src/studio/audio/tts';
import { getAsset, importAudio, wavBlob } from '../src/studio/audio/assets';
import { renderSoundtrack } from '../src/studio/audio/mix';
import { audioProjectBundle } from '../src/studio/audio/bundle';
import { type StudioProject } from '../src/studio/project';
async function asData(blob:Blob){return await new Promise<string>(resolve=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.readAsDataURL(blob);});}
function metrics(buffer:AudioBuffer){let sum=0,peak=0,finite=true;const a=buffer.getChannelData(0);for(const value of a){finite&&=Number.isFinite(value);sum+=value*value;peak=Math.max(peak,Math.abs(value));}return{duration:buffer.duration,rate:buffer.sampleRate,channels:buffer.numberOfChannels,rms:Math.sqrt(sum/a.length),peak,finite};}
async function decodeMovie(blob:Blob){const input=new Input({source:new BlobSource(new Blob([await blob.arrayBuffer()],{type:blob.type})),formats:ALL_FORMATS});try{const track=await input.getPrimaryAudioTrack();if(!track)throw Error('MP4 has no audio track');const sink=new AudioBufferSink(track);let energy=0,samples=0,end=0,channels=0;for await(const chunk of sink.buffers()){channels=chunk.buffer.numberOfChannels;const a=chunk.buffer.getChannelData(0);for(const value of a)energy+=value*value;samples+=a.length;end=Math.max(end,chunk.timestamp+chunk.buffer.duration);}return{codec:track.codec,channels,duration:end,rms:Math.sqrt(energy/samples)};}finally{input.dispose();}}
async function synthetic(){const rate=48000,samples=new Float32Array(rate*2);for(let i=0;i<samples.length;i++)samples[i]=.2*(Math.sin(i/rate*Math.PI*2*220)+.4*Math.sin(i/rate*Math.PI*2*3200)+.3*Math.sin(i/rate*Math.PI*2*6000));return await importAudio(wavBlob([samples],rate),'Test voice.wav');}
Object.assign(window,{audioCheck:{generateSpeech,previewDeviceSpeech,getAsset,importAudio,wavBlob,renderSoundtrack,audioProjectBundle,asData,metrics,decodeMovie,synthetic,
  mix:async(p:StudioProject)=>{const b=await renderSoundtrack(p);if(!b)throw Error('No audio');return metrics(b);}}});
