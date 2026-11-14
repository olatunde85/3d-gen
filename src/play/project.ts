import {storyMedia,parseStory,type StorySettings} from './story';
import {isGun,strongerWeapon,type Equipment,type Gun} from './weapons';
import {ENEMY_ROLES,roleDefaults,type EnemyHealth} from './enemy-roles';
/** Portable mission recipes. Version 1 single-enemy setups migrate into a version 2 squad. */
import {DEFAULT_PARAMS,PRESETS,type HumanParams} from '../core/params';
import type {Catalog} from '../core/assets';
import {readCharacterSettings} from '../app/character-file';
import {parseDriving,type DrivingSettings} from './driving';
import {defaultCity,parseCity,type CitySettings} from './city';
import {parseTheme,type GameTheme} from './theme';
import {parseGameName,parseHowToPlay} from './customize';
import {defaultMission,parseMission,validateMissionEquipment,type MissionSettings} from './mission';
import {AGGRESSION,MAX_ENEMIES,type EnemyRole} from './enemies';
import {defaultLoadout,parseLoadout,type Loadout,type EnemyResponse,type Health} from './combat';
import {defaultProgression,parseProgression,type ProgressionSettings} from './progression';
import {needsCompanion} from './objectives';
import {defaultCamera,parseCamera,defaultMusic,parseMusic,type CameraSettings,type MusicSettings} from './presentation';
import {parseMode,parseRace,parseRunner,type PlayMode,type RaceSettings,type RunnerSettings} from './arcade/modes';
export interface EnemySettings extends EnemyRole {character:HumanParams;response:EnemyResponse;health:EnemyHealth}
export interface CompanionSettings {character:HumanParams;health:Health}
export const defaultCompanion=():CompanionSettings=>({character:preset('The Female Executive'),health:100});
export const gameStem=(title:string)=>title.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'ara-game';
export interface GameIdentity {title:string;briefing:string;briefingIf?:{flag:string;text:string}}
export const defaultIdentity=():GameIdentity=>({title:'The Depot',briefing:''});
export function parseIdentity(raw:unknown):GameIdentity {
 if(raw===undefined)return defaultIdentity();if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Use a valid game title and briefing.');
 const p=raw as Record<string,unknown>;for(const key of Object.keys(p))if(!['title','briefing','briefingIf'].includes(key))throw Error(`Unsupported game identity setting: ${key}.`);
 const title=p.title===undefined?'The Depot':p.title,briefing=p.briefing===undefined?'':p.briefing;
 if(typeof title!=='string'||!title.trim()||title.trim().length>80)throw Error('Use a game title from 1 to 80 characters.');
 if(typeof briefing!=='string'||briefing.length>600)throw Error('Keep the game briefing within 600 characters.');
 const condition=p.briefingIf;if(condition!==undefined){if(!condition||typeof condition!=='object'||Array.isArray(condition)||Object.keys(condition).some(k=>!['flag','text'].includes(k))||typeof (condition as any).flag!=='string'||!/^[a-zA-Z0-9_-]{1,50}$/.test((condition as any).flag)||typeof (condition as any).text!=='string'||!(condition as any).text.trim()||(condition as any).text.length>600)throw Error('briefingIf needs a story flag and briefing text up to 600 characters.');}
 return {title:title.trim(),briefing,...(condition?{briefingIf:condition as GameIdentity['briefingIf']}:{})};
}
export interface PlayBranch {prompt:string;options:{label:string;next:string;flag:string}[]}
export function parseBranch(raw:unknown):PlayBranch|undefined{if(raw===undefined)return;if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Use a valid chapter branch.');const p=raw as Record<string,unknown>;if(Object.keys(p).some(k=>!['prompt','options'].includes(k))||typeof p.prompt!=='string'||!p.prompt.trim()||p.prompt.length>160||!Array.isArray(p.options)||p.options.length<2||p.options.length>3)throw Error('A chapter branch needs a prompt and two or three choices.');const options=p.options.map((item:unknown)=>{if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Use valid branch choices.');const o=item as Record<string,unknown>;if(Object.keys(o).some(k=>!['label','next','flag'].includes(k))||typeof o.label!=='string'||!o.label.trim()||o.label.length>80||typeof o.next!=='string'||!/^[a-zA-Z0-9_-]{1,50}$/.test(o.next)||typeof o.flag!=='string'||!/^[a-zA-Z0-9_-]{1,50}$/.test(o.flag))throw Error('Each branch choice needs a label, next chapter ID and story flag.');return {label:o.label.trim(),next:o.next,flag:o.flag};});if(new Set(options.map(o=>o.next)).size!==options.length||new Set(options.map(o=>o.flag)).size!==options.length)throw Error('Branch choices need different next chapters and story flags.');return {prompt:p.prompt.trim(),options};}
/** `mode` chooses the rules: a staged mission (default), an arcade race or an endless runner. Chapters share the game's mode. */
/** Shared character moments: a look-around before each chapter starts, and a dance on a win. Both default on. */
export interface PlayPoses {lookAround:boolean;dance:boolean}
export const posesOf=(p:{poses?:Partial<PlayPoses>}):PlayPoses=>({lookAround:p.poses?.lookAround!==false,dance:p.poses?.dance!==false});
function parsePoses(raw:unknown):PlayPoses{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('poses must be an object with lookAround and dance.');const r=raw as Record<string,unknown>;for(const key of Object.keys(r))if(key!=='lookAround'&&key!=='dance')throw Error(`Unsupported poses setting: ${key}.`);for(const key of ['lookAround','dance'])if(r[key]!==undefined&&typeof r[key]!=='boolean')throw Error(`poses.${key} must be true or false.`);return posesOf({poses:r as Partial<PlayPoses>});}
export interface PlayProject {poses?:PlayPoses;/** The game's colours, name and How to play text, shared by every chapter. */theme?:GameTheme;gameName?:string;howToPlay?:string;story?:StorySettings;branch?:PlayBranch;kind:'ara-play';version:2;template:'escape-depot';mode?:PlayMode;race?:RaceSettings;runner?:RunnerSettings;identity:GameIdentity;character:HumanParams;loadout:Loadout;enemies:EnemySettings[];companion:CompanionSettings;mission:MissionSettings;vehicle?:DrivingSettings;city?:CitySettings;progression:ProgressionSettings;camera:CameraSettings;music:MusicSettings;chapters?:PlayChapter[]}
export type PlayChapter=Omit<PlayProject,'kind'|'version'|'template'|'character'|'chapters'|'city'|'poses'|'theme'|'gameName'|'howToPlay'>&{id:string};
export const MAX_CHAPTERS=10;
/** A chapter plays its own mode, or the first chapter's mode when it names none. */
export const chapterMode=(root:{mode?:unknown},row:{mode?:unknown}):PlayMode=>parseMode(row.mode===undefined?root.mode:row.mode);
/** The settings a chapter inherits from the first chapter: race or runner settings carry over only within the same mode. */
export function chapterBase<T extends {mode?:unknown;race?:unknown;runner?:unknown;chapters?:unknown}>(root:T,row:{mode?:unknown}):T{const mode=chapterMode(root,row),{chapters,race,runner,...rest}=root;return {...rest,mode:mode==='mission'?undefined:mode,...(mode==='race'&&parseMode(root.mode)==='race'?{race}:{}),...(mode==='runner'&&parseMode(root.mode)==='runner'?{runner}:{})} as unknown as T;}
/** Only the settings that belong to a project's own mode. */
function modeOnly(p:PlayProject):PlayProject{const mode=p.mode??'mission';if(mode!=='race')delete p.race;if(mode!=='runner')delete p.runner;if(mode==='mission')delete p.mode;return p;}
export function heroGuns(p:PlayProject):Gun[]{const result=new Set<Gun>();for(const g of gameProjects(p)){if(isGun(g.loadout.weapon))result.add(g.loadout.weapon);if(g.progression.reward)result.add(g.progression.reward);if(g.progression.weapon!=='loadout')result.add(g.progression.unlock??'pistol');}return [...result];}
export const heroWeapon=(p:PlayProject):Equipment=>heroGuns(p).reduce<Equipment>((a,b)=>strongerWeapon(a,b),'none');
export function chapterProject(p:PlayProject,index:number):PlayProject{const {chapters,...base}=p;if(index===0)return base;const c=chapters?.[index-1];if(!c)throw Error('Choose an available chapter.');const {id,...settings}=c;return modeOnly({...chapterBase(base,c),...settings,mode:chapterMode(base,c)==='mission'?undefined:chapterMode(base,c),branch:c.branch,character:p.character});}
/** Chapters always record their mode, so a mission chapter stays a mission inside a race or runner game. */
export function chapterSettings(p:PlayProject,id:string):PlayChapter{const {kind,version,template,mode,character,chapters,city,poses,theme,gameName,howToPlay,...settings}=p;return {id,mode:mode??'mission',...settings};}
/** Race and runner games have no companion, whatever the stored mission settings say. */
export const castsCompanion=(p:PlayProject)=>(p.mode??'mission')==='mission'&&needsCompanion(p.mission);
export const gameProjects=(p:PlayProject)=>Array.from({length:1+(p.chapters?.length??0)},(_,i)=>chapterProject(p,i));
export function playable(p:HumanParams):HumanParams{return {...p,rig:'game',detail:'medium',restPose:'A',animations:true,vehicle:'none',weapon:'none',carry:['backpack','parachute'].includes(p.carry)?p.carry:'none'};}
export function preset(name:string):HumanParams {if(!Object.hasOwn(PRESETS,name))throw Error('Choose a character from the list.');return playable({...structuredClone(DEFAULT_PARAMS),...structuredClone(PRESETS[name]),name});}
export const defaultProject=():PlayProject=>({kind:'ara-play',version:2,template:'escape-depot',identity:defaultIdentity(),character:preset('The Prison Escapee'),loadout:defaultLoadout(),enemies:[{id:'enemy-1',aggression:'balanced',character:preset('The Soldier'),response:'capture',health:100}],companion:defaultCompanion(),mission:defaultMission(),city:defaultCity(),progression:defaultProgression(),camera:defaultCamera(),music:defaultMusic()});
/** New members copy the lead enemy; removing members preserves the remaining IDs and settings. */
export function resizeEnemies(project:PlayProject,count:number){
 if(!Number.isInteger(count)||count<1||count>MAX_ENEMIES)throw Error(`Use one to ${MAX_ENEMIES} enemies.`);
 project.enemies=project.enemies.slice(0,count);
 while(project.enemies.length<count){let n=1;while(project.enemies.some(e=>e.id===`enemy-${n}`))n++;project.enemies.push({...structuredClone(project.enemies[0]),id:`enemy-${n}`});}
 // A run's chaser and armed enemy must still be in the cast: a removed chaser falls back to the first enemy, a removed armed enemy to automatic.
 const r=project.runner,ids=project.enemies.map(e=>e.id);if(r){if(r.chaser!=='none'&&!ids.includes(r.chaser))r.chaser=ids[0];if(r.gunman&&!ids.includes(r.gunman))delete r.gunman;}
}
/** Arcade settings travel with their mode; a mission project carries neither. */
export function arcadeSettings(p:{mode?:unknown;race?:unknown;runner?:unknown},enemyIds:readonly string[]):Pick<PlayProject,'mode'|'race'|'runner'>{
 const mode=parseMode(p.mode);if(mode==='mission'){if(p.race!==undefined||p.runner!==undefined)throw Error('race and runner settings need mode "race" or "runner".');return {};}
 return mode==='race'?{mode,race:parseRace(p.race)}:{mode,runner:parseRunner(p.runner,enemyIds)};
}
export function parseProject(text:string,catalog:Catalog,validateCampaignLinks=true):PlayProject {
 if(text.length>512_000)throw Error('Choose a setup smaller than 512 KB.');const p=JSON.parse(text);
 if(!p||p.kind!=='ara-play'||![1,2].includes(p.version)||p.template!=='escape-depot')throw Error('Choose an Ara Play game setup (version 1 or 2).');
 const allowed=p.version===1?['kind','version','template','story','identity','difficulty','character','enemy','mission','loadout','companion','progression','camera','music','vehicle','city','chapters','branch']:['kind','version','template','mode','race','runner','story','identity','difficulty','character','enemies','mission','loadout','companion','progression','camera','music','vehicle','city','chapters','branch','poses','theme','gameName','howToPlay'];
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
 const loadout=parseLoadout(p.loadout),progression=parseProgression(p.progression),mission=parseMission(p.mission);validateMissionEquipment(mission,loadout,progression);if(mission.pursuit&&!enemies.some(e=>e.kind!=='sniper'))throw Error('Pursuit needs at least one ground enemy to drive the pickup.');if(p.vehicle?.model&&p.vehicle.model!=='pickup'&&(p.mode===undefined||p.mode==='mission')&&needsCompanion(mission))throw Error('Companion boarding currently needs the pickup vehicle.');
 if(progression.weapon!=='loadout'&&loadout.weapon!=='none')throw Error('Find / unlock pistol missions must start unarmed.');
 const result:PlayProject={kind:'ara-play',version:2,template:'escape-depot',...(p.story===undefined?{}:{story:parseStory(p.story,enemies.map(e=>e.id))}),...(p.branch===undefined?{}:{branch:parseBranch(p.branch)}),identity:parseIdentity(p.identity),...arcadeSettings(p,enemies.map(e=>e.id)),character,loadout,enemies,companion,mission,...(p.vehicle===undefined?{}:{vehicle:parseDriving(p.vehicle)}),city:parseCity(p.city),progression,camera:parseCamera(p.camera),music:parseMusic(p.music),...(p.poses===undefined?{}:{poses:parsePoses(p.poses)}),...(p.theme===undefined?{}:{theme:parseTheme(p.theme)}),...(p.gameName===undefined?{}:{gameName:parseGameName(p.gameName)}),...(p.howToPlay===undefined?{}:{howToPlay:parseHowToPlay(p.howToPlay)})};
 if(p.chapters!==undefined){
  if(!Array.isArray(p.chapters)||p.chapters.length<1||p.chapters.length>=MAX_CHAPTERS)throw Error(`A game supports one to ${MAX_CHAPTERS} chapters, including the first mission.`);
  const ids=new Set(['chapter-1']);result.chapters=p.chapters.map((c:unknown)=>{
   if(!c||typeof c!=='object'||Array.isArray(c))throw Error('Use a valid chapter.');const row={...c as Record<string,unknown>};
   // Hero moments, colours, the game name and How to play are shared: a chapter copy of them is ignored and the top-level setting applies.
   delete row.poses;delete row.theme;delete row.gameName;delete row.howToPlay;
   for(const field of Object.keys(row))if(!['id','story','identity','mission','enemies','companion','loadout','progression','vehicle','camera','music','branch','race','runner','mode'].includes(field))throw Error(`Unsupported chapter setting: ${field}. The player is shared by all chapters.`);
   if(typeof row.id!=='string'||!/^[a-zA-Z0-9_-]{1,50}$/.test(row.id)||ids.has(row.id))throw Error('Use unique chapter IDs; chapter-1 is reserved for the first mission.');ids.add(row.id);
   const suppliedLives=row.mission&&typeof row.mission==='object'?(row.mission as Record<string,unknown>).lives:undefined;if(suppliedLives!==undefined&&suppliedLives!==mission.lives)throw Error(`${row.id} › lives: shared across chapters. Set the life budget on the first mission.`);
   const {id,...patch}=row;try{const own=chapterMode(result,row),chapter=parseProject(JSON.stringify({...chapterBase(result,row),...patch,mode:own==='mission'?undefined:own,branch:undefined,character,mission:{...mission,...(row.mission as object??{})}}),catalog,false);modeOnly(chapter);if(row.branch!==undefined)chapter.branch=parseBranch(row.branch);chapter.mission.lives=mission.lives;return chapterSettings(chapter,id);}catch(error){throw Error(`${id} › ${(error as Error).message}`);}
  });
 }
 if(!validateCampaignLinks){storyMedia(result);return result;}
 const chapterIds=['chapter-1',...(result.chapters??[]).map(c=>c.id)],games=gameProjects(result),flagOrigins=new Map<string,number>();
 for(const [index,chapter]of games.entries())for(const option of chapter.branch?.options??[]){const target=chapterIds.indexOf(option.next);if(target<=index)throw Error(`${chapterIds[index]} › branch option "${option.label}": next must name a later chapter ID.`);if(flagOrigins.has(option.flag))throw Error(`${chapterIds[index]} › branch flag "${option.flag}" is already used by ${chapterIds[flagOrigins.get(option.flag)!]}.`);flagOrigins.set(option.flag,index);}
 for(const [index,chapter]of games.entries()){const flag=chapter.identity.briefingIf?.flag;if(flag!==undefined&&!(flagOrigins.has(flag)&&flagOrigins.get(flag)!<index))throw Error(`${chapterIds[index]} › briefingIf: flag "${flag}" must come from an earlier chapter branch.`);}
 storyMedia(result);return result;
}
