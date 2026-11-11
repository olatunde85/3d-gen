import {gameProjects,type PlayProject} from './project';
import type {MediaRef,StoryCue} from './story';

type VoiceId=NonNullable<StoryCue['voiceId']>;
type Synthesize=(text:string,voice:VoiceId,progress:(message:string)=>void)=>Promise<Pick<MediaRef,'id'|'name'|'duration'>>;

export function cueVoice(cue:StoryCue,chapter:PlayProject):VoiceId{
 if(cue.voiceId)return cue.voiceId;
 const gender=cue.speaker==='player'?chapter.character.gender:cue.speaker==='companion'?chapter.companion.character.gender:chapter.enemies.find(enemy=>enemy.id===cue.speaker)?.character.gender;
 return gender!==undefined&&gender>=.5?'M1':'F1';
}

/** Prepare portable dialogue after a JSON import; recorded or attached audio is preserved. */
export async function generateImportedVoices(project:PlayProject,progress:(message:string)=>void,synthesize?:Synthesize){
 const lines=gameProjects(project).flatMap(chapter=>(chapter.story?.cues??[]).filter(cue=>cue.voice&&cue.text.trim()&&!cue.audio).map(cue=>({cue,chapter})));
 if(!lines.length)return {generated:0,failed:0,error:''};
 let release:()=>void=()=>{};
 try{
  if(!synthesize){const speech=await import('../studio/audio/tts');synthesize=(text,voice,report)=>speech.generateSpeech(text,voice,report);release=speech.releaseSpeechEngine;}
  let generated=0;
  for(const {cue,chapter}of lines){
   const voice=cueVoice(cue,chapter);progress(`Generating ${voice.startsWith('M')?'male':'female'} voice ${generated+1} of ${lines.length}…`);
   try{const audio=await synthesize(cue.text,voice,progress);cue.voiceId=voice;cue.audio={id:audio.id,name:audio.name,mime:'audio/wav',duration:audio.duration};generated++;}
   catch(error){return {generated,failed:lines.length-generated,error:(error as Error).message};}
  }
  return {generated,failed:0,error:''};
 }catch(error){return {generated:0,failed:lines.length,error:(error as Error).message};}
 finally{release();}
}
