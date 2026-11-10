import type {Equipment} from './weapons';
/** Chapter-boundary progress is portable across reloads, scoped to the complete game recipe. */
import {heroGuns,type PlayProject} from './project';
export interface ChapterScore {title:string;score:number;elapsed:number;attempts:number;medals?:string[]}
export interface CampaignProgress {version:1;recipe:string;chapter:number;lives:number|null;weapon:Equipment;scores:ChapterScore[];complete:boolean}
export function campaignRecipe(project:PlayProject){return JSON.stringify(project);}
export function campaignKey(recipe:string){let h=2166136261;for(let i=0;i<recipe.length;i++)h=Math.imul(h^recipe.charCodeAt(i),16777619);return 'ara.play.campaign.'+(h>>>0).toString(36);}
export function readCampaign(source:string|null,project:PlayProject):CampaignProgress|undefined{
 if(!project.chapters?.length||!source)return;try{const p=JSON.parse(source),max=project.mission.lives==='unlimited'?null:project.mission.lives;if(p.version!==1||p.recipe!==campaignRecipe(project)||!Number.isInteger(p.chapter)||p.chapter<0||p.chapter>project.chapters.length||typeof p.complete!=='boolean'||!['none',...heroGuns(project)].includes(p.weapon)||p.lives!==null&&(!Number.isInteger(p.lives)||p.lives<0||max===null||p.lives>max)||p.lives===null&&max!==null||!Array.isArray(p.scores)||p.scores.length!==(p.complete?project.chapters.length+1:p.chapter)||p.scores.some((s:ChapterScore)=>!s||typeof s.title!=='string'||s.title.length>80||![s.score,s.elapsed,s.attempts].every(v=>Number.isFinite(v)&&v>=0)||!Number.isInteger(s.attempts)||s.medals!==undefined&&(!Array.isArray(s.medals)||s.medals.length>3||new Set(s.medals).size!==s.medals.length||s.medals.some(m=>!['No alarms','No damage','Under par'].includes(m)))))return;return p;}catch{return;}
}
