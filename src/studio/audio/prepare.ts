/** One queue and one local engine for every character's dialogue. */
import { parseProject, type StudioProject } from '../project';
import { getAsset, type AudioAsset } from './assets';
import { generateSpeech, MODEL_REVISION, releaseSpeechEngine } from './tts';

export interface SpeechPreparation {
  signal:AbortSignal;
  progress(message:string):void;
  updated?(project:StudioProject):void|Promise<void>;
}
const takes=new Map<string,string>();
let queue:Promise<void>=Promise.resolve();
export const hasScriptedSpeech=(project:StudioProject)=>!project.audio.muted&&project.audio.speech.some(c=>c.source==='tts'&&!!c.text.trim());

/** Preserve authored windows; lengthen a short window so automatic generation never cuts off words. */
export async function prepareDialogue(project:StudioProject,options:SpeechPreparation):Promise<StudioProject>{
  const previous=queue;let release!:()=>void;queue=new Promise<void>(resolve=>{release=resolve;});
  await previous;
  const {signal,progress}=options;
  try{
    signal.throwIfAborted();const next=structuredClone(project);
    if(next.audio.muted)return next;
    const cues:StudioProject['audio']['speech']=[];
    for(const cue of next.audio.speech){
      signal.throwIfAborted();if(cue.source!=='tts'||!cue.text.trim())continue;
      const asset=cue.asset?await getAsset(cue.asset):undefined,origin=asset?.speech;
      if(!asset||origin&&(origin.text!==cue.text||origin.voice!==cue.voice||origin.model!==MODEL_REVISION))cues.push(cue);
    }
    for(const [index,cue]of cues.entries()){
      signal.throwIfAborted();
      const key=JSON.stringify([MODEL_REVISION,cue.voice,cue.text]),cached=takes.get(key);
      let asset:AudioAsset|undefined=cached?await getAsset(cached):undefined;
      if(!asset){asset=await generateSpeech(cue.text,cue.voice,message=>progress(`Speech ${index+1} of ${cues.length} · ${cue.name} · ${message}`),signal);takes.set(key,asset.id);if(takes.size>128)takes.delete(takes.keys().next().value!);}
      signal.throwIfAborted();
      const duration=Math.max(cue.duration,asset.duration/cue.speed);
      if(cue.start+duration>60)throw Error(`“${cue.name}” needs ${(asset.duration/cue.speed).toFixed(1)} seconds. Move it earlier or shorten its script to fit the 60-second film.`);
      Object.assign(cue,{asset:asset.id,offset:0,duration});
      await options.updated?.(structuredClone(next));
    }
    return parseProject(JSON.stringify(next));
  }finally{releaseSpeechEngine();release();}
}
