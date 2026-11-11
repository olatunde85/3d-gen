import {needsCompanion} from './objectives';
import type {Gun} from './weapons';
import type {Character} from '../core/human';
import {gameProjects,heroGuns,type PlayProject} from './project';
import type {PlayCast} from './cast';
import {GameActor} from './actor';
import {decodeCharacter} from './character-pack';
export interface BundleActor {role:'player'|'player-weapon'|'enemy'|'companion';id:string;asset:string}
export interface GameManifest {kind:'ara-play-game';version:1;actors:BundleActor[];chapters?:{id:string;actors:BundleActor[]}[]}
export const localAsset=(path:string)=>typeof path==='string'&&/^(characters|textures)\/[a-zA-Z0-9_-]+\.(pack|png|jpe?g|webp)$/.test(path);
export async function loadGameCast(manifest:GameManifest,project:PlayProject,base:URL,progress:(text:string)=>void):Promise<PlayCast>{
 if(manifest.kind!=='ara-play-game'||manifest.version!==1)throw Error('Choose a supported Ara game bundle.');
 const projects=gameProjects(project),lists=[manifest.actors,...(manifest.chapters??[]).map(c=>c.actors)];
 if(lists.length!==projects.length||manifest.chapters?.some((c,i)=>c.id!==project.chapters![i].id))throw Error('The chapter cast is incomplete.');
 lists.forEach((actors,i)=>{const p=projects[i],guns=heroGuns(project),expected=[['player','player'],...(guns.length>1?guns.map(g=>['player-weapon',g]):[]),...p.enemies.map(e=>['enemy',e.id]),...(needsCompanion(p.mission)?[['companion','companion']]:[])];if(!Array.isArray(actors)||actors.length!==expected.length||actors.length>9||expected.some(([role,id])=>actors.filter(a=>a.role===role&&a.id===id).length!==1)||actors.some(a=>!localAsset(a.asset)||!a.asset.startsWith('characters/'))||i>0&&actors.find(a=>a.role==='player')!.asset!==lists[0].find(a=>a.role==='player')!.asset)throw Error('The game cast is incomplete.');});
 const characters=new Map<string,Character>(),created:GameActor[]=[],pool=new Map<string,GameActor>(),casts:PlayCast[]=[];const total=lists.reduce((n,a)=>n+a.length,0);let done=0;
 try{
  for(const list of lists){let hero:GameActor|undefined,companion:GameActor|undefined;const guards=new Map<string,GameActor>(),heroWeapons=new Map<Gun,GameActor>();
   for(const item of list){progress(`Loading character ${++done} of ${total}…`);const key=item.role==='player'||item.role==='player-weapon'?`player/${item.asset}`:`${item.role}/${item.id}/${item.asset}`;let actor=pool.get(key);
    if(!actor){let character=characters.get(item.asset);if(!character){const response=await fetch(new URL(item.asset,base));if(!response.ok)throw Error(`Missing game asset: ${item.asset}`);character=decodeCharacter(new Uint8Array(await response.arrayBuffer()));characters.set(item.asset,character);}
     actor=new GameActor(character,file=>{if(!localAsset(file)||!file.startsWith('textures/'))throw Error('Use local game textures.');return new URL(file,base).href;});created.push(actor);await actor.render.ready();pool.set(key,actor);
    }
    if(item.role==='player')hero=actor;else if(item.role==='player-weapon'){if(actor.render.character.params.weapon!==item.id)throw Error('The bundled weapon variant does not match its role.');heroWeapons.set(item.id as Gun,actor);}else if(item.role==='companion')companion=actor;else guards.set(item.id,actor);
   }if(heroGuns(project).length===1)heroWeapons.set(heroGuns(project)[0],hero!);casts.push({hero:hero!,heroWeapons,guards,companion});
  }
  const root=casts[0];if(casts.length>1)root.chapters=casts.slice(1);return root;
 }catch(error){created.forEach(a=>a.dispose());throw error;}
}
