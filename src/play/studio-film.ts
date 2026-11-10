/** Render an Ara Studio project locally into portable story media. */
import {decodeCharacter} from '../app/share';
import type {Engine} from '../app/engine';
import type {AssetLibrary} from '../core/assets';
import {parseStudioInput} from '../studio/assist';
import {openAudioBundle} from '../studio/audio/bundle';
import {StudioActor} from '../studio/actor';
import {exportMovie} from '../studio/export';
import {StudioScene} from '../studio/scene';
import {importFilm} from './media';

export async function importStudioFilm(file:File,engine:Engine,library:AssetLibrary,progress:(message:string)=>void){
 if(file.size>128*1024*1024)throw Error('Choose a Studio project smaller than 128 MiB.');
 const bundle=/\.zip$/i.test(file.name)||file.type==='application/zip';
 if(!bundle&&file.size>100_000)throw Error('Choose Studio JSON smaller than 100 KB.');
 const project=bundle?await openAudioBundle(file,library.catalog):parseStudioInput(await file.text(),library.catalog);
 const scene=new StudioScene(document.createElement('canvas')),actors=new Map<string,StudioActor>();
 try{
  for(const [index,track]of project.actors.entries()){
   progress(`Building Studio character ${index+1} of ${project.actors.length}…`);
   const params=decodeCharacter(track.character,track.detail);if(!params)throw Error(`Studio character ${index+1} has an invalid recipe.`);
   const actor=new StudioActor(await engine.build({...params,rig:params.rig==='none'?'game':params.rig,animations:true}),name=>library.textureUrl(name));
   actors.set(track.id,actor);await actor.ready();
  }
  await scene.setActors(actors,project);
  progress('Rendering Studio film on this device…');
  const blob=await exportMovie(scene,project,{width:1280,height:720,bitrate:2_500_000,signal:new AbortController().signal,progress:(done,total)=>progress(`Rendering Studio film · ${Math.round(done/total*100)}%`)});
  return await importFilm(new File([blob],`${project.title||'Studio film'}.mp4`,{type:'video/mp4'}));
 }finally{const attached=new Set(scene.actors.values());scene.dispose();for(const actor of actors.values())if(!attached.has(actor))actor.dispose();}
}
