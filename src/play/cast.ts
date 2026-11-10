import {needsCompanion} from './objectives';
import {isGun,type Equipment,type Gun} from './weapons';
/** Prepare a complete cast atomically; identical recipes are generated once per update. */
import type {Character} from '../core/human';
import type {HumanParams} from '../core/params';
import type {Engine} from '../app/engine';
import {GameActor} from './actor';
import {heroWeapon,heroGuns,chapterProject,type PlayProject} from './project';
export interface PlayCast {hero:GameActor;heroWeapons?:Map<Gun,GameActor>;guards:Map<string,GameActor>;companion?:GameActor;chapters?:PlayCast[]}
export async function prepareCast(project:PlayProject,engine:Engine,texture:(file:string)=>string,progress:(text:string)=>void,previous?:PlayCast&{project:PlayProject},sharedHero?:GameActor):Promise<PlayCast>{
 const pool=new Map<string,Character>(),created:GameActor[]=[],recipe=(p:HumanParams)=>JSON.stringify(p);
 const equipped=(params:HumanParams,weapon:Equipment):HumanParams=>({...params,weapon});
 if(previous){pool.set(recipe(equipped(previous.project.character,heroWeapon(previous.project))),previous.hero.render.character);for(const enemy of previous.project.enemies){const actor=previous.guards.get(enemy.id);if(actor)pool.set(recipe(equipped(enemy.character,isGun(enemy.response)?enemy.response:'none')),actor.render.character);}}
 if(previous?.companion)pool.set(recipe(equipped(previous.project.companion.character,'none')),previous.companion.render.character);
 const build=async(params:HumanParams,oldParams:HumanParams|undefined,old:GameActor|undefined)=>{
  const key=recipe(params);if(old&&oldParams&&key===recipe(oldParams))return old;
  progress(`Preparing ${params.name||'character'}…`);let character=pool.get(key);if(!character){character=await engine.build(params);pool.set(key,character);}
  const actor=new GameActor(character,texture);created.push(actor);await actor.render.ready();return actor;
 };
 try{
  const hero=sharedHero??await build(equipped(project.character,heroWeapon(project)),previous?equipped(previous.project.character,heroWeapon(previous.project)):undefined,previous?.hero),guards=new Map<string,GameActor>();
  for(const enemy of project.enemies){const old=previous?.project.enemies.find(e=>e.id===enemy.id);guards.set(enemy.id,await build(equipped(enemy.character,isGun(enemy.response)?enemy.response:'none'),old?equipped(old.character,isGun(old.response)?old.response:'none'):undefined,previous?.guards.get(enemy.id)));}
  const companion=needsCompanion(project.mission)?await build(equipped(project.companion.character,'none'),previous?.companion?equipped(previous.project.companion.character,'none'):undefined,previous?.companion):undefined;
  return {hero,guards,companion};
 }catch(error){created.forEach(actor=>actor.dispose());throw error;}
}

export const castActors=(cast:PlayCast):Set<GameActor>=>new Set([cast.hero,...(cast.heroWeapons?.values()??[]),...cast.guards.values(),...(cast.companion?[cast.companion]:[]),...(cast.chapters??[]).flatMap(c=>[...castActors(c)])]);
export async function prepareGameCast(project:PlayProject,engine:Engine,texture:(file:string)=>string,progress:(text:string)=>void,previous?:PlayCast&{project:PlayProject}){
 const old=previous?castActors(previous):new Set<GameActor>();let root:PlayCast|undefined;const built:PlayCast[]=[];
 try{root=await prepareCast(project,engine,texture,progress,previous);built.push(root);const heroWeapons=new Map<Gun,GameActor>(),primary=heroWeapon(project);if(isGun(primary))heroWeapons.set(primary,root.hero);
  for(const gun of new Set<Gun>([...heroGuns(project),...(project.chapters?.length?['pistol','rifle']as const:[])]))if(!heroWeapons.has(gun)){const params={...project.character,weapon:gun},prior=previous?.heroWeapons?.get(gun);let actor=prior&&JSON.stringify(prior.render.character.params)===JSON.stringify(params)?prior:undefined;if(!actor){progress(`Preparing ${gun} equipment…`);actor=new GameActor(await engine.build(params),texture);built.push({hero:actor,guards:new Map()});await actor.render.ready();}heroWeapons.set(gun,actor);}root.heroWeapons=heroWeapons;const extra:PlayCast[]=[];
  for(let i=0;i<(project.chapters?.length??0);i++){progress(`Preparing chapter ${i+2} of ${project.chapters!.length+1}…`);const p=chapterProject(project,i+1),prior=previous?.chapters?.[i],oldProject=previous?.project.chapters?.[i]?chapterProject(previous.project,i+1):undefined,seed=prior&&oldProject?{...prior,project:oldProject}:{...root,project};const next=await prepareCast(p,engine,texture,progress,seed,root.hero);next.heroWeapons=heroWeapons;extra.push(next);built.push(next);}
  if(extra.length)root.chapters=extra;return root;
 }catch(error){for(const actor of new Set(built.flatMap(c=>[...castActors(c)])))if(!old.has(actor))actor.dispose();throw error;}
}
