/** Render an Ara Studio project locally into portable story media. */
import {decodeCharacter} from '../app/share';
import type {Engine} from '../app/engine';
import type {AssetLibrary} from '../core/assets';
import {loadStudioFilm} from '../studio/assist';
import {restorePacks} from '../app/packs/store';
import {MAX_FILM_SIZE} from '../studio/film';
import type {StudioProject} from '../studio/project';
import {openAudioBundle} from '../studio/audio/bundle';
import {StudioActor} from '../studio/actor';
import {exportFilm} from '../studio/export';
import {StudioScene} from '../studio/scene';
import {importFilm} from './media';
import {adultReason} from './publish-guard';

export async function importStudioFilm(file:File,engine:Engine,library:AssetLibrary,progress:(message:string)=>void){
 if(file.size>128*1024*1024)throw Error('Choose a Studio project smaller than 128 MiB.');
 const bundle=/\.zip$/i.test(file.name)||file.type==='application/zip';
 if(!bundle&&file.size>MAX_FILM_SIZE)throw Error('Choose Studio JSON smaller than 500 KB.');
 // Films can use content packs: the ones kept in this browser, and any the film lists by address.
 await restorePacks();
 const parsed=bundle?await openAudioBundle(file,library.catalog):await loadStudioFilm(await file.text(),library.catalog);
 // Games are made to be shared: films with 18+ characters stay in Studio.
 for(const track of parsed.flatMap(s=>s.actors)){const adult=adultReason(decodeCharacter(track.character,track.detail)??undefined);if(adult)throw Error(`${adult}. Films with 18+ characters can't be attached to games.`);}
 // Scripted lines without recorded audio are voiced on this device first, as Studio does before an export.
 const {hasScriptedSpeech,prepareDialogue}=await import('../studio/audio/prepare');
 const scenes:StudioProject[]=[];
 for(const s of parsed)scenes.push(hasScriptedSpeech(s)?await prepareDialogue(s,{signal:new AbortController().signal,progress:message=>progress(`Generating dialogue · ${message}`)}):s);
 const scene=new StudioScene(document.createElement('canvas')),built=new Map<string,StudioActor>(),many=scenes.length>1;
 // One built character serves every scene it appears in.
 const cast=async(index:number)=>{
  const project=scenes[index],actors=new Map<string,StudioActor>(),used=new Set<StudioActor>();
  for(const [i,track]of project.actors.entries()){
   const recipe=`${track.detail}:${track.character}`;let actor=[...built.entries()].find(([key,a])=>key.startsWith(recipe+'#')&&!used.has(a))?.[1];
   if(!actor){
    progress(`Building Studio character ${i+1} of ${project.actors.length}${many?` · scene ${index+1}`:''}…`);
    const params=decodeCharacter(track.character,track.detail);if(!params)throw Error(`Studio character ${i+1} has an invalid recipe.`);
    actor=new StudioActor(await engine.build({...params,rig:params.rig==='none'?'game':params.rig,animations:true}),name=>library.textureUrl(name));
    built.set(`${recipe}#${built.size}`,actor);await actor.ready();
   }
   used.add(actor);actors.set(track.id,actor);
  }
  await scene.setActors(actors,project,()=>{});
 };
 try{
  await cast(0);
  progress('Rendering Studio film on this device…');
  const blob=await exportFilm(scene,scenes,{width:1280,height:720,bitrate:2_500_000,signal:new AbortController().signal,prepare:cast,progress:(done,total)=>progress(`Rendering Studio film · ${Math.round(done/total*100)}%`)});
  return await importFilm(new File([blob],`${scenes[0].title||'Studio film'}.mp4`,{type:'video/mp4'}));
 }finally{scene.actors.clear();scene.dispose();for(const actor of built.values())actor.dispose();}
}
