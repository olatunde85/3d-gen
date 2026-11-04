/** Restore the curated example's bundled takes before the normal dialogue preparation pass. */
import type { Catalog } from '../../core/assets';
import type { StudioProject } from '../project';
import { WAREHOUSE_EXAMPLE } from '../examples/warehouse';
import { getAsset, putAsset } from './assets';
import { openAudioBundle } from './bundle';
import { prepareDialogue, type SpeechPreparation } from './prepare';
import { MODEL_REVISION } from './tts';

const voices=new Map(WAREHOUSE_EXAMPLE.audio.speech.map(cue=>[cue.asset,cue]));
export async function prepareExampleDialogue(project:StudioProject,catalog:Catalog,options:SpeechPreparation){
  const ids=[...new Set(project.audio.speech.map(c=>c.asset).filter((id):id is string=>!!id&&voices.has(id)))];
  if(!project.audio.muted&&ids.length){
    let missing=false;
    for(const id of ids){options.signal.throwIfAborted();if(!await getAsset(id))missing=true;}
    if(missing){
      options.progress('Loading the example’s recorded dialogue…');
      const url=new URL(`${import.meta.env.BASE_URL}media/examples/warehouse.ara-studio.zip`,location.href);
      const response=await fetch(url,{signal:options.signal});
      if(!response.ok)throw Error('The example dialogue could not be loaded. Check your connection and retry.');
      const blob=await response.blob();options.signal.throwIfAborted();
      await openAudioBundle(new File([blob],'warehouse.ara-studio.zip',{type:'application/zip'}),catalog);
    }
    for(const id of ids){
      options.signal.throwIfAborted();const asset=await getAsset(id),cue=voices.get(id)!;
      // Provenance lets edited example lines regenerate instead of retaining the old recording.
      if(asset&&!asset.speech)await putAsset(asset.blob,asset.name,asset.duration,asset.sampleRate,asset.channels,{text:cue.text,voice:cue.voice,model:MODEL_REVISION});
    }
  }
  return prepareDialogue(project,options);
}
