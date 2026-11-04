/** On-demand speech engine; native device speech is kept separate because it exposes no PCM output. */
import { putAsset, wavBlob } from './assets';
export const MODEL_REVISION='75e6727618a02f323c720cba9478152d4bc16ca4';
export const MODEL_BASE=`https://huggingface.co/Supertone/supertonic-2/resolve/${MODEL_REVISION}`;
let worker:Worker|undefined,busy=false;
export function cancelSpeechGeneration(){worker?.terminate();worker=undefined;busy=false;}
export function releaseSpeechEngine(){if(!busy)cancelSpeechGeneration();}
export async function generateSpeech(text:string,voice:string,progress:(message:string)=>void,signal?:AbortSignal){
  signal?.throwIfAborted();if(busy)throw Error('Wait for the current speech generation to finish.');busy=true;
  try{
    worker??=new Worker(new URL('./tts-worker.ts',import.meta.url),{type:'module'});
    const result=await new Promise<{samples:Float32Array;sampleRate:number}>((resolve,reject)=>{
      const abort=()=>{cancelSpeechGeneration();reject(new DOMException('Speech generation cancelled','AbortError'));};signal?.addEventListener('abort',abort,{once:true});
      worker!.onmessage=(event:MessageEvent)=>{const data=event.data;if(data.type==='progress')progress(data.message);else{signal?.removeEventListener('abort',abort);if(data.type==='result')resolve(data);else reject(Error(data.message));}};
      worker!.onerror=()=>{signal?.removeEventListener('abort',abort);cancelSpeechGeneration();reject(Error('The local speech engine could not start. Try a shorter script or upload a recording.'));};
      const base=import.meta.env.VITE_STUDIO_TTS_MODEL_URL||MODEL_BASE;worker!.postMessage({text,voice,base});
    });
    signal?.throwIfAborted();return await putAsset(wavBlob([result.samples],result.sampleRate),text.slice(0,60),result.samples.length/result.sampleRate,result.sampleRate,1,{text,voice,model:MODEL_REVISION});
  }finally{busy=false;}
}
export function deviceVoices(){return typeof speechSynthesis==='undefined'?[]:speechSynthesis.getVoices();}
export function previewDeviceSpeech(text:string,voiceURI:string,rate:number,pitch:number,volume=1){
  if(!Number.isFinite(rate)||rate<.1||rate>10||!Number.isFinite(pitch)||pitch<0||pitch>2)throw Error('Choose a read-through rate from 0.1 to 10 and pitch from 0 to 2.');
  if(typeof speechSynthesis==='undefined')throw Error('Device speech is unavailable in this browser.');speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.voice=deviceVoices().find(v=>v.voiceURI===voiceURI)??null;if(utterance.voice)utterance.lang=utterance.voice.lang;utterance.rate=rate;utterance.pitch=pitch;utterance.volume=Math.min(1,Math.max(0,volume));speechSynthesis.speak(utterance);
}
export function stopDeviceSpeech(){if(typeof speechSynthesis!=='undefined')speechSynthesis.cancel();}
