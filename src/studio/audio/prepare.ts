/** One queue and one local engine for every character's dialogue. */
import { parseProject, type StudioProject } from '../project';
import { getAsset, type AudioAsset } from './assets';
import { generateSoundEffect, composeMusic, canGenerate } from './generate';
import { durationOf } from '../project';
import { durationWords, limitsFor } from '../limits';
import { generateSpeech, releaseSpeechEngine, speechIsCurrent, speechModel } from './tts';

export interface SpeechPreparation {
  signal:AbortSignal;
  progress(message:string):void;
  updated?(project:StudioProject):void|Promise<void>;
}
const takes=new Map<string,string>();
let queue:Promise<void>=Promise.resolve();
/** Described sounds and composed music not made yet; they're made when an ElevenLabs key is connected. */
export const hasUnmadeSound=(project:StudioProject)=>!project.audio.muted&&canGenerate()&&(project.audio.effects.some(c=>c.sound==='generated'&&!c.asset)||project.audio.music.track==='generated'&&!project.audio.music.asset);
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
      const asset=cue.asset?await getAsset(cue.asset):undefined;
      if(!asset||!speechIsCurrent(asset,cue))cues.push(cue);
    }
    for(const [index,cue]of cues.entries()){
      signal.throwIfAborted();
      const key=JSON.stringify([speechModel(cue.voice),cue.voice,cue.text,cue.delivery??'']),cached=takes.get(key);
      let asset:AudioAsset|undefined=cached?await getAsset(cached):undefined;
      if(!asset){asset=await generateSpeech(cue.text,cue.voice,message=>progress(`Line ${index+1} of ${cues.length} · ${cue.name} · ${message}`),signal,cue.delivery);takes.set(key,asset.id);if(takes.size>128)takes.delete(takes.keys().next().value!);}
      signal.throwIfAborted();
      const duration=Math.max(cue.duration,asset.duration/cue.speed);
      const end=limitsFor(next).duration;
      if(cue.start+duration>end)throw Error(`“${cue.name}” needs ${(asset.duration/cue.speed).toFixed(1)} seconds. Move it earlier or shorten its script to fit the ${next.lesson?`${durationWords(end)} of a lesson's scene`:'60-second film'}.`);
      Object.assign(cue,{asset:asset.id,offset:0,duration});
      await options.updated?.(structuredClone(next));
    }
    // Then the sounds and music the film describes, with ElevenLabs.
    if(canGenerate()&&!next.audio.muted){
      const sounds=next.audio.effects.filter(c=>c.sound==='generated'&&!c.asset&&c.prompt);
      for(const [index,cue]of sounds.entries()){
        signal.throwIfAborted();progress(`Sound ${index+1} of ${sounds.length} · ${cue.name}…`);
        const asset=await generateSoundEffect(cue.prompt!,{seconds:Math.min(30,Math.max(.5,cue.duration*cue.speed)),loop:cue.loop},signal);
        Object.assign(cue,{asset:asset.id,offset:0,duration:Math.min(cue.duration,asset.duration/cue.speed,limitsFor(next).duration-cue.start)});
        await options.updated?.(structuredClone(next));
      }
      const music=next.audio.music;
      if(music.track==='generated'&&!music.asset&&music.prompt){
        signal.throwIfAborted();progress('Composing the music…');
        const asset=await composeMusic(music.prompt,{seconds:music.duration??durationOf(next),instrumental:music.instrumental!==false},signal);
        music.asset=asset.id;await options.updated?.(structuredClone(next));
      }
    }
    return parseProject(JSON.stringify(next));
  }finally{releaseSpeechEngine();release();}
}
