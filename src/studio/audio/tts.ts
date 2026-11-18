/**
 * Speech for a line: Ara's own voices run on this device (on demand, in a worker); Gemini and ElevenLabs voices use the
 * visitor's own key. Either way the result is saved as a WAV in the local audio library.
 */
import { putAsset, wavBlob, type AudioAsset, type SpeechOrigin } from './assets';
import { speakCloud, voiceProvider } from '../../app/keys/voices';
export const MODEL_REVISION='75e6727618a02f323c720cba9478152d4bc16ca4';
export const MODEL_BASE=`https://huggingface.co/Supertone/supertonic-2/resolve/${MODEL_REVISION}`;
let worker:Worker|undefined,busy=false;
export function cancelSpeechGeneration(){worker?.terminate();worker=undefined;busy=false;}
export function releaseSpeechEngine(){if(!busy)cancelSpeechGeneration();}

/** Ara's own voices: speaks a line on this device. */
export async function speakLocally(text:string,voice:string,progress:(message:string)=>void,signal?:AbortSignal){
  signal?.throwIfAborted();if(busy)throw Error('Wait for the current line to finish.');busy=true;
  try{
    worker??=new Worker(new URL('./tts-worker.ts',import.meta.url),{type:'module'});
    return await new Promise<{samples:Float32Array;sampleRate:number}>((resolve,reject)=>{
      const abort=()=>{cancelSpeechGeneration();reject(new DOMException('Speech generation cancelled','AbortError'));};signal?.addEventListener('abort',abort,{once:true});
      worker!.onmessage=(event:MessageEvent)=>{const data=event.data;if(data.type==='progress')progress(data.message);else{signal?.removeEventListener('abort',abort);if(data.type==='result')resolve(data);else reject(Error(data.message));}};
      worker!.onerror=()=>{signal?.removeEventListener('abort',abort);cancelSpeechGeneration();reject(Error('Ara’s voices couldn’t start in this browser. Try a shorter line, or record or upload it instead.'));};
      const base=import.meta.env.VITE_STUDIO_TTS_MODEL_URL||MODEL_BASE;worker!.postMessage({text,voice,base});
    });
  }finally{busy=false;}
}

/** Which engine voices a line, as recorded with its audio. */
export const speechModel=(voice:string,model?:string)=>voiceProvider(voice)?model??voice:MODEL_REVISION;

/** Speaks a line in a voice and saves it. */
export async function generateSpeech(text:string,voice:string,progress:(message:string)=>void,signal?:AbortSignal,delivery?:string):Promise<AudioAsset>{
  signal?.throwIfAborted();
  const cloud=!!voiceProvider(voice);
  if(!cloud)progress('Loading Ara’s voices…');
  const spoken=cloud?await speakCloud(voice,text,delivery,signal):{...await speakLocally(text,voice,progress,signal),model:MODEL_REVISION};
  signal?.throwIfAborted();
  const origin:SpeechOrigin={text,voice,model:cloud?spoken.model:MODEL_REVISION,...(cloud&&delivery?{delivery}:{})};
  return putAsset(wavBlob([spoken.samples],spoken.sampleRate),text.slice(0,60),spoken.samples.length/spoken.sampleRate,spoken.sampleRate,1,origin);
}

/** Whether saved speech still matches its line's words, voice and direction. */
export function speechIsCurrent(asset:Pick<AudioAsset,'speech'>,cue:{text:string;voice:string;delivery?:string}){
  const o=asset.speech;if(!o)return true;
  if(o.text!==cue.text||o.voice!==cue.voice||(o.delivery??'')!==(voiceProvider(cue.voice)?cue.delivery??'':''))return false;
  return voiceProvider(cue.voice)?true:o.model===MODEL_REVISION;
}
