import {storyMedia,parseStory,type StorySettings} from './story';
import {isGun,strongerWeapon,type Equipment,type Gun} from './weapons';
import {ENEMY_ROLES,roleDefaults,type EnemyHealth} from './enemy-roles';
/** Portable mission recipes. Version 1 single-enemy setups migrate into a version 2 squad. */
import {DEFAULT_PARAMS,PRESETS,type HumanParams} from '../core/params';
import type {Catalog} from '../core/assets';
import {readCharacterSettings} from '../app/character-file';
import {parseDriving,type DrivingSettings} from './driving';
import {defaultMission,parseMission,validateMissionEquipment,type MissionSettings} from './mission';
import {AGGRESSION,MAX_ENEMIES,type EnemyRole} from './enemies';
import {defaultLoadout,parseLoadout,type Loadout,type EnemyResponse,type Health} from './combat';
import {defaultProgression,parseProgression,type ProgressionSettings} from './progression';
import {defaultCamera,parseCamera,defaultMusic,parseMusic,type CameraSettings,type MusicSettings} from './presentation';
export interface EnemySettings extends EnemyRole {character:HumanParams;response:EnemyResponse;health:EnemyHealth}
export interface CompanionSettings {character:HumanParams;health:Health}
export const defaultCompanion=():CompanionSettings=>({character:preset('The Female Executive'),health:100});
export const gameStem=(title:string)=>title.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'ara-game';
export interface GameIdentity {title:string;briefing:string}
export const defaultIdentity=():GameIdentity=>({title:'The Depot',briefing:''});
export function parseIdentity(raw:unknown):GameIdentity {
 if(raw===undefined)return defaultIdentity();if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Use a valid game title and briefing.');
 const p=raw as Record<string,unknown>;for(const key of Object.keys(p))if(!['title','briefing'].includes(key))throw Error(`Unsupported game identity setting: ${key}.`);
 const title=p.title===undefined?'The Depot':p.title,briefing=p.briefing===undefined?'':p.briefing;
 if(typeof title!=='string'||!title.trim()||title.trim().length>80)throw Error('Use a game title from 1 to 80 characters.');
 if(typeof briefing!=='string'||briefing.length>600)throw Error('Keep the game briefing within 600 characters.');
 return {title:title.trim(),briefing};
}
export interface PlayProject {story?:StorySettings;kind:'ara-play';version:2;template:'escape-depot';identity:GameIdentity;character:HumanParams;loadout:Loadout;enemies:EnemySettings[];companion:CompanionSettings;mission:MissionSettings;vehicle?:DrivingSettings;progression:ProgressionSettings;camera:CameraSettings;music:MusicSettings;chapters?:PlayChapter[]}
export type PlayChapter=Omit<PlayProject,'kind'|'version'|'template'|'character'|'chapters'>&{id:string};
export const MAX_CHAPTERS=5;
export function heroGuns(p:PlayProject):Gun[]{const result=new Set<Gun>();for(const g of gameProjects(p)){if(isGun(g.loadout.weapon))result.add(g.loadout.weapon);if(g.progression.reward)result.add(g.progression.reward);if(g.progression.weapon!=='loadout')result.add(g.progression.unlock??'pistol');}return [...result];}
export const heroWeapon=(p:PlayProject):Equipment=>heroGuns(p).reduce<Equipment>((a,b)=>strongerWeapon(a,b),'none');
export function chapterProject(p:PlayProject,index:number):PlayProject{const {chapters,...base}=p;if(index===0)return base;const c=chapters?.[index-1];if(!c)throw Error('Choose an available chapter.');const {id,...settings}=c;return {...base,...settings,character:p.character};}
export function chapterSettings(p:PlayProject,id:string):PlayChapter{const {kind,version,template,character,chapters,...settings}=p;return {id,...settings};}
export const gameProjects=(p:PlayProject)=>Array.from({length:1+(p.chapters?.length??0)},(_,i)=>chapterProject(p,i));
export function playable(p:HumanParams):HumanParams{return {...p,rig:'game',detail:'medium',restPose:'A',animations:true,vehicle:'none',weapon:'none',carry:['backpack','parachute'].includes(p.carry)?p.carry:'none'};}
export function preset(name:string):HumanParams {if(!Object.hasOwn(PRESETS,name))throw Error('Choose a character from the list.');return playable({...structuredClone(DEFAULT_PARAMS),...structuredClone(PRESETS[name]),name});}
export const defaultProject=():PlayProject=>({kind:'ara-play',version:2,template:'escape-depot',identity:defaultIdentity(),character:preset('The Prison Escapee'),loadout:defaultLoadout(),enemies:[{id:'enemy-1',aggression:'balanced',character:preset('The Soldier'),response:'capture',health:100}],companion:defaultCompanion(),mission:defaultMission(),progression:defaultProgression(),camera:defaultCamera(),music:defaultMusic()});
/** New members copy the lead enemy; removing members preserves the remaining IDs and settings. */
export function resizeEnemies(project:PlayProject,count:number){
 if(!Number.isInteger(count)||count<1||count>MAX_ENEMIES)throw Error(`Use one to ${MAX_ENEMIES} enemies.`);
 project.enemies=project.enemies.slice(0,count);
 while(project.enemies.length<count){let n=1;while(project.enemies.some(e=>e.id===`enemy-${n}`))n++;project.enemies.push({...structuredClone(project.enemies[0]),id:`enemy-${n}`});}
}
export function parseProject(text:string,catalog:Catalog):PlayProject {
 if(text.length>512_000)throw Error('Choose a setup smaller than 512 KB.');const p=JSON.parse(text);
 if(!p||p.kind!=='ara-play'||![1,2].includes(p.version)||p.template!=='escape-depot')throw Error('Choose an Ara Play game setup (version 1 or 2).');
 const allowed=p.version===1?['kind','version','template','story','identity','difficulty','character','enemy','mission','loadout','companion','progression','camera','music','vehicle','chapters']:['kind','version','template','story','identity','difficulty','character','enemies','mission','loadout','companion','progression','camera','music','vehicle','chapters'];
 for(const key of Object.keys(p))if(!allowed.includes(key))throw Error(`Unsupported game setting: ${key}.`);
 // Older recipes split pursuit speed from aggression. Keep imports compatible,
 // but use one explicit aggression profile for new setups and live gameplay.
 if(p.difficulty!==undefined&&!['standard','relaxed'].includes(p.difficulty))throw Error('Unsupported legacy pursuit setting.');
 const read=(raw:unknown)=>playable(readCharacterSettings(JSON.stringify({kind:'ara-character',version:1,params:raw}),catalog));
 const character=read(p.character),raw=p.version===1?[{id:'enemy-1',aggression:p.difficulty==='relaxed'?'cautious':'balanced',character:p.enemy===undefined?preset('The Soldier'):p.enemy}]:p.enemies;
 if(!Array.isArray(raw)||raw.length<1||raw.length>MAX_ENEMIES)throw Error(`Use one to ${MAX_ENEMIES} enemies.`);
 const ids=new Set<string>();const enemies:EnemySettings[]=raw.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Use valid enemy settings.');
  for(const key of Object.keys(item))if(!['id','aggression','character','response','health','kind'].includes(key))throw Error(`Unsupported enemy setting: ${key}.`);
  if(typeof item.id!=='string'||!/^[a-zA-Z0-9_-]{1,50}$/.test(item.id)||ids.has(item.id)||['player','companion'].includes(item.id))throw Error('Enemy IDs must be unique and cannot be player or companion.');ids.add(item.id);
  if(typeof item.aggression!=='string'||!Object.hasOwn(AGGRESSION,item.aggression))throw Error('Choose Cautious, Balanced or Relentless aggression.');
  if(item.kind!==undefined&&(typeof item.kind!=='string'||!Object.hasOwn(ENEMY_ROLES,item.kind)))throw Error('Choose a supported enemy role.');
  const defaults=roleDefaults(item.kind??'guard'),response=item.response===undefined?defaults.response:item.response,health=item.health===undefined?defaults.health:item.health;
  if(response!=='capture'&&!isGun(response))throw Error('Choose capture, pistol or rifle pursuit.');if(![50,100,150,200,300].includes(health))throw Error('Choose 50, 100, 150, 200 or 300 enemy health.');if(item.kind&&item.kind!=='guard'&&response!=='rifle')throw Error('Specialist enemy roles use a rifle.');
  return {id:item.id,aggression:item.aggression as EnemySettings['aggression'],character:read(item.character),response,health,...(item.kind===undefined?{}:{kind:item.kind})};
 });
 if(enemies.filter(e=>e.kind==='sniper').length>2)throw Error('Use at most two elevated snipers.');
 let companion=defaultCompanion();if(p.companion!==undefined){const c=p.companion;if(!c||typeof c!=='object'||Array.isArray(c))throw Error('Use valid companion settings.');for(const key of Object.keys(c))if(!['character','health'].includes(key))throw Error(`Unsupported companion setting: ${key}.`);const health=c.health===undefined?100:c.health;if(![50,100,150].includes(health))throw Error('Choose 50, 100 or 150 companion health.');companion={character:read(c.character),health};}
 const loadout=parseLoadout(p.loadout),progression=parseProgression(p.progression),mission=parseMission(p.mission);validateMissionEquipment(mission,loadout,progression);if(mission.pursuit&&!enemies.some(e=>e.kind!=='sniper'))throw Error('Pursuit needs at least one ground enemy to drive the pickup.');
 if(progression.weapon!=='loadout'&&loadout.weapon!=='none')throw Error('Find / unlock pistol missions must start unarmed.');
 const result:PlayProject={kind:'ara-play',version:2,template:'escape-depot',...(p.story===undefined?{}:{story:parseStory(p.story,enemies.map(e=>e.id))}),identity:parseIdentity(p.identity),character,loadout,enemies,companion,mission,...(p.vehicle===undefined?{}:{vehicle:parseDriving(p.vehicle)}),progression,camera:parseCamera(p.camera),music:parseMusic(p.music)};
 if(p.chapters!==undefined){
  if(!Array.isArray(p.chapters)||p.chapters.length<1||p.chapters.length>=MAX_CHAPTERS)throw Error(`A game supports one to ${MAX_CHAPTERS} chapters, including the first mission.`);
  const ids=new Set(['chapter-1']);result.chapters=p.chapters.map((c:unknown)=>{
   if(!c||typeof c!=='object'||Array.isArray(c))throw Error('Use a valid chapter.');const row=c as Record<string,unknown>;
   for(const field of Object.keys(row))if(!['id','story','identity','mission','enemies','companion','loadout','progression','vehicle','camera','music'].includes(field))throw Error(`Unsupported chapter setting: ${field}. The player is shared by all chapters.`);
   if(typeof row.id!=='string'||!/^[a-zA-Z0-9_-]{1,50}$/.test(row.id)||ids.has(row.id))throw Error('Use unique chapter IDs; chapter-1 is reserved for the first mission.');ids.add(row.id);
   const suppliedLives=row.mission&&typeof row.mission==='object'?(row.mission as Record<string,unknown>).lives:undefined;if(suppliedLives!==undefined&&suppliedLives!==mission.lives)throw Error(`${row.id} › lives: shared across chapters. Set the life budget on the first mission.`);
   const {id,...patch}=row;try{const chapter=parseProject(JSON.stringify({...result,chapters:undefined,...patch,character,mission:{...mission,...(row.mission as object??{})}}),catalog);chapter.mission.lives=mission.lives;return chapterSettings(chapter,id);}catch(error){throw Error(`${id} › ${(error as Error).message}`);}
  });
 }
 storyMedia(result);return result;
}
